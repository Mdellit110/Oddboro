// Finding MCP servers a staffer could use, in the office catalog first and
// then the public MCP Registry. Only the search words leave the Mac.
import { addConnector, connector, type ConnectorRow } from './office.ts';
import type { ConnectorConfig, ConnectorKind } from './schema.ts';

const REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers';

type Env = { name: string; description?: string; isRequired?: boolean; isSecret?: boolean };
type RegistryServer = {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  repository?: { url?: string };
  packages?: {
    registryType?: string;
    identifier?: string;
    version?: string;
    transport?: { type?: string };
    environmentVariables?: Env[];
  }[];
  remotes?: { type?: string; url?: string; headers?: Env[] }[];
};

/** A registry server, turned into what the office needs to run it. */
export type Candidate = {
  registry: string;
  name: string;
  description: string;
  repository?: string;
  kind?: ConnectorKind;
  config?: ConnectorConfig;
  /** Why the office cannot run it yet, when it cannot. */
  unsupported?: string;
};

/** "net.todoist/mcp" reads as "Todoist", "io.github.acme/notes-mcp" as "Notes". */
export function displayName(registry: string): string {
  const [space, server = ''] = registry.split('/');
  const generic = /^(mcp|server|mcp-server)$/i;
  const words = (generic.test(server) ? (space.split('.').pop() ?? space) : server)
    .replace(/(^|-)(mcp|server)(-|$)/gi, ' ')
    .replace(/[-_]+/g, ' ')
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : registry;
}

function toCandidate(s: RegistryServer): Candidate {
  const base = {
    registry: s.name,
    name: s.title || displayName(s.name),
    description: s.description ?? '',
    repository: s.repository?.url
  };
  for (const p of s.packages ?? []) {
    if (p.transport?.type && p.transport.type !== 'stdio') continue;
    const secrets = (p.environmentVariables ?? [])
      .filter((e) => e.isRequired || e.isSecret)
      .map((e) => e.name);
    const pin = p.version ? p.version : undefined;
    if (p.registryType === 'npm' && p.identifier)
      return {
        ...base,
        kind: 'stdio',
        config: {
          command: 'npx',
          args: ['-y', pin ? `${p.identifier}@${pin}` : p.identifier],
          secrets
        }
      };
    if (p.registryType === 'pypi' && p.identifier)
      return {
        ...base,
        kind: 'stdio',
        config: { command: 'uvx', args: [pin ? `${p.identifier}==${pin}` : p.identifier], secrets }
      };
  }
  for (const r of s.remotes ?? [])
    if (r.url && (r.type === 'streamable-http' || r.type === 'http'))
      return {
        ...base,
        kind: 'http',
        config: {
          url: r.url,
          headers: (r.headers ?? []).filter((h) => h.isSecret || h.isRequired).map((h) => h.name),
          // No key in a header usually means the service signs in with OAuth.
          oauth: !(r.headers ?? []).some((h) => h.isSecret || h.isRequired)
        }
      };
  return {
    ...base,
    unsupported: 'It ships in a form the office cannot run yet (not npm, PyPI or HTTP).'
  };
}

export async function searchRegistry(query: string, limit = 8): Promise<Candidate[]> {
  const url = `${REGISTRY}?version=latest&limit=${limit}&search=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`The MCP Registry answered ${res.status}`);
  const body = (await res.json()) as { servers: { server: RegistryServer }[] };
  return body.servers.map((s) => toCandidate(s.server));
}

/** One registry server by its exact name. */
export async function fromRegistry(name: string): Promise<Candidate | undefined> {
  for (const words of [name, name.split('/').pop() ?? name]) {
    const hit = (await searchRegistry(words, 50)).find((c) => c.registry === name);
    if (hit) return hit;
  }
  return undefined;
}

/** A catalog id for a registry name: io.github.acme/notes becomes acme-notes. */
export const connectorId = (registry: string) =>
  registry
    .replace(/^io\.github\./, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** A catalog connector by id, or a registry server added to the catalog by its name. */
export async function ensureConnector(
  wanted: string
): Promise<{ connector?: ConnectorRow; problem?: string }> {
  const own = await connector(wanted);
  if (own) return { connector: own };
  if (/^https:\/\/\S+$/.test(wanted)) {
    // A hosted server the owner named by its address, not in the registry.
    const url = new URL(wanted);
    return {
      connector: await addConnector({
        id: connectorId(`${url.hostname}${url.pathname}`),
        name: url.hostname.replace(/^(www|mcp|api)\./, ''),
        description: `Hosted MCP server at ${url.href}`,
        kind: 'http',
        config: { url: url.href, oauth: true }
      })
    };
  }
  const c = await fromRegistry(wanted);
  if (!c) return { problem: `No catalog id or registry server is named "${wanted}".` };
  if (c.unsupported || !c.kind || !c.config)
    return { problem: `The office cannot run ${c.registry}: ${c.unsupported}` };
  return {
    connector: await addConnector({
      id: connectorId(c.registry),
      name: c.name,
      description: c.description,
      kind: c.kind,
      config: c.config,
      registry: c.registry
    })
  };
}
