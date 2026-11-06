// An Odd's run reaching one of its outside tools. Only a going run's token
// gets past the office's guard to here (`fromRun`); the gateway checks it
// again, and passes on only the tools the run's grant reaches (gateway.ts).
import { gateway } from '#lib/server/gateway.ts';
import type { RequestHandler } from './$types';

const answer: RequestHandler = ({ params, request }) => gateway(request, params.connector);

export const GET = answer;
export const POST = answer;
export const DELETE = answer;
