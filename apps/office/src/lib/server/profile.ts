// An Odd as the page gets it, worked out on the server: what its runs reach
// reads the disk (folders still there) and this office's held network, and
// each folder's `~` form reads the home folder, none of which the page can do.
import {
  commandsHow,
  heldReach,
  networkHeld,
  ownTools,
  shownFolder,
  webLine,
  type StaffRow
} from '@oddboro/ledger';
import { officeDay } from '@oddboro/ledger/time';
import { lookVersion, type StaffProfile } from '../staff/roster.ts';

/**
 * A staff row as the page needs it. The job description stays on the server.
 * A new hire has no guesses of its own; the next office load counts any for every Odd.
 */
export function toProfile(r: StaffRow, guesses = 0): StaffProfile {
  const reach = heldReach(r.agent, ownTools(r, process.platform), networkHeld());
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
    tools: r.tools,
    commands: r.commands,
    commandsHow: commandsHow(r.agent, process.platform),
    web: r.web,
    webLine: webLine(r.agent, process.platform, reach.held),
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
