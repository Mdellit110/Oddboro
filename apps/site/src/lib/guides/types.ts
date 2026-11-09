// The shape of a connector guide: parts of numbered steps, and the fixes for
// what can go wrong. Each step has at most one box beside it: something to
// copy (a command, a policy, a name to type), a page to go to, or an example
// to read.

export type Step = {
  text: string;
  detail?: string;
  /** Text the owner copies or types, shown with a Copy button. */
  copy?: string;
  /** A web page, shown as a link with a Go to button that opens a new tab. */
  link?: string;
  /** An example to read, such as an ARN, with nothing to copy. */
  example?: string;
};

export type Part = { title: string; intro?: string; steps: Step[] };

export type Trouble = { q: string; a: string };
