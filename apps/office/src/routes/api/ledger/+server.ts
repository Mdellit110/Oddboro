// Search the ledger: by meaning when there is a query, newest first when not.
import { json } from '@sveltejs/kit';
import { searchLedger, type LedgerKind } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

const KINDS: LedgerKind[] = ['decision', 'work', 'report', 'hire', 'access'];

export const GET: RequestHandler = async ({ url }) => {
  const kind = url.searchParams.get('kind') as LedgerKind | null;
  const who = url.searchParams.get('who');
  return json(
    await searchLedger(url.searchParams.get('q') ?? '', {
      kind: kind && KINDS.includes(kind) ? kind : undefined,
      actor: who || undefined,
      limit: 50
    })
  );
};
