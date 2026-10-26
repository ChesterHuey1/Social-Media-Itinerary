import { describe, expect, it } from 'vitest';
import { testTrip, stop } from './testTrip';
import { buildTimeline, estimateLeg } from './timeline';

const timelineFor = (stops: ReturnType<typeof stop>[]) => {
  const trip = testTrip(stops);
  return buildTimeline(trip, trip.days[0]);
};

describe('buildTimeline', () => {
  it('chains arrival times from the day start through each leg, slack and stay', () => {
    const t = timelineFor([stop('s1', 'a', 60), stop('s2', 'b', 30)]);
    // 9:00 + 10 min walk + 10 min slack = 9:20; leave 10:20; + 20 = 10:40.
    expect(t.stops.map((x) => [x.arriveMin, x.leaveMin])).toEqual([
      [560, 620],
      [640, 670],
    ]);
    expect(t.backAtMin).toBe(690);
    expect(t.overrunMin).toBe(0);
  });

  it('recomputes times when the order changes', () => {
    const t = timelineFor([stop('s2', 'b', 30), stop('s1', 'a', 60)]);
    expect(t.stops.map((x) => x.arriveMin)).toEqual([560, 610]);
  });

  it('flags a stop you would reach more than 20 minutes before it opens', () => {
    // Arrive at c (opens noon) at 10:40, 80 minutes early: the order is wrong.
    const t = timelineFor([stop('s1', 'a', 60), stop('s2', 'c', 60)]);
    expect(t.stops[1].problem).toEqual({ kind: 'hours', check: { ok: false, reason: 'not-open-yet', opensAt: 720 } });
  });

  it('waits up to 20 minutes for opening', () => {
    // Leave a at 11:20, arrive at c at 11:40, wait 20 minutes until noon.
    const t = timelineFor([stop('s1', 'a', 120), stop('s2', 'c', 60)]);
    expect(t.stops[1].arriveMin).toBe(720);
    expect(t.stops[1].problem).toBeNull();
  });

  it('leaves the hotel later when the first stop opens late', () => {
    const t = timelineFor([stop('s1', 'c', 60)]);
    expect(t.stops[0].arriveMin).toBe(720);
    expect(t.stops[0].problem).toBeNull();
  });

  it('estimates legs with the same numbers as the backend', () => {
    // Same cases as backend/tests/test_optimize.py::test_estimate_matches_the_frontend.
    expect(estimateLeg({ lat: 35.6654, lng: 139.7707 }, { lat: 35.6672, lng: 139.764 })).toMatchObject({ mode: 'walk', minutes: 12, distanceM: 850 });
    expect(estimateLeg({ lat: 35.6614, lng: 139.7016 }, { lat: 35.6491, lng: 139.7898 })).toMatchObject({ mode: 'transit', minutes: 35, distanceM: 10500 });
  });

  it('waits for a locked time when early, which also clears an hours problem', () => {
    const t = timelineFor([stop('s1', 'c', 60, 720)]);
    expect(t.stops[0].arriveMin).toBe(720);
    expect(t.stops[0].problem).toBeNull();
  });

  it('flags a locked stop the day cannot reach in time', () => {
    const t = timelineFor([stop('s1', 'a', 180), stop('s2', 'b', 30, 600)]);
    expect(t.stops[1].problem).toEqual({ kind: 'lock', lockedAtMin: 600, earliestMin: 760 });
  });

  it('reports how far the day runs past its end time', () => {
    const t = timelineFor([stop('s1', 'a', 500)]);
    // Arrive 9:20, leave 5:40 PM, back 6:00 PM exactly; one more minute of stay pushes it over.
    expect(t.overrunMin).toBe(0);
    expect(timelineFor([stop('s1', 'a', 520)]).overrunMin).toBe(20);
  });

  it('estimates a leg for a pair with no known route, labeled as an estimate', () => {
    const near = estimateLeg({ lat: 35, lng: 139 }, { lat: 35.005, lng: 139 });
    const far = estimateLeg({ lat: 35, lng: 139 }, { lat: 35.05, lng: 139 });
    expect(near).toMatchObject({ mode: 'walk', source: 'estimate' });
    expect(far).toMatchObject({ mode: 'transit', source: 'estimate' });
  });
});
