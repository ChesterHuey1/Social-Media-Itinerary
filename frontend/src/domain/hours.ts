import { formatClock, formatRange } from './format';
import type { Hours, OpenWindow } from './types';

/** Used when neither Google nor the place's site has hours. The card says "Hours not confirmed". */
export const ASSUMED_WINDOWS: OpenWindow[] = [{ openMin: 600, closeMin: 1080 }];

export type VisitCheck =
  | { ok: true }
  | { ok: false; reason: 'closed-today' }
  | { ok: false; reason: 'not-open-yet'; opensAt: number }
  | { ok: false; reason: 'after-last-entry'; lastEntryAt: number }
  | { ok: false; reason: 'closes-during-visit'; closesAt: number }
  | { ok: false; reason: 'closed-for-day'; windows: OpenWindow[] };

/**
 * The three rules every stop must pass, inside one opening window:
 * arrive after it opens, arrive before last entry, leave before it closes.
 */
export function checkVisit(arriveMin: number, stayMin: number, hours: Hours, lastEntryMin: number): VisitCheck {
  if (hours.kind === 'always') return { ok: true };
  const windows = hours.kind === 'windows' ? hours.windows : ASSUMED_WINDOWS;
  if (windows.length === 0) return { ok: false, reason: 'closed-today' };

  const leaveMin = arriveMin + stayMin;
  for (const w of windows) {
    if (arriveMin < w.openMin || arriveMin >= w.closeMin) continue;
    if (arriveMin > w.closeMin - lastEntryMin) return { ok: false, reason: 'after-last-entry', lastEntryAt: w.closeMin - lastEntryMin };
    if (leaveMin > w.closeMin) return { ok: false, reason: 'closes-during-visit', closesAt: w.closeMin };
    return { ok: true };
  }

  const next = windows.find((w) => w.openMin > arriveMin);
  if (next) return { ok: false, reason: 'not-open-yet', opensAt: next.openMin };
  return { ok: false, reason: 'closed-for-day', windows };
}

export function visitProblemText(check: Exclude<VisitCheck, { ok: true }>, arriveMin: number): string {
  switch (check.reason) {
    case 'closed-today':
      return 'Closed on this date.';
    case 'not-open-yet':
      return `Closed at ${formatClock(arriveMin)}. Opens at ${formatClock(check.opensAt)}.`;
    case 'after-last-entry':
      return `Last entry is ${formatClock(check.lastEntryAt)}.`;
    case 'closes-during-visit':
      return `Closes at ${formatClock(check.closesAt)}, before this visit ends.`;
    case 'closed-for-day':
      return `Open ${check.windows.map((w) => formatRange(w.openMin, w.closeMin)).join(', ')}.`;
  }
}

export function hoursText(hours: Hours): string {
  switch (hours.kind) {
    case 'always':
      return '24 hours';
    case 'unconfirmed':
      return 'Not confirmed';
    case 'windows':
      return hours.windows.length === 0
        ? 'Closed today'
        : hours.windows.map((w) => formatRange(w.openMin, w.closeMin)).join(', ');
  }
}
