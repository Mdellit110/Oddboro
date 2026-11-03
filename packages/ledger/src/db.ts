// One connection pool per process. The office app, the staff tool server and
// the scripts all reach Postgres through this file. DATABASE_URL comes from the
// environment, or from the repo's .env, which fills in anything not already set.
// With neither, the office keeps its own database (local-db.ts), which the
// office server starts and everything else reaches over a local socket.
// ODDBORO_ENV names another .env, to try an office out beside the real one.
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ENV_FILE as ENV } from './env.ts';
import { DATABASE_PORT, home } from './home.ts';
import * as schema from './schema.ts';

if (existsSync(ENV)) process.loadEnvFile(ENV);

export const LOCAL_DATABASE_DIR = home('db');
export const LOCAL_DATABASE_PORT = DATABASE_PORT;
/**
 * True when the office keeps its own database rather than one .env names. It
 * goes in the environment too, so a second load of this file, or a process
 * this one starts, reads the same answer after DATABASE_URL is filled in.
 */
export const LOCAL = !process.env.DATABASE_URL || process.env.ODDBORO_LOCAL_DB === '1';
export const DATABASE_URL =
  process.env.DATABASE_URL ||
  `postgres://postgres:postgres@127.0.0.1:${LOCAL_DATABASE_PORT}/postgres`;
process.env.DATABASE_URL = DATABASE_URL;
if (LOCAL) process.env.ODDBORO_LOCAL_DB = '1';
// One pool per process, even when Vite reloads this file in development: a
// new pool on every reload, with the old ones still open, used up every
// connection the office's own database takes.
const g = globalThis as unknown as { oddboroSql?: ReturnType<typeof postgres> };
export const sql = (g.oddboroSql ??= postgres(DATABASE_URL, { max: 5, onnotice: () => {} }));
export const db = drizzle(sql, { schema, casing: 'snake_case' });
