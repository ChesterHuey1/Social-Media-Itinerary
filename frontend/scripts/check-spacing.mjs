// Fails when a padding, margin or gap uses anything but the spacing scale.
// The spec allows nine values (4, 8, 12, 16, 20, 24, 32, 48, 64 px), written as var(--s4) … var(--s64).
// Run by `npm run lint`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SCALE = new Set(['4', '8', '12', '16', '20', '24', '32', '48', '64']);
const ALLOWED_WORDS = new Set(['0', 'auto', 'inherit']);

const CSS_DECL = /^\s*((?:padding|margin)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;]+);/;
const JSX_DECL = /\b(padding|margin|gap|rowGap|columnGap)(?:Top|Right|Bottom|Left)?\s*:\s*([^,}\n]+)/g;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function badParts(value) {
  return value
    .trim()
    .split(/\s+/)
    .filter((part) => {
      if (ALLOWED_WORDS.has(part)) return false;
      const token = /^var\(--s(\d+)\)$/.exec(part);
      return !(token && SCALE.has(token[1]));
    });
}

const problems = [];
for (const file of files(ROOT)) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  if (file.endsWith('.css')) {
    lines.forEach((line, i) => {
      const m = CSS_DECL.exec(line);
      if (m && badParts(m[2]).length) problems.push(`src/${rel}:${i + 1}  ${m[1]}: ${m[2].trim()}`);
    });
  } else if (file.endsWith('.tsx')) {
    lines.forEach((line, i) => {
      for (const m of line.matchAll(JSX_DECL)) {
        const value = m[2].trim().replace(/^['"`]|['"`]$/g, '');
        if (badParts(value).length) problems.push(`src/${rel}:${i + 1}  inline ${m[1]}: ${m[2].trim()}`);
      }
    });
  }
}

if (problems.length) {
  console.error(`Spacing off the scale (use var(--s4) … var(--s64), 0 or auto):\n${problems.map((p) => `  ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Spacing: every padding, margin and gap is on the scale.');
