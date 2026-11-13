// The office's own names, alone in this file because the error reporting
// setup loads before the server and must not pull in the ledger or Postgres.

/** The names Caddy answers to, best first. The first one is served over HTTPS too. */
export const HOSTS = ['local.oddboro.com', 'oddboro.localhost'];

/**
 * The names the owner adds in `ODDBORO_EXTRA_HOSTS`, such as the home
 * computer's Tailscale name, so a phone of theirs can reach the office
 * through `tailscale serve`. A comma-separated list. Each entry may be a bare
 * name or an address with a scheme or a port; only its name counts. The
 * office still listens on 127.0.0.1 alone, so a name here opens nothing by
 * itself: what forwards to it is the wall.
 */
export function extraHosts(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
    .map((n) => URL.parse(n.includes('//') ? n : `http://${n}`)?.hostname.toLowerCase() ?? '')
    .filter(Boolean);
}
