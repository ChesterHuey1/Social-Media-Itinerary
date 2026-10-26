import { describe, expect, it } from 'vitest';
import { daySummary, openTimeAtEnd } from './schedule';
import { stop, testTrip } from './testTrip';
import { buildTimeline } from './timeline';
import type { Trip } from './types';

function withCosts(trip: Trip): Trip {
  const places = { ...trip.places };
  places.a = { ...places.a, cost: { usd: 20, per: 'person', source: 'deepseek' }, needsBooking: true };
  places.b = { ...places.b, cost: { usd: 15, per: 'ticket', source: 'scrape' } };
  return { ...trip, places };
}

describe('daySummary', () => {
  it('splits per-person costs into food and per-ticket costs into tickets, and totals them', () => {
    const trip = withCosts(testTrip([stop('s1', 'a', 60), stop('s2', 'b', 30)]));
    const summary = daySummary(buildTimeline(trip, trip.days[0]));
    expect(summary).toMatchObject({ foodUsd: 20, ticketsUsd: 15, transitUsd: 0, totalUsd: 35, travelMin: 30, bookAhead: ['A'] });
  });

  it('marks the day as estimated when any cost came from the AI', () => {
    const trip = withCosts(testTrip([stop('s1', 'a', 60)]));
    expect(daySummary(buildTimeline(trip, trip.days[0])).estimated).toBe(true);
    const exact = withCosts(testTrip([stop('s2', 'b', 60)]));
    expect(daySummary(buildTimeline(exact, exact.days[0])).estimated).toBe(false);
  });
});

describe('openTimeAtEnd', () => {
  it('runs from the last stop to when you must head back, on a 5-minute mark', () => {
    const trip = testTrip([stop('s1', 'a', 60)]);
    // Leave 10:20; day ends 6:00 PM; back leg 10 min + 10 slack, so free until 5:40 PM.
    expect(openTimeAtEnd(trip.days[0], buildTimeline(trip, trip.days[0]))).toEqual({ fromMin: 620, toMin: 1060 });
  });
});
