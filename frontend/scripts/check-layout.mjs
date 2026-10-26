// Renders the app in a real browser and checks the spacing people actually see:
//   1. every padding and gap computes to a value on the spacing scale,
//   2. each travel leg sits exactly halfway between the cards above and below it,
//   3. the page never scrolls sideways.
// Runs at the three layout widths from the spec. `npm run test:layout`.
// Uses the Edge installed on the machine; set LAYOUT_BROWSER=chrome to use Chrome instead.
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const SCALE = new Set([0, 4, 8, 12, 16, 20, 24, 32, 48, 64]);
const WIDTHS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1100, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];
const PAGES = ['/trip/day/2', '/trip/day/4', '/setup'];
const TOLERANCE_PX = 1;

const server = await createServer({ logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ channel: process.env.LAYOUT_BROWSER === 'chrome' ? 'chrome' : 'msedge', headless: true });

const failures = [];
try {
  for (const size of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    for (const path of PAGES) {
      await page.goto(base + path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const where = `${size.name} ${path}`;

      const offScale = await page.evaluate((scale) => {
        const allowed = new Set(scale);
        const found = [];
        for (const el of document.querySelectorAll('#root *')) {
          if (el.getClientRects().length === 0) continue;
          const cs = getComputedStyle(el);
          const props = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap'];
          const bad = props.filter((prop) => cs[prop] !== 'normal' && !allowed.has(Math.round(parseFloat(cs[prop]))));
          if (bad.length) found.push(`${el.tagName.toLowerCase()}.${el.className || '(no class)'} ${bad.map((p) => `${p}=${cs[p]}`).join(' ')}`);
        }
        return [...new Set(found)].slice(0, 12);
      }, [...SCALE]);
      offScale.forEach((f) => failures.push(`${where}: off-scale ${f}`));

      const legs = await page.evaluate(() =>
        [...document.querySelectorAll('[class*="_leg_"]')].flatMap((leg) => {
          const icon = leg.querySelector('svg');
          const before = leg.closest('li')?.previousElementSibling;
          const after = leg.nextElementSibling ?? leg.closest('li')?.nextElementSibling;
          if (!icon || !before || !after) return [];
          const i = icon.getBoundingClientRect();
          const above = i.top - before.getBoundingClientRect().bottom;
          const below = after.getBoundingClientRect().top - i.bottom;
          return [{ text: leg.textContent.trim(), above: Math.round(above), below: Math.round(below) }];
        }),
      );
      if (path === '/trip/day/2' && legs.length === 0) failures.push(`${where}: found no travel legs to measure`);
      legs
        .filter((l) => Math.abs(l.above - l.below) > 1)
        .forEach((l) => failures.push(`${where}: leg "${l.text}" sits ${l.above}px below the card above but ${l.below}px above the next`));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > TOLERANCE_PX) failures.push(`${where}: page scrolls sideways by ${overflow}px`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`Layout check failed (${failures.length}):\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log(`Layout: spacing on scale, legs centered, no sideways scroll at ${WIDTHS.map((w) => w.width).join(', ')} px.`);
