// Brings the database up to date. Run with `npm run db:migrate` from the repo
// root. The office keeps its own database inside the office server, so with
// no DATABASE_URL in .env the office has to be running.
import { sql } from './db.ts';
import { bringUpToDate } from './upgrade.ts';

await bringUpToDate();
await sql.end();
console.log('ledger: up to date');
