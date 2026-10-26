import { describe, expect, it } from 'vitest';
import { checkMoveToDay } from './moveToDay';
import { stop, testTrip } from './testTrip';
import type { Trip } from './types';

/** Day 1 has a, b, c; Day 2 (also 9 AM to 6 PM) starts with whatever is given. */
function twoDays(day2: ReturnType<typeof stop>[], endMin = 1080): Trip {
  const one = testTrip([stop('s1', 'a', 60), stop('s2', 'b', 30), stop('s3', 'c', 45)]);
  return { ...one, days: [...one.days, { ...one.days[0], number: 2, date: '2026-01-02', endMin, stops: day2 }] };
}

describe('checkMoveToDay', () => {
  it('fits on a day with room', () => {
    expect(checkMoveToDay(twoDays([]), 1, 's2', 2)).toEqual({ fits: true });
  });

  it('says when the place is not open yet at that point of the day', () => {
    // c opens at noon. First on Day 2 it would leave the hotel later, so it fits; after a short stop, it would wait too long.
    expect(checkMoveToDay(twoDays([]), 1, 's3', 2)).toEqual({ fits: true });
    const check = checkMoveToDay(twoDays([stop('t1', 'd', 30)]), 1, 's3', 2);
    expect(check.fits).toBe(false);
  });

  it('says when the day would run past its end', () => {
    // Day 2 ends at 9:40 AM. Out 9:00, +10 leg +10 slack, 30 there, +10 +10 back: 10:10.
    const check = checkMoveToDay(twoDays([], 580), 1, 's2', 2);
    expect(check).toEqual({ fits: false, reason: 'Back at 10:10 AM, 30 m after the day ends.' });
  });
});

describe('checkMoveToDay across cities', () => {
  it('says when the other day is in another city', () => {
    const trip = twoDays([]);
    const kyoto = { ...trip.stays[0], id: 'kyoto', city: 'Kyoto' };
    const moved = { ...trip, stays: [...trip.stays, kyoto], days: trip.days.map((d) => (d.number === 2 ? { ...d, stayId: 'kyoto' } : d)) };
    expect(checkMoveToDay(moved, 1, 's2', 2)).toEqual({ fits: false, reason: 'This day is in Kyoto.' });
  });
});
