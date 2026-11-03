// A staffer's token use over the last day, week and month, and the owner's plan
// windows, which every staffer shares.
import { json } from '@sveltejs/kit';
import { plan, usageFor } from '@oddboro/ledger';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) =>
  json({ ...(await usageFor(params.id)), plan: await plan() });
