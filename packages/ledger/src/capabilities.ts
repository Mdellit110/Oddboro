// What one Odd can do: its level, the office tools the owner gave it, and each
// outside tool it was granted, with whether a run gets that tool and why not.
// A run loads its tools from this, my_access shows it, office_report shows it
// for every Odd, and the owner's Access tab shows it, so all of them see the
// same thing. The one gap is a hosted sign-in that ran out: only the run's
// fresh token shows it.
import {
  grantsFor,
  levelAtMost,
  type ConnectorRow,
  type GrantRow,
  type StaffRow
} from './office.ts';
import type { Level } from './schema.ts';
import { OFFICE_TOOLS } from './tools.ts';

/**
 * Why a run leaves out a tool the Odd was granted. A run adds
 * 'sign-in ran out' itself, since only a fresh token shows it.
 */
export type HeldBack = 'above its level' | 'still connecting' | 'sign-in ran out';

export type Access = {
  connector: ConnectorRow;
  level: Level;
  heldBack?: HeldBack;
};

export type Capabilities = {
  level: Level;
  remit: string;
  /** The office tools held beyond the ones every Odd has, by id. */
  office: string[];
  outside: Access[];
};

export async function capabilities(who: StaffRow): Promise<Capabilities> {
  return {
    level: who.permission,
    remit: who.remit,
    office: OFFICE_TOOLS.filter((t) => !t.always && who.tools.includes(t.id)).map((t) => t.id),
    outside: (await grantsFor(who.id)).map((g) => accessOf(g, who.permission))
  };
}

/** One grant as a run finds it: what it reaches, or why it is held back. */
function accessOf(g: GrantRow & { connector: ConnectorRow }, permission: Level): Access {
  const heldBack: HeldBack | undefined = !levelAtMost(g.level, permission)
    ? 'above its level'
    : g.connector.readyAt
      ? undefined
      : 'still connecting';
  return { connector: g.connector, level: g.level, heldBack };
}

/** How many tools a grant reaches, in words: every tool at write, else the read-only ones. */
export function reachOf(a: Access): string {
  const n = a.connector.readTools.length;
  return a.level === 'act' ? 'every tool' : `${n} ${n === 1 ? 'tool' : 'tools'}`;
}

/** One line per outside tool, in words that suit both the Odd and the Office Manager. */
export function outsideLines(c: Capabilities, owner: string): string[] {
  return c.outside.map((a) => {
    const what = `${a.connector.name} (${a.level === 'act' ? 'read and write' : 'read only'})`;
    switch (a.heldBack) {
      case 'above its level':
        return `${what}: held back. It needs the ${a.level} level, and the current level is ${c.level}. It works again once ${owner} raises the level.`;
      case 'still connecting':
        return `${what}: held back until ${owner} finishes connecting it.`;
      case 'sign-in ran out':
        return `${what}: held back. Its sign-in ran out, and ${owner} needs to sign in again.`;
      case undefined:
        return `${what}: ${reachOf(a)}.`;
    }
  });
}

/** The Odd's level, said to the Odd. */
export function levelLine(level: Level, owner: string): string {
  return {
    read: 'Your level is Read: you look and report. You change nothing outside the office.',
    draft: `Your level is Draft: you prepare things for ${owner}'s yes, drafts included. Nothing you make goes out until they say yes.`,
    act: `Your level is Act: you do housekeeping inside the office on your own, and use a tool ${owner} connected for you at read and write without asking each time.`
  }[level];
}
