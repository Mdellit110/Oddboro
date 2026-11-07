// Each call the office's own code makes out of its process by a name
// `check-outbound.ts` counts (that file lists what it counts and what it does
// not, such as each AI tool's run in a child process). Hard rule 4 says
// nothing leaves the office without the owner's yes, so each entry says where
// its calls go, what they send and whose yes covers them. `check-outbound.ts` fails when a
// file's calls differ from its entry here.

export type Outbound = {
  /** The file, from the repo root. */
  file: string;
  /** How many call sites the file has, as check-outbound.ts counts them. */
  calls: number;
  to: string;
  sends: string;
  yes: string;
};

export const OUTBOUND: readonly Outbound[] = [
  {
    file: 'apps/office/src/lib/server/access.ts',
    calls: 1,
    to: 'A hosted connector, at the address it was saved with.',
    sends:
      "The connector's own secrets in its headers, a request for its tools, and each call an Odd's run makes to it through the office's gateway (gateway.ts), with that call's arguments.",
    yes: 'The owner adding that connector, and granting the Odd it at Read only or Read and write.'
  },
  {
    file: 'apps/office/src/lib/server/address.ts',
    calls: 6,
    to: "Caddy's admin and the office's own address on this computer, GitHub for Caddy's release and checksums, and the name server this computer uses, for the office's address.",
    sends:
      "The office's Caddy settings, kept on this computer, a download request for Caddy, and the name local.oddboro.com to look up.",
    yes: "The owner setting up the office's address in Setup."
  },
  {
    file: 'apps/office/src/lib/floor/engine.ts',
    calls: 1,
    to: "The office, on this computer: the floor's sprite atlas.",
    sends: "A request for the atlas. Nothing of the owner's.",
    yes: 'The owner opening the office; nothing leaves this computer.'
  },
  {
    file: 'apps/office/src/lib/floor/looks.ts',
    calls: 1,
    to: "The office, on this computer: an Odd's drawn look.",
    sends: "A request for the look. Nothing of the owner's.",
    yes: 'The owner opening the office; nothing leaves this computer.'
  },
  {
    file: 'apps/office/src/lib/ui/ChatPanel.svelte',
    calls: 2,
    to: 'The office, on this computer: the chat route.',
    sends: "The owner's chat messages, to the office that runs the Odd.",
    yes: 'The owner sending the message; nothing leaves this computer here.'
  },
  {
    file: 'apps/office/src/lib/ui/UpdatesSection.svelte',
    calls: 1,
    to: 'The office, on this computer: its live line of changes.',
    sends: "A request to hear changes. Nothing of the owner's.",
    yes: 'The owner opening the Setup window; nothing leaves this computer.'
  },
  {
    file: 'apps/office/src/lib/ui/api.ts',
    calls: 3,
    to: "The office, on this computer: the page's routes.",
    sends: "The owner's actions on the page, to the office.",
    yes: 'The owner acting on the page; nothing leaves this computer here.'
  },
  {
    file: 'apps/office/src/lib/ui/atlas.ts',
    calls: 1,
    to: 'The office, on this computer: the sprite atlas.',
    sends: "A request for the atlas. Nothing of the owner's.",
    yes: 'The owner opening the office; nothing leaves this computer.'
  },
  {
    file: 'apps/office/src/routes/+page.svelte',
    calls: 1,
    to: 'The office, on this computer: its live line of changes.',
    sends: "A request to hear changes. Nothing of the owner's.",
    yes: 'The owner opening the office; nothing leaves this computer.'
  },
  {
    file: 'apps/office/src/lib/server/gemini.ts',
    calls: 1,
    to: "Google's Gemini models list.",
    sends: 'The Gemini API key the owner typed, to check it works.',
    yes: 'The owner giving the office a Gemini API key.'
  },
  {
    file: 'apps/office/src/lib/server/oauth.ts',
    calls: 1,
    to: "A connector's sign-in server.",
    sends: "The office's sign-in requests and tokens for that connector.",
    yes: 'The owner signing a connector in.'
  },
  {
    file: 'apps/office/src/lib/server/versions.ts',
    calls: 1,
    to: 'The npm registry.',
    sends: "An AI tool's package name, to read its newest version. Nothing of the owner's.",
    yes: "The owner's choice of AI tool; the check sends no owner data."
  },
  {
    file: 'packages/ledger/src/checks.ts',
    calls: 1,
    to: 'Ollama at OLLAMA_URL, this computer unless the owner points it elsewhere.',
    sends: 'A request for its list of models.',
    yes: "The owner running setup's check; it sends no owner data."
  },
  {
    file: 'packages/ledger/src/embed.ts',
    calls: 1,
    to: 'Ollama at OLLAMA_URL, this computer unless the owner points it elsewhere.',
    sends: 'Text written to the ledger, or searched for, to turn it into a vector.',
    yes: 'The owner, who sets OLLAMA_URL; with it unset nothing leaves this computer.'
  },
  {
    file: 'packages/ledger/src/registry.ts',
    calls: 1,
    to: 'The MCP Registry.',
    sends: "The search words, the owner's or an Odd's.",
    yes: 'The owner searching for a connector, or granting an Odd find_connectors.'
  },
  {
    file: 'packages/ledger/src/setup.ts',
    calls: 3,
    to: 'The office, on this computer.',
    sends: 'Requests asking whether the office is up and how it can be reached.',
    yes: 'The owner running setup; nothing leaves this computer.'
  },
  {
    file: 'apps/desktop/src-tauri/src/update.rs',
    calls: 1,
    to: "The desktop app's update feed on GitHub (tauri.conf.json's updater endpoints).",
    sends: "The app's version and system, as the updater asks for its feed.",
    yes: 'The owner installing the desktop app, which checks for updates.'
  }
];
