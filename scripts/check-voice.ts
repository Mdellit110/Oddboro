// Everything in this repo reads like a person wrote it. Fails on em-dashes
// anywhere and on the stock phrases that mark machine-written text. Add a
// word here whenever one slips through.
import { read, repoFiles, report } from './lib/files.ts';

const TEXT = /\.(md|ts|js|mjs|svelte|css|json|jsonc|html|px|txt|yml|yaml)$/;
const SKIP = new Set(['package-lock.json', 'scripts/check-voice.ts']);

const BANNED = [
  'delve',
  'tapestry',
  'leverage',
  'robust',
  'utilize',
  'elevate',
  'empower',
  'unlock the',
  'game-changer',
  'game changer',
  'cutting-edge',
  'synergy',
  'holistic',
  'revolutionize',
  'embark',
  'in today’s',
  "in today's",
  'it’s worth noting',
  "it's worth noting",
  'furthermore',
  'moreover',
  'a testament to',
  'the realm of',
  'bustling',
  'nestled',
  'pivotal',
  'navigate the complexities',
  'ever-evolving',
  'look no further',
  'supercharge',
  'world-class',
  'best-in-class',
  'deep dive',
  'load-bearing'
];
const pattern = new RegExp(
  `\\b(${BANNED.map((w) => w.replace(/[-']/g, "[-’']?")).join('|')})\\b`,
  'i'
);

const failures: string[] = [];
for (const file of repoFiles()) {
  if (!TEXT.test(file) || SKIP.has(file)) continue;
  read(file)
    .split('\n')
    .forEach((line, i) => {
      if (line.includes('—'))
        failures.push(`${file}:${i + 1}: em-dash. Use a period, comma, colon or parentheses.`);
      const m = pattern.exec(line);
      if (m) failures.push(`${file}:${i + 1}: "${m[1]}" reads as machine-written. Say it plainly.`);
    });
}
report('voice', failures);
