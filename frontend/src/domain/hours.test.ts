import { describe, expect, it } from 'vitest';
import { checkVisit, visitProblemText } from './hours';
import type { Hours } from './types';

const museum: Hours = { kind: 'windows', source: 'google', windows: [{ openMin: 600, closeMin: 1020 }] };
const splitLunchDinner: Hours = {
  kind: 'windows',
  source: 'google',
  windows: [
    { openMin: 690, closeMin: 870 },
    { openMin: 1050, closeMin: 1320 },
  ],
};

describe('checkVisit', () => {
  it('accepts a visit inside the window', () => {
    expect(checkVisit(660, 90, museum, 45)).toEqual({ ok: true });
  });

  it('rejects arriving before opening and names the opening time', () => {
    const check = checkVisit(555, 60, museum, 45);
    expect(check).toEqual({ ok: false, reason: 'not-open-yet', opensAt: 600 });
    if (!check.ok) expect(visitProblemText(check, 555)).toBe('Closed at 9:15 AM. Opens at 10:00 AM.');
  });

  it('rejects arriving after last entry even when the stay would fit', () => {
    expect(checkVisit(990, 20, museum, 45)).toEqual({ ok: false, reason: 'after-last-entry', lastEntryAt: 975 });
  });

  it('rejects a visit that runs past closing', () => {
    expect(checkVisit(900, 150, museum, 45)).toEqual({ ok: false, reason: 'closes-during-visit', closesAt: 1020 });
  });

  it('never lets a visit span the break between two windows', () => {
    expect(checkVisit(840, 60, splitLunchDinner, 30)).toEqual({ ok: false, reason: 'closes-during-visit', closesAt: 870 });
    expect(checkVisit(900, 60, splitLunchDinner, 30)).toEqual({ ok: false, reason: 'not-open-yet', opensAt: 1050 });
    expect(checkVisit(1080, 60, splitLunchDinner, 30)).toEqual({ ok: true });
  });

  it('treats a place with no windows as closed on that date', () => {
    expect(checkVisit(600, 60, { kind: 'windows', source: 'google', windows: [] }, 0)).toEqual({ ok: false, reason: 'closed-today' });
  });

  it('always accepts open areas', () => {
    expect(checkVisit(1400, 120, { kind: 'always' }, 0)).toEqual({ ok: true });
  });

  it('falls back to 10 AM to 6 PM when hours are unconfirmed', () => {
    expect(checkVisit(1110, 30, { kind: 'unconfirmed' }, 0)).toEqual({
      ok: false,
      reason: 'closed-for-day',
      windows: [{ openMin: 600, closeMin: 1080 }],
    });
  });
});
