// Renders the app in a real browser and checks the spacing people actually see:
//   1. every padding and gap computes to a value on the spacing scale,
//   2. inside every row or column, neighbors are evenly spaced (rule A),
//   3. every pair of neighboring cards in the itinerary is the same distance apart (rule B),
//   4. each travel leg sits exactly halfway between the cards above and below it,
//   5. the page never scrolls sideways.
// Runs at the three layout widths from the spec. `npm run test:layout`.
// Uses the Edge installed on the machine; set LAYOUT_BROWSER=chrome to use Chrome instead.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const SCALE = new Set([0, 4, 8, 12, 16, 20, 24, 32, 48, 64]);
const WIDTHS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 1100, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];
// '#signed-out' answers the session check with 401, so the sign-in screen shows.
const PAGES = ['/trip/day/1', '/trip/day/2', '/trip/day/4', '/setup', '/setup#signed-out'];
const TOLERANCE_PX = 1;
// The API is answered with the backend's seed file, so this test needs no database.
const SEED = JSON.parse(readFileSync(new URL('../../backend/src/pinpoint/seed/demo_trip.json', import.meta.url), 'utf8'));

const server = await createServer({ logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ channel: process.env.LAYOUT_BROWSER === 'chrome' ? 'chrome' : 'msedge', headless: true });

const failures = [];
try {
  for (const size of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height } });
    await page.route('**/api/trips/demo', (route) => route.fulfill({ json: SEED }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ status: page.url().includes('#signed-out') ? 401 : 204 }));
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

      // Rule A: inside every flex or grid container, neighbors are evenly spaced.
      // Children are grouped into rows by vertical overlap; the gaps between rows must all match,
      // and the gaps between items within a row must all match.
      const uneven = await page.evaluate((tolerance) => {
        const label = (el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0] || '(no class)'}`;
        const spread = (gaps) => Math.max(...gaps) - Math.min(...gaps);
        const found = [];
        for (const el of document.querySelectorAll('#root *')) {
          if (el.getClientRects().length === 0) continue;
          if (!/flex|grid/.test(getComputedStyle(el).display)) continue;
          const kids = [...el.children].filter((k) => {
            const cs = getComputedStyle(k);
            return k.getClientRects().length > 0 && cs.position !== 'absolute' && cs.position !== 'fixed';
          });
          if (kids.length < 3) continue;
          const rows = [];
          for (const r of kids.map((k) => k.getBoundingClientRect()).sort((a, b) => a.top - b.top || a.left - b.left)) {
            // Same row when it overlaps the row vertically, so centered items of different heights group together.
            const row = rows.find((x) => r.top < x.bottom - tolerance && r.bottom > x.top + tolerance);
            if (row) {
              row.items.push(r);
              row.bottom = Math.max(row.bottom, r.bottom);
            } else rows.push({ top: r.top, bottom: r.bottom, items: [r] });
          }
          const vertical = rows.slice(1).map((row, i) => {
            const prevBottom = Math.max(...rows[i].items.map((r) => r.bottom));
            return Math.round(Math.min(...row.items.map((r) => r.top)) - prevBottom);
          });
          const horizontal = rows.flatMap((row) =>
            row.items.sort((a, b) => a.left - b.left).slice(1).map((r, i) => Math.round(r.left - row.items[i].right)),
          );
          if (vertical.length > 1 && spread(vertical) > tolerance) found.push(`${label(el)} vertical gaps ${vertical.join('/')}`);
          if (horizontal.length > 1 && spread(horizontal) > tolerance) found.push(`${label(el)} horizontal gaps ${horizontal.join('/')}`);
        }
        return found;
      }, TOLERANCE_PX);
      uneven.forEach((f) => failures.push(`${where}: uneven ${f}`));

      // Rule B: every pair of neighboring cards in the itinerary is the same distance apart,
      // whether a travel leg sits between them or not.
      const cardGaps = await page.evaluate(() => {
        const list = document.querySelector('ol[aria-label^="Stops for Day"]');
        if (!list) return [];
        const cards = [...list.querySelectorAll('[class*="_card_"], [class*="_softCard_"]')]
          .filter((c) => c.getClientRects().length > 0)
          .map((c) => ({ name: c.querySelector('h3')?.textContent ?? c.textContent.trim().slice(0, 24), r: c.getBoundingClientRect() }))
          .sort((a, b) => a.r.top - b.r.top);
        return cards.slice(1).map((c, i) => ({ between: `${cards[i].name} → ${c.name}`, px: Math.round(c.r.top - cards[i].r.bottom) }));
      });
      if (cardGaps.length > 1) {
        const sizes = cardGaps.map((g) => g.px);
        if (Math.max(...sizes) - Math.min(...sizes) > TOLERANCE_PX) {
          const usual = sizes.sort((a, b) => sizes.filter((x) => x === b).length - sizes.filter((x) => x === a).length)[0];
          cardGaps
            .filter((g) => Math.abs(g.px - usual) > TOLERANCE_PX)
            .forEach((g) => failures.push(`${where}: cards "${g.between}" are ${g.px}px apart; the others are ${usual}px`));
        }
      }

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
console.log(`Layout: spacing on scale, neighbors evenly spaced, cards evenly spaced, legs centered, no sideways scroll at ${WIDTHS.map((w) => w.width).join(', ')} px.`);
