import { describe, expect, it } from 'vitest';
import { testTrip, stop } from './testTrip';
import { defaultStayMinutes } from './timeline';
import { applyTripEdit, STOP_COLOR_CYCLE, stopFromBacklog } from './tripEdits';

const base = () => testTrip([stop('s1', 'a', 60), stop('s2', 'b', 30), stop('s3', 'c', 45)]);
const stopIds = (trip: ReturnType<typeof base>) => trip.days[0].stops.map((s) => s.id);

describe('applyTripEdit', () => {
  it('moves a stop to a new position', () => {
    expect(stopIds(applyTripEdit(base(), { type: 'moveStop', dayNumber: 1, fromIndex: 0, toIndex: 2 }))).toEqual(['s2', 's3', 's1']);
  });

  it('ignores a move past either end', () => {
    const trip = base();
    expect(applyTripEdit(trip, { type: 'moveStop', dayNumber: 1, fromIndex: 2, toIndex: 3 })).toBe(trip);
  });

  it('applies only the changed fields of a stop', () => {
    const next = applyTripEdit(base(), {
      type: 'updateStop',
      dayNumber: 1,
      stopId: 's2',
      changes: { title: 'Lunch', stay: { minutes: 90, source: 'user' } },
    });
    expect(next.days[0].stops[1]).toMatchObject({ title: 'Lunch', color: 'amber', stay: { minutes: 90, source: 'user' } });
  });

  it('adds a trimmed comment and drops an empty one', () => {
    const add = (body: string) =>
      applyTripEdit(base(), { type: 'addComment', dayNumber: 1, stopId: 's1', commentId: 'c', body, createdAt: '2026-01-01' });
    expect(add('  Bring cash ').days[0].stops[0].comments).toEqual([{ id: 'c', body: 'Bring cash', createdAt: '2026-01-01' }]);
    expect(add('   ').days[0].stops[0].comments).toEqual([]);
  });

  it('moves a stop to the backlog with a reason, and back onto a day', () => {
    const removed = applyTripEdit(base(), { type: 'moveToBacklog', dayNumber: 1, stopId: 's2' });
    expect(stopIds(removed)).toEqual(['s1', 's3']);
    expect(removed.backlog[0]).toEqual({ placeId: 'b', reason: 'Moved here from Day 1.' });

    const restored = applyTripEdit(removed, { type: 'addFromBacklog', dayNumber: 1, stop: stopFromBacklog(removed, 1, 'b', 'new') });
    expect(stopIds(restored)).toEqual(['s1', 's3', 'new']);
    expect(restored.backlog.map((b) => b.placeId)).toEqual(['d']);
    expect(restored.days[0].stops[2]).toMatchObject({ placeId: 'b', stay: { minutes: 90, source: 'estimate' } });
  });

  it('puts a day back to exactly the given stops and takes them out of the backlog', () => {
    const original = base();
    const changed = applyTripEdit(applyTripEdit(original, { type: 'moveToBacklog', dayNumber: 1, stopId: 's2' }), {
      type: 'moveStop',
      dayNumber: 1,
      fromIndex: 0,
      toIndex: 1,
    });
    const undone = applyTripEdit(changed, { type: 'replaceDayStops', dayNumber: 1, stops: original.days[0].stops });
    expect(undone.days[0].stops).toEqual(original.days[0].stops);
    expect(undone.backlog).toEqual(original.backlog);
  });

  it('puts every day and the backlog back for Undo after a build', () => {
    const original = base();
    const changed = applyTripEdit(original, { type: 'moveToBacklog', dayNumber: 1, stopId: 's1' });
    const undone = applyTripEdit(changed, {
      type: 'restorePlan',
      days: original.days.map((d) => ({ dayNumber: d.number, stops: d.stops })),
      backlog: original.backlog,
    });
    expect(undone.days).toEqual(original.days);
    expect(undone.backlog).toEqual(original.backlog);
  });

  it('uses the same stop defaults as the backend', () => {
    // Same values as backend/tests/test_build.py::test_defaults_match_the_frontend.
    expect(defaultStayMinutes(['eat', 'explore'])).toBe(90);
    expect(defaultStayMinutes(['experience'])).toBe(120);
    expect(defaultStayMinutes([])).toBe(60);
    expect(STOP_COLOR_CYCLE).toEqual(['green', 'blue', 'amber', 'ink']);
  });

  it('refuses to add a place that is not in the backlog', () => {
    const trip = base();
    expect(applyTripEdit(trip, { type: 'addFromBacklog', dayNumber: 1, stop: stopFromBacklog(trip, 1, 'a', 'x') })).toBe(trip);
  });

  it('moves a stop to the end of another day and clears its locked time', () => {
    const one = base();
    const trip = { ...one, days: [...one.days, { ...one.days[0], number: 2, date: '2026-01-02', stops: [stop('t1', 'd', 30)] }] };
    const locked = applyTripEdit(trip, { type: 'updateStop', dayNumber: 1, stopId: 's2', changes: { lockedAtMin: 600 } });
    const moved = applyTripEdit(locked, { type: 'moveToDay', dayNumber: 1, stopId: 's2', toDayNumber: 2 });
    expect(stopIds(moved)).toEqual(['s1', 's3']);
    expect(moved.days[1].stops.map((s) => s.id)).toEqual(['t1', 's2']);
    expect(moved.days[1].stops[1].lockedAtMin).toBeNull();
    expect(applyTripEdit(trip, { type: 'moveToDay', dayNumber: 1, stopId: 's2', toDayNumber: 1 })).toBe(trip);
    expect(applyTripEdit(trip, { type: 'moveToDay', dayNumber: 1, stopId: 's2', toDayNumber: 9 })).toBe(trip);
  });
});
