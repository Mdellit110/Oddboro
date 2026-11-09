// Every owner route that changes something is declared in OWNER_ACTIONS, and
// each that says it records writes exactly one ledger row of its kind. Of the
// rows that write none, only those in CHANGES are driven.
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PATCH_KEY, STAFF_PATCH_KEYS } from '@oddboro/ledger/grantable';
import { FLOORS, GROUNDS, WALLS, type OfficeSpec } from '@oddboro/world';
import { OFFICE_TOOLS } from '@oddboro/ledger/tools';
import {
  L,
  currentOffice,
  goal,
  ownerHome,
  request,
  secrets,
  type Call
} from './office-under-test.ts';
import { OWNER_ACTIONS, type Recording } from './owner-actions.ts';

const ROUTES = fileURLToPath(new URL('../../routes', import.meta.url));
const ACTIONS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const STAFF = '/api/staff/[id]';

/** Each route under src/routes with this file (`+server.ts` or `+page.server.ts`), by its route id. */
function routeIds(file: string, dir = ROUTES): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeIds(file, path);
    return name === file ? [`/${relative(ROUTES, dir).split('\\').join('/')}`] : [];
  });
}

/**
 * Every action the owner's page can take, as OWNER_ACTIONS keys them. A GET
 * only reads, unless OWNER_ACTIONS declares it: a page's `load` or a GET
 * handler that changes something is declared by hand, and counts here only
 * while that handler exists.
 */
async function handlers(): Promise<string[]> {
  const declaredGet = (route: string) => `GET ${route}` in OWNER_ACTIONS;
  const exports = async (route: string, file: string) =>
    (await import(join(ROUTES, route, file))) as Record<string, unknown>;
  const keys: string[] = [];
  for (const route of routeIds('+page.server.ts').filter(declaredGet))
    if ('load' in (await exports(route, '+page.server.ts'))) keys.push(`GET ${route}`);
  for (const route of routeIds('+server.ts')) {
    const module = await exports(route, '+server.ts');
    if ('GET' in module && declaredGet(route)) keys.push(`GET ${route}`);
    for (const method of ACTIONS.filter((m) => m in module)) {
      if (method === 'PATCH' && route === STAFF)
        keys.push(
          ...STAFF_PATCH_KEYS.filter((k) => PATCH_KEY[k] !== 'qualifier').map(
            (k) => `PATCH ${STAFF}#${k}`
          )
        );
      else keys.push(`${method} ${route}`);
    }
  }
  return keys.sort();
}

const managers = L.MANAGERS.filter((m) => m.look);
/** A ready-made manager's look, each used once, so no look is refused as taken. */
function look() {
  const m = managers.shift();
  assert.ok(m?.look, 'no ready-made look is left');
  return { look: m.look, portraitPx: L.managerPortrait(m.id), id: m.id };
}

const spec: OfficeSpec = {
  name: 'Test office',
  wall: WALLS[0],
  floor: FLOORS[0],
  grounds: GROUNDS[0],
  rooms: [
    { kind: 'lobby', name: 'Lobby' },
    { kind: 'office', name: 'Owner' },
    { kind: 'workspace', name: 'Desks', seats: 4 },
    { kind: 'kitchen', name: 'Kitchen' }
  ]
};

const askOf = async (title: string) =>
  (await L.raiseAsk('lead', { title, why: 'w', ifApproved: 'i' })).ask.id;
const accountOf = async (label: string) => (await L.addAccount('claude', label)).id;
/** An outside tool, by its address, at read. */
const tool = (address: string) => ({
  connector: address,
  level: 'read',
  way: { keyHeader: 'x-api-key' }
});
/** `staff` given the tool at `address`, so the office has its connector. */
const grant = (staff: string, address: string) =>
  request('/api/staff/[id]/access', 'POST', { params: { id: staff }, body: tool(address) });
const fileOf = (name: string) => {
  const path = join(L.home(), 'staff', 'sam', name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, 'Before.\n');
  return { staff: 'sam', path: name, content: 'After.\n', mtime: statSync(path).mtimeMs };
};

/**
 * Gmail signed in for Paige, and `send` with Gmail answering as a stand-in, so
 * a reply or a filter the owner sends reaches its ledger row.
 */
async function withGmail(send: () => Promise<void>): Promise<void> {
  process.env.ODDBORO_GOOGLE_CLIENT_SECRET = 'a-client-secret-for-tests';
  secrets.set(
    'gmail:oauth',
    JSON.stringify({
      tokens: { access_token: 'ya29.test', refresh_token: '1//test', expires_in: 3600 },
      savedAt: Date.now()
    })
  );
  await L.connectorReady('gmail', ['get_thread'], ['get_thread']);
  await L.pg`insert into grants ${L.pg({ staff_id: 'paige', connector_id: 'gmail', level: 'read' })}
    on conflict do nothing`;
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://gmail.googleapis.com/')) return real(input, init);
    return Response.json({ id: 'g-1', labels: [], messages: [], message: { id: 'g-1' } });
  }) as typeof fetch;
  try {
    await send();
  } finally {
    globalThis.fetch = real;
  }
}
const asked = (fields: Omit<Parameters<typeof L.raiseAsk>[1], 'title' | 'why' | 'ifApproved'>) =>
  L.raiseAsk('paige', { title: 'Asked', why: 'w', ifApproved: 'i', ...fields }).then(
    (r) => r.ask.id
  );

/** What sends the page's call to the route under test, counting the ledger either side. */
type Send = (call: Call) => Promise<void>;
/** For each action that records: any rows it needs, then the call that makes it act. */
const TRY: Record<Recording, (send: Send) => Promise<void>> = {
  'POST /api/accounts': (send) => send({ body: { agent: 'claude', label: 'Work' } }),
  'PATCH /api/accounts': async (send) =>
    send({ body: { id: await accountOf('Old'), label: 'New' } }),
  'DELETE /api/accounts': async (send) => send({ body: { id: await accountOf('Gone') } }),
  'POST /api/asks/[id]': async (send) =>
    send({ params: { id: String(await askOf('Book the hall')) }, body: { decision: 'deny' } }),
  'POST /api/asks/[id]/reply': async (send) => {
    const id = await asked({
      kind: 'reply',
      reply: {
        to: ['nate@example.com'],
        cc: [],
        subject: 'Re: Lunch',
        body: 'Yes.',
        summary: 'Nate asks about lunch.'
      }
    });
    await withGmail(() =>
      send({
        params: { id: String(id) },
        body: {
          action: 'draft',
          to: ['nate@example.com'],
          cc: [],
          subject: 'Re: Lunch',
          body: 'Yes.'
        }
      })
    );
  },
  'POST /api/asks/[id]/filter': async (send) => {
    const criteria = { from: 'news@shop.example.com' };
    const action = { skipInbox: true };
    const id = await asked({
      kind: 'filter',
      filter: { criteria, action, summary: 'A newsletter every day.' }
    });
    await withGmail(() =>
      send({ params: { id: String(id) }, body: { criteria, action, tidy: false } })
    );
  },
  'POST /api/asks/[id]/folder': (send) =>
    ownerHome(async (home) => {
      const path = join(home, 'asked-for');
      mkdirSync(path);
      const id = await asked({ kind: 'folder', folder: { path, level: 'read' } });
      await send({ params: { id: String(id) }, body: { path, level: 'read' } });
    }),
  'PUT /api/files': (send) => send({ body: fileOf('plan.md') }),
  'POST /api/goals': (send) => send({ body: { title: 'Grow the garden' } }),
  'PUT /api/goals/[id]': async (send) =>
    send({ params: { id: String(await goal('Paint the fence')) }, body: { status: 'paused' } }),
  'POST /api/goals/[id]/staff': async (send) =>
    send({
      params: { id: String(await goal('Mend the roof')) },
      body: { staff: 'paige', part: 'The tiles.' }
    }),
  'DELETE /api/goals/[id]/staff': async (send) => {
    const id = await goal('Sweep the yard');
    await L.serveGoal('cleo', id, 'The leaves.');
    await send({ params: { id: String(id) }, query: { staff: 'cleo' } });
  },
  'PATCH /api/lessons/[id]': async (send) => {
    const [row] = await L.pg<{ id: number }[]>`
      insert into lessons (staff_id, heard_by, text, quote, how, status)
      values ('sam', 'sam', 'Write short.', 'Write short.', 'said', 'live') returning id`;
    await send({ params: { id: String(row.id) }, body: { text: 'Write shorter.' } });
  },
  'POST /api/office/move-in': (send) => send({ body: { spec, description: 'A test office.' } }),
  'PUT /api/office/design': (send) => {
    // A finished drawing, where the design job keeps it: on the office's global.
    (globalThis as { designJob?: unknown }).designJob = {
      id: 1,
      description: 'A drawn office.',
      lines: [],
      finished: true,
      moveIn: false,
      moved: false,
      result: { spec: { ...spec, name: 'Drawn office' }, art: [] },
      feed: { emit: () => true }
    };
    return send({ body: { moveIn: true } });
  },
  // After a move-in, so there is a sample to go back to.
  'POST /api/office/layouts/[id]': (send) => send({ params: { id: 'sample' } }),
  'POST /api/onboarding': (send) =>
    send({ body: { name: 'Tess', zone: 'UTC', manager: { preset: look().id } } }),
  'PUT /api/rooms': async (send) =>
    send({ body: { room: (await currentOffice()).world.rooms[0].id, name: 'The den' } }),
  'POST /api/staff': async (send) => {
    const l = look();
    await send({
      body: {
        name: 'Hal',
        role: 'Tester',
        remit: 'Tests.',
        desk: 'You are Hal.',
        room: (await currentOffice()).world.rooms[0].id.split('#')[0],
        permission: 'read',
        look: l.look,
        portraitPx: l.portraitPx
      }
    });
  },
  'PATCH /api/staff/[id]#permission': (send) =>
    send({ params: { id: 'sam' }, body: { permission: 'draft' } }),
  'PATCH /api/staff/[id]#agent': (send) =>
    send({ params: { id: 'gus' }, body: { agent: 'claude' } }),
  // The opposite of what Sam holds, since a repeat changes nothing.
  'PATCH /api/staff/[id]#tool': async (send) => {
    const tool = OFFICE_TOOLS.find((t) => !t.always)!.id;
    const on = !(await L.staffer('sam'))!.tools.includes(tool);
    await send({ params: { id: 'sam' }, body: { tool, on } });
  },
  'PATCH /api/staff/[id]#commands': (send) =>
    send({ params: { id: 'paige' }, body: { commands: true } }),
  'PATCH /api/staff/[id]#web': (send) => send({ params: { id: 'sam' }, body: { web: true } }),
  'PATCH /api/staff/[id]#folder': (send) =>
    ownerHome(async (home) => {
      mkdirSync(join(home, 'given'));
      await send({ params: { id: 'sam' }, body: { folder: join(home, 'given'), access: 'read' } });
    }),
  'PATCH /api/staff/[id]#effort': (send) =>
    send({ params: { id: 'sam' }, body: { effort: 'high' } }),
  'PATCH /api/staff/[id]#model': (send) =>
    send({ params: { id: 'sam' }, body: { model: L.MODELS.claude[0].id } }),
  'PATCH /api/staff/[id]#account': async (send) =>
    send({ params: { id: 'cleo' }, body: { account: await accountOf('Shared') } }),
  // A tool already connected: one not yet connected puts its connect steps on
  // the desk instead, and the owner finishing them is the row (POST /api/tasks/[id]).
  'POST /api/staff/[id]/access': async (send) => {
    await grant('lead', 'https://example.com/mcp');
    await L.pg`update connectors set ready_at = now()`;
    await send({ params: { id: 'sam' }, body: tool('https://example.com/mcp') });
  },
  // Down to Read only, which every level allows, since a repeat changes nothing.
  'PATCH /api/staff/[id]/access': async (send) => {
    await L.pg`insert into grants ${L.pg({ staff_id: 'sam', connector_id: 'google-drive', level: 'act' })}`;
    await send({ params: { id: 'sam' }, body: { connector: 'google-drive', level: 'read' } });
  },
  'DELETE /api/staff/[id]/access': async (send) => {
    await grant('paige', 'https://example.org/mcp');
    const [c] = await L.pg<
      { id: string }[]
    >`select id from connectors where id like 'example-org%'`;
    await send({ params: { id: 'paige' }, query: { connector: c.id } });
  },
  'PUT /api/staff/[id]/description': async (send) =>
    send({
      params: { id: 'sam' },
      body: { text: 'You are Sam, who tests.', was: (await L.staffer('sam'))!.desk }
    }),
  'PUT /api/staff/[id]/look': (send) => {
    const l = look();
    return send({ params: { id: 'sam' }, body: { look: l.look, portraitPx: l.portraitPx } });
  },
  'POST /api/tasks/[id]': async (send) => {
    const t = await L.giveTask('lead', { title: 'Sign the form', why: 'w', steps: ['Sign it'] });
    await send({ params: { id: String(t.id) }, body: { op: 'finish', note: 'Done.' } });
  }
};

/** The ledger's rows of each kind, counted. */
async function ledgerCounts(): Promise<Map<string, number>> {
  const rows = await L.pg<{ kind: string; n: number }[]>`
    select kind, count(*)::int as n from ledger group by kind`;
  return new Map(rows.map((r) => [r.kind, r.n]));
}

test('every owner route is declared, and each that records writes exactly one ledger row of its kind', async (t) => {
  assert.deepEqual(await handlers(), Object.keys(OWNER_ACTIONS).sort());
  for (const key of Object.keys(TRY) as Recording[]) {
    await t.test(key, async () => {
      const [method, at] = key.split(' ');
      let wrote: Record<string, number> | undefined;
      await TRY[key](async (call) => {
        const before = await ledgerCounts();
        await request(at.split('#')[0], method, call);
        const after = await ledgerCounts();
        wrote = Object.fromEntries(
          [...after]
            .filter(([k, n]) => n !== (before.get(k) ?? 0))
            .map(([k, n]) => [k, n - (before.get(k) ?? 0)])
        );
      });
      assert.deepEqual(wrote, { [OWNER_ACTIONS[key].records]: 1 }, `${key} wrote these rows`);
    });
  }
});

/** Each table's rows, as one digest per table, so a change to any row shows. */
async function tableDigests(): Promise<Map<string, string>> {
  const tables = await L.pg<{ name: string }[]>`
    select table_name as name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`;
  const digests = await Promise.all(
    tables.map(async ({ name }) => {
      const [{ d }] = await L.pg<{ d: string | null }[]>`
        select md5(string_agg(t::text, ',' order by t::text)) as d from ${L.pg(name)} t`;
      return [name, d ?? ''] as const;
    })
  );
  return new Map(digests);
}

/**
 * Actions that write no ledger row but change a row of the office's: any
 * rows each needs, then its call. Only these are driven, so another route that
 * writes and is classed `notAnAction` passes unseen.
 */
const CHANGES: Partial<Record<keyof typeof OWNER_ACTIONS, (send: Send) => Promise<void>>> = {
  'POST /api/staff/[id]/pokes': async (send) => {
    await L.pg`insert into pokes (staff_id, at, message, status)
      values ('sam', now(), 'How did the call go?', 'sent')`;
    await send({ params: { id: 'sam' } });
  },
  'PUT /api/update': (send) => send({ body: { start: '01:00', end: '03:00' } }),
  'POST /api/setup': async (send) => send({ body: { name: await L.ownerName() } })
};

test('marking delivered pokes read, setting the update window and setup each change a row of the office, and none is classed as changing none', async (t) => {
  for (const [key, act] of Object.entries(CHANGES)) {
    await t.test(key, async () => {
      const [method, at] = key.split(' ');
      let changed: string[] = [];
      await act(async (call) => {
        const before = await tableDigests();
        await request(at, method, call);
        const after = await tableDigests();
        changed = [...after.keys()].filter((k) => after.get(k) !== before.get(k));
      });
      assert.notDeepEqual(changed, [], `${key} changed no table`);
      assert.ok(
        !('notAnAction' in OWNER_ACTIONS[key as keyof typeof OWNER_ACTIONS]),
        `${key} changed ${changed.join(', ')}, yet is classed as changing none of the office's records`
      );
    });
  }
});
