// An Odd as the page gets it, worked out on the server: what its runs reach
// reads the disk (folders still there) and this office's held network, and
// each folder's `~` form reads the home folder, none of which the page can do.
import {
  currentPlatform,
  effortFor,
  heldReach,
  MANAGER_ROLE,
  modelFor,
  MODELS,
  type Agent,
  networkHeld,
  ownTools,
  shownFolder,
  webLine,
  type StaffRow
} from '@oddboro/ledger';
import { officeDay } from '@oddboro/ledger/time';
import { lookVersion, type StaffProfile } from '../staff/roster.ts';
import { officeModel } from './claude.ts';

/**
 * A staff row as the page needs it. The job description stays on the server.
 * A new hire has no guesses of its own; the next office load counts any for every Odd.
 */
export function toProfile(r: StaffRow, guesses = 0): StaffProfile {
  const reach = heldReach(r.agent, ownTools(r, currentPlatform()), networkHeld());
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    office: r.office,
    sprite: r.sprite,
    variant: r.variant,
    portrait: r.portrait,
    hired: officeDay(new Date(r.hiredAt)),
    permission: r.permission,
    agent: r.agent,
    ...(r.account ? { account: r.account } : {}),
    model: modelFor(r.agent, r.model),
    // An Odd with none of its own runs the office's, else its tool's default, first in its list.
    officeModel: officeModel(r.agent) ?? MODELS[r.agent][0]?.id,
    effort: effortFor(r.agent, r.effort, r.role === MANAGER_ROLE, modelFor(r.agent, r.model)),
    tools: r.tools,
    commands: r.commands,
    web: r.web,
    webLine: webLine(r.agent, currentPlatform(), reach.held),
    folders: r.folders.map((f) => ({ ...f, shown: shownFolder(f.path) })),
    reach,
    remit: r.remit,
    room: r.room,
    guesses,
    look:
      r.look && r.portraitPx
        ? {
            spec: r.look,
            version: lookVersion(r.look, r.portraitPx),
            sheet: `/api/staff/${r.id}/look?v=${lookVersion(r.look, r.portraitPx)}`,
            portrait: `/api/staff/${r.id}/portrait?v=${lookVersion(r.look, r.portraitPx)}`
          }
        : undefined
  };
}
