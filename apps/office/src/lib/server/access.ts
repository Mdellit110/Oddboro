// The steps of connecting a tool that the office does itself: a hosted
// server's sign-in, and starting a server to list its tools. `upstream` is
// the one way the office reaches an outside server, here and in the gateway
// every run goes through (gateway.ts).
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  connector,
  connectorReady,
  readsOnly,
  setConnectorConfig,
  tickKey,
  toolCommand,
  type ConnectorRow,
  type GoogleProduct
} from '@oddboro/ledger';
import { getSecret, headerSecret } from './keychain.ts';
import { driveServer } from './google/drive.ts';
import { gmailServer } from './google/gmail.ts';
import { bearer, startSignIn } from './oauth.ts';
import { outsideToolEnv } from './run-env-allow.ts';

export type ToolInfo = { name: string; description: string; readOnly: boolean };

/**
 * Connect to an outside server with its keys and sign-in, which stay in the
 * office. `open` leaves the sign-in out, to see whether it needs one.
 */
export async function upstream(c: ConnectorRow, open = false): Promise<Client> {
  let transport: StdioClientTransport | StreamableHTTPClientTransport;
  switch (c.kind) {
    case 'builtin':
      return builtin(c);
    case 'http':
      // A hosted connector is saved with its address (registry.ts).
      transport = new StreamableHTTPClientTransport(new URL(c.config.url!), {
        requestInit: {
          headers: {
            ...Object.fromEntries((c.config.headers ?? []).map((n) => [n, headerSecret(c.id, n)])),
            ...(c.config.oauth && !open ? { Authorization: `Bearer ${await bearer(c.id)}` } : {})
          }
        }
      });
      break;
    case 'stdio':
      transport = new StdioClientTransport({
        ...toolCommand(c.config.command!, c.config.args ?? []),
        // Only what a run may have of the office's environment, as when the
        // run's own tool started the server, and the connector's own secrets.
        env: {
          ...outsideToolEnv(),
          ...Object.fromEntries((c.config.secrets ?? []).map((n) => [n, getSecret(c.id, n) ?? '']))
        },
        stderr: 'ignore'
      });
      break;
    default: {
      const missed: never = c.kind;
      throw new Error(`No way to start a ${String(missed)} connector`);
    }
  }
  const client = new Client({ name: 'oddboro-office', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

/** The servers the office serves itself, by the Google product a connector serves. */
const BUILTIN: Record<
  GoogleProduct,
  (token: () => Promise<string>, account?: string) => McpServer
> = {
  gmail: gmailServer,
  drive: driveServer
};

/**
 * A server the office serves itself, inside this process: Gmail and Google
 * Drive, one server per account, whose tools name the account they reach.
 * Each call asks `bearer` for a live token, so the Google sign-in never
 * leaves the office, not even to a process of its own.
 */
async function builtin(c: ConnectorRow): Promise<Client> {
  const make = c.config.google && BUILTIN[c.config.google];
  if (!make) throw new Error(`The office serves no tool named ${c.id}`);
  const token = async () => {
    const t = await bearer(c.id);
    if (!t) throw new Error(`${c.name} needs signing in again. Call reconnect_access.`);
    return t;
  };
  const [ours, theirs] = InMemoryTransport.createLinkedPair();
  await make(token, c.config.account).connect(theirs);
  const client = new Client({ name: 'oddboro-office', version: '1.0.0' });
  await client.connect(ours);
  return client;
}

/** Start a connector with its secrets and list its tools, marking the ones a Read only grant reaches (`readsOnly`). */
export async function listTools(id: string, open = false): Promise<ToolInfo[]> {
  const c = await connector(id);
  if (!c) throw new Error(`No connector named ${id}`);
  const client = await upstream(c, open);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      readOnly: readsOnly(t)
    }));
  } finally {
    await client.close();
  }
}

/**
 * The owner confirmed the tools: the connector is ready. The office lists
 * them again itself and works out which ones Read only reaches, so nothing
 * the page sends can add a tool that changes something.
 */
export async function confirmTools(id: string): Promise<void> {
  const tools = await listTools(id);
  await connectorReady(
    id,
    tools.map((t) => t.name),
    tools.filter((t) => t.readOnly).map((t) => t.name)
  );
}

/**
 * Start a hosted server's sign-in. Returns the page to open in the owner's browser.
 * A server that turns out to need no sign-in is marked open and the step ticks.
 */
export async function hostedSignIn(id: string): Promise<{ url?: string }> {
  try {
    return await startSignIn(id);
  } catch (signInError) {
    // A Google tool always needs its sign-in: listing its tools takes none, so
    // the check below would wrongly mark it open.
    if ((await connector(id))?.config.oauth === 'google') throw signInError;
    try {
      await listTools(id, true);
    } catch {
      // Neither a sign-in nor an open door: most likely it takes a key.
      const why = signInError instanceof Error ? signInError.message : String(signInError);
      throw new Error(
        `This server did not offer a sign-in${why ? ` (${why})` : ''}. If its setup guide gives you a key instead, open the Odd's Settings, then Services, click + Add service, paste the server's address, and pick Takes a key.`
      );
    }
    const c = await connector(id);
    if (c) await setConnectorConfig(id, { ...c.config, oauth: false });
    await tickKey(`oauth:${id}`);
    return {};
  }
}
