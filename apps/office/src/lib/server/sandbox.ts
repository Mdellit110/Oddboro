// Whether this office keeps Claude Code's commands off the internet. A Claude
// Code that refuses the open network fails the run that met it; from then on
// its runs' commands go with no network, and the run, its my_access and the
// owner's page all say so. The state lives in memory, so a restart tries the
// open network once more and a refusal costs that one run again. Server only.
import { record, type Agent, type OwnTools } from '@oddboro/ledger';

/** What the owner reads on the run that met a refusal, with the Odd's name for `{name}`. */
export const NETWORK_REFUSED_LINE =
  "This version of Claude Code will not let commands reach the internet, so {name}'s commands now run with no network. Send your message again.";

let held = false;

/** Whether this office has met that refusal since it started. */
export function networkHeld(): boolean {
  return held;
}

/** Called when a run meets the refusal. Records one Ledger line by the office, the first time. */
export async function holdNetwork(): Promise<void> {
  if (held) return;
  // Held before the write, so two runs refused at once record one line, and
  // a failed write still keeps commands off the internet.
  held = true;
  await record({
    kind: 'access',
    actor: 'office',
    title: "Kept Odds' commands off the internet",
    body: 'This version of Claude Code refuses to let commands reach the whole internet. Commands keep working, with no network.'
  });
}

/** `own` with its network taken away while held. Only a Claude Code run's network is held: the refusal is Claude Code's. */
export function heldNetwork(agent: Agent, own: OwnTools): OwnTools & { held: boolean } {
  const isHeld = agent === 'claude' && held;
  return { ...own, network: own.network && !isHeld, held: isHeld };
}

/** For tests only: forgets a refusal, so the next run tries the open network again. */
export function resetHeldNetwork(): void {
  held = false;
}
