// Logical properties only: ms/me/ps/pe/start/end, never left/right. Reads
// class attributes and style blocks in .svelte files, and every .css file.
import { read, repoFiles, report } from './lib/files.ts';

const TW =
  /(?<![\w-])(-?m[lr]-|p[lr]-|left-|right-|border-[lr](?:-|\b)|rounded-[lr][tb]?-|text-(?:left|right)\b|float-(?:left|right)\b|scroll-[mp][lr]-|inset-x-reverse)/;
const CSS =
  /(?<![\w-])(margin-(?:left|right)|padding-(?:left|right)|border-(?:left|right)|text-align:\s*(?:left|right)|float:\s*(?:left|right)|(?<!-)(?:left|right):)/;

const failures: string[] = [];
for (const file of repoFiles()) {
  if (file.endsWith('.css')) {
    read(file)
      .split('\n')
      .forEach((line, i) => {
        const m = CSS.exec(line);
        if (m) failures.push(`${file}:${i + 1}: "${m[1]}". Use the logical property.`);
      });
  } else if (file.endsWith('.svelte')) {
    const text = read(file);
    const lines = text.split('\n');
    let inStyle = false;
    lines.forEach((line, i) => {
      if (/<style/.test(line)) inStyle = true;
      if (inStyle) {
        const m = CSS.exec(line);
        if (m) failures.push(`${file}:${i + 1}: "${m[1]}". Use the logical property.`);
      }
      if (/<\/style>/.test(line)) inStyle = false;
      for (const attr of line.matchAll(/class(?::[\w-]+)?=(?:"([^"]*)"|\{([^}]*)\})/g)) {
        const m = TW.exec(attr[1] ?? attr[2] ?? '');
        if (m)
          failures.push(
            `${file}:${i + 1}: "${m[1]}". Use the logical utility (ms, me, ps, pe, start, end).`
          );
      }
    });
  }
}
report('directions', failures);
