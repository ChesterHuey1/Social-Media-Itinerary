import { describe, expect, it } from 'vitest';
import { planChanges } from './planChanges';
import { stop, testTrip } from './testTrip';

describe('planChanges', () => {
  it('lists places that changed day, joined, or left, but not ones reordered within a day', () => {
    const before = testTrip([stop('s1', 'a', 60), stop('s2', 'b', 30)]);
    const after = {
      ...before,
      days: [{ ...before.days[0], stops: [stop('s2', 'b', 30), stop('n', 'd', 30)] }],
      backlog: [{ placeId: 'a', reason: 'Closed then.' }],
    };
    expect(planChanges(before, after)).toEqual([
      { placeId: 'a', from: 1, to: 'backlog', reason: 'Closed then.' },
      { placeId: 'd', from: 'backlog', to: 1, reason: null },
    ]);
    expect(planChanges(before, before)).toEqual([]);
  });
});
