// The last line of every email Oddboro writes: a reply an Odd proposes, and a
// draft an Odd saves in Gmail. It is added once, where the text is first
// written, as plain words, so the owner sees clean text and may delete it.
// Sending never adds it, so a footer the owner deleted stays deleted. Only as
// the email goes does "Oddboro" in that last line become a link (`linkFooter`).
// No imports.

export const MAIL_FOOTER = 'Sent from Oddboro';
const SITE = 'https://oddboro.com';

/** The footer as a line may say it: in words, or as the link it once was. */
const FOOTER_LINES = new Set([
  'sent from oddboro',
  'sent from [oddboro](https://oddboro.com)',
  'sent from [oddboro](https://oddboro.com/)'
]);

/** Whether any line of the body is the footer. Line by line: no pattern runs over the whole body. */
const hasFooter = (body: string) =>
  body.split('\n').some((line) => FOOTER_LINES.has(line.trim().toLowerCase()));

/** The body with a blank line and the footer after it, unless it already says it. */
export function withFooter(body: string): string {
  if (hasFooter(body)) return body;
  return `${body.trimEnd()}\n\n${MAIL_FOOTER}`;
}

/**
 * The body as it goes out: when its last line is the footer in plain words,
 * "Oddboro" there links to the site (a Markdown link, which the email's HTML
 * part makes a link and its plain text writes as "Oddboro (https://oddboro.com)").
 * Anywhere else the words stay as the owner left them.
 */
export function linkFooter(body: string): string {
  const lines = body.trimEnd().split('\n');
  const last = lines.length - 1;
  if (lines[last].trim().toLowerCase() !== MAIL_FOOTER.toLowerCase()) return body;
  lines[last] = `Sent from [Oddboro](${SITE})`;
  return lines.join('\n');
}
