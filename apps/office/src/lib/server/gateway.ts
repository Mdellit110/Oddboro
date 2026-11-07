// The gateway between an Odd's run and the outside tools it holds. A run
// never gets an outside server's address, key or sign-in: it gets one address
// per tool on the office itself (`/api/gateway/<connector>`) and a token that
// lives only as long as the run. The office holds the keys, connects to the
// real server (`upstream` in access.ts), lists only the tools the grant
// reaches, and refuses a call to any other. Read only reaches the tools that
// pass `readsOnly` now, as the server marks them on this run, and that the
// connector's stored list still names; Read and write reaches every tool. The
// tool a run goes through (Claude Code, Codex, Grok) still gets its own
// per-tool allow list too, so either one alone holds.
import { randomBytes } from 'node:crypto';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from '@modelcontextprotocol/sdk/types.js';
import {
  connector,
  narrowReadTools,
  OFFICE_URL,
  readsOnly,
  type ConnectorRow,
  type Level
} from '@oddboro/ledger';
import { upstream } from './access.ts';

export const GATEWAY_PATH = '/api/gateway';

/** One outside tool a run holds, its connection made on first use and kept for the run. */
type Held = { level: Level; client?: Promise<Client>; tools?: Promise<Tool[]> };
type GatewayRun = { held: Map<string, Held>; until: number };

/**
 * Runs going, by token. Each goes when its run ends, or at the latest when its
 * time is up. Kept on the process, not the module: in development Vite reloads
 * the server's code under a running office, and a run the old code opened was
 * refused by the new code's guard (403) until the office restarted.
 */
const runs: Map<string, GatewayRun> = ((
  globalThis as { oddboroGatewayRuns?: Map<string, GatewayRun> }
).oddboroGatewayRuns ??= new Map());

/** A server entry as a run's tool takes it: Claude Code's --mcp-config, Codex's and Grok's alike. */
export type GatewayServer = { type: 'http'; url: string; headers: Record<string, string> };

/**
 * Open the gateway for one run: a token, and one server entry per outside
 * tool, each pointing at the office. `ms` is the run's own time limit, after
 * which the token stops working even if the run never said it ended.
 */
export function openGateway(
  grants: { connector: ConnectorRow; level: Level }[],
  ms: number
): { token: string; servers: Record<string, GatewayServer> } {
  const now = Date.now();
  for (const [t, r] of runs) if (r.until < now) void closeGateway(t);
  const token = randomBytes(32).toString('base64url');
  runs.set(token, {
    held: new Map(grants.map((g) => [g.connector.id, { level: g.level }])),
    until: now + ms + 60_000
  });
  const servers = Object.fromEntries(
    grants.map((g) => [
      g.connector.id,
      {
        type: 'http' as const,
        url: `${OFFICE_URL}${GATEWAY_PATH}/${encodeURIComponent(g.connector.id)}`,
        headers: { Authorization: `Bearer ${token}` }
      }
    ])
  );
  return { token, servers };
}

/** The run ended: its token stops working and its connections close. */
export async function closeGateway(token: string): Promise<void> {
  const r = runs.get(token);
  runs.delete(token);
  if (!r) return;
  await Promise.all(
    [...r.held.values()].map((h) => h.client?.then((c) => c.close()).catch(() => {}))
  );
}

/** The run a request comes from, by its token, while it is going. */
function runOf(request: Request): GatewayRun | undefined {
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  const r = token ? runs.get(token) : undefined;
  return r && r.until >= Date.now() ? r : undefined;
}

/** Whether a request carries a going run's token: the office's guard lets it through to the gateway. */
export const fromRun = (request: Request): boolean => !!runOf(request);

function clientOf(c: ConnectorRow, h: Held): Promise<Client> {
  h.client ??= upstream(c).catch((e: unknown) => {
    h.client = undefined;
    throw e;
  });
  return h.client;
}

/** Every tool the server lists, once per run. */
function listed(c: ConnectorRow, h: Held): Promise<Tool[]> {
  h.tools ??= clientOf(c, h)
    .then((client) => client.listTools())
    .then((r) => r.tools)
    .catch((e: unknown) => {
      h.tools = undefined;
      throw e;
    });
  return h.tools;
}

/**
 * The tools this grant reaches on this run. A stored Read only tool the
 * server no longer marks as reading, or whose name says it changes something,
 * leaves the stored list too, with a line in the Ledger (`narrowReadTools`).
 */
export async function reachable(c: ConnectorRow, h: Held): Promise<Tool[]> {
  const tools = await listed(c, h);
  if (h.level === 'act') return tools;
  const named = tools.filter((t) => c.readTools.includes(t.name));
  const gone = named.filter((t) => !readsOnly(t)).map((t) => t.name);
  if (gone.length) await narrowReadTools(c.id, gone);
  return named.filter(readsOnly);
}

const refusal = (text: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text }]
});

/** Answer one request from a run's tool to the outside tool `id`. */
export async function gateway(request: Request, id: string): Promise<Response> {
  const run = runOf(request);
  if (!run) return new Response('This run has ended, or never started', { status: 401 });
  const h = run.held.get(id);
  const c = h && (await connector(id));
  if (!h || !c) return new Response('This run does not hold that tool', { status: 403 });

  const server = new Server(
    { name: `oddboro-gateway-${id}`, version: '1.0.0' },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await reachable(c, h) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    if (!(await reachable(c, h)).some((t) => t.name === name))
      return refusal(
        h.level === 'act'
          ? `${c.name} has no tool named ${name}.`
          : `${name} is not one you may use. Your ${c.name} access is Read only, which reaches only the tools ${c.name} marks as only reading. Ask the owner for Read and write if the work needs it.`
      );
    const client = await clientOf(c, h);
    // As long as the run itself may take: the run's own time limit ends it first.
    return (await client.callTool({ name, arguments: req.params.arguments }, undefined, {
      timeout: Math.max(60_000, run.until - Date.now())
    })) as CallToolResult;
  });
  // A new server and transport per request, with no session: the run's state
  // (its token, connections and tool list) lives here, not in the transport.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}
