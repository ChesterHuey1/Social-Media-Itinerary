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

  it('flags a stop that is closed when you arrive, with its opening time', () => {
    const t = timelineFor([stop('s1', 'c', 60)]);
    expect(t.stops[0].problem).toEqual({ kind: 'hours', check: { ok: false, reason: 'not-open-yet', opensAt: 720 } });
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
