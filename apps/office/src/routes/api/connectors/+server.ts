// Tools a staffer could be given: the office catalog, plus the public MCP
// Registry when there is a search.
import { json } from '@sveltejs/kit';
import { catalog, GOOGLE, searchRegistry } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim() ?? '';
  const own = (await catalog()).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    kind: c.kind,
    ready: !!c.readyAt,
    /** A hosted server named by its address, so the owner picks how it lets the office in. */
    byAddress: c.kind === 'http' && !c.registry,
    keyHeader: c.config.oauth ? undefined : c.config.headers?.[0],
    /** A Google connector's product, its plain name and signed-in address, so the owner can add another account. */
    google: c.config.google
      ? {
          product: c.config.google,
          name: GOOGLE[c.config.google].name,
          account: c.config.account
        }
      : undefined
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
