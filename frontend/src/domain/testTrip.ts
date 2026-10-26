// Small hand-built trip for domain tests. Every leg is 10 minutes, so times are easy to follow.
import { legKey } from './timeline';
import type { Hours, Leg, Place, Stop, Trip } from './types';

const tenMinWalk: Leg = { mode: 'walk', minutes: 10, distanceM: 800, line: null, fareUsd: null, source: 'routes' };

function place(id: string, hours: Hours): Place {
  return {
    id, name: id.toUpperCase(), area: 'Area', city: 'City', location: { lat: 35, lng: 139 + id.length / 1000 },
    hours, lastEntryMin: 0, cost: null, needsBooking: false, tip: null, objectives: ['explore'],
  };
}

export function stop(id: string, placeId: string, minutes: number, lockedAtMin: number | null = null): Stop {
  return {
    id, placeId, title: null, color: 'amber', objectives: ['explore'],
    stay: { minutes, source: 'estimate' }, lockedAtMin, comments: [],
  };
}

export function testTrip(stops: Stop[]): Trip {
  const places = {
    a: place('a', { kind: 'always' }),
    b: place('b', { kind: 'always' }),
    // Opens at noon.
    c: place('c', { kind: 'windows', source: 'google', windows: [{ openMin: 720, closeMin: 1200 }] }),
    d: place('d', { kind: 'always' }),
  };
  const ids = ['hotel', ...Object.keys(places)];
  const legs = Object.fromEntries(ids.flatMap((from) => ids.filter((to) => to !== from).map((to) => [legKey(from, to), tenMinWalk])));
  return {
    id: 't', name: 'Test', startDate: '2026-01-01', endDate: '2026-01-02', travelers: 1, budgetUsd: 1000,
    stays: [{
      id: 'hotel', name: 'Hotel', city: 'City', location: { lat: 35, lng: 139 },
      checkInDate: '2026-01-01', checkOutDate: '2026-01-02', checkInMin: 900, checkOutMin: 660, costUsd: null,
    }],
    flights: [],
    // Day runs 9:00 AM to 6:00 PM.
    days: [{ number: 1, date: '2026-01-01', title: 'T', note: null, stayId: 'hotel', startMin: 540, endMin: 1080, startRows: [], endRows: [], stops }],
    legs,
    backlog: [{ placeId: 'd', reason: 'Spare' }],
    expenses: [], places, savedPlaces: [], savedPosts: [],
  };
}
