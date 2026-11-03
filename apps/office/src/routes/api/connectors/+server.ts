// Tools a staffer could be given: the office catalog, plus the public MCP
// Registry when there is a search.
import { json } from '@sveltejs/kit';
import { catalog, searchRegistry } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  const own = (await catalog()).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind,
    ready: !!c.readyAt
  }));
  let registry: Awaited<ReturnType<typeof searchRegistry>> = [];
  let problem: string | undefined;
  if (q)
    try {
      registry = (await searchRegistry(q)).filter((c) => !own.some((o) => o.id === c.registry));
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
  return json({ catalog: own, registry, problem });
};
