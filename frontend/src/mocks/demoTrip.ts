// Sample trip for building the layout before the API exists.
// Shapes match src/domain/types.ts, which is what the API will return.
import { legKey } from '../domain/timeline';
import type { Leg, LegKey, Place, Trip } from '../domain/types';

const h = (hours: number, minutes = 0) => hours * 60 + minutes;

const places: Record<string, Place> = {
  tsukiji: {
    id: 'tsukiji', name: 'Tsukiji Outer Market', area: 'Chuo', city: 'Tokyo',
    location: { lat: 35.6654, lng: 139.7707 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(5), closeMin: h(14) }] },
    lastEntryMin: 30, cost: { usd: 20, per: 'person', source: 'deepseek' }, needsBooking: false,
    tip: { text: 'Most stalls wind down by early afternoon. Go before 10 for the shortest lines.', source: 'deepseek' },
    objectives: ['eat', 'explore'],
  },
  teamlab: {
    id: 'teamlab', name: 'teamLab Planets', area: 'Toyosu', city: 'Tokyo',
    location: { lat: 35.6491, lng: 139.7898 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(9), closeMin: h(22) }] },
    lastEntryMin: 60, cost: { usd: 25, per: 'ticket', source: 'scrape' }, needsBooking: true,
    tip: { text: 'Timed entry. Part of the walk is through shin-deep water, so wear clothes you can roll up.', source: 'scrape' },
    objectives: ['experience', 'pictures'],
  },
  ichiran: {
    id: 'ichiran', name: 'Ichiran Shibuya', area: 'Shibuya', city: 'Tokyo',
    location: { lat: 35.6614, lng: 139.7016 },
    hours: { kind: 'always' },
    lastEntryMin: 0, cost: { usd: 15, per: 'person', source: 'deepseek' }, needsBooking: false,
    tip: { text: 'Order at the ticket machine by the door, then fill in the flavor sheet at your booth.', source: 'deepseek' },
    objectives: ['eat'],
  },
  shibuyaSky: {
    id: 'shibuyaSky', name: 'Shibuya Sky', area: 'Shibuya', city: 'Tokyo',
    location: { lat: 35.6584, lng: 139.7023 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(10), closeMin: h(22, 30) }] },
    lastEntryMin: 70, cost: { usd: 18, per: 'ticket', source: 'scrape' }, needsBooking: true,
    tip: { text: 'Sunset time slots sell out first. Buy online for a set entry time.', source: 'deepseek' },
    objectives: ['explore', 'pictures'],
  },
  nonbei: {
    id: 'nonbei', name: 'Nonbei Yokocho', area: 'Shibuya', city: 'Tokyo',
    location: { lat: 35.6596, lng: 139.7036 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(17), closeMin: h(24) }] },
    lastEntryMin: 30, cost: { usd: 25, per: 'person', source: 'deepseek' }, needsBooking: false,
    tip: { text: 'Tiny bars that seat six to eight. Some charge a seat fee, so check the sign by the door.', source: 'deepseek' },
    objectives: ['experience'],
  },
  uobei: {
    id: 'uobei', name: 'Uobei Shibuya Dogenzaka', area: 'Shibuya', city: 'Tokyo',
    location: { lat: 35.6575, lng: 139.6977 },
    hours: { kind: 'windows', source: 'scrape', windows: [{ openMin: h(11), closeMin: h(23) }] },
    lastEntryMin: 30, cost: { usd: 15, per: 'person', source: 'deepseek' }, needsBooking: false,
    tip: { text: 'Order on the tablet at your seat. Plates arrive on a rail a minute later.', source: 'deepseek' },
    objectives: ['eat'],
  },
  itoya: {
    id: 'itoya', name: 'Ginza Itoya', area: 'Ginza', city: 'Tokyo',
    location: { lat: 35.672, lng: 139.7672 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(10), closeMin: h(20) }] },
    lastEntryMin: 30, cost: null, needsBooking: false,
    tip: { text: 'Twelve floors of stationery. The top floor grows the lettuce served in the cafe.', source: 'deepseek' },
    objectives: ['explore'],
  },
  kagari: {
    id: 'kagari', name: 'Ginza Kagari', area: 'Ginza', city: 'Tokyo',
    location: { lat: 35.6716, lng: 139.7625 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(11), closeMin: h(21, 30) }] },
    lastEntryMin: 30, cost: { usd: 12, per: 'person', source: 'deepseek' }, needsBooking: false,
    tip: { text: 'Expect a line at dinner. It moves fast.', source: 'deepseek' },
    objectives: ['eat'],
  },
  sensoji: {
    id: 'sensoji', name: 'Senso-ji', area: 'Asakusa', city: 'Tokyo',
    location: { lat: 35.7148, lng: 139.7967 },
    hours: { kind: 'always' },
    lastEntryMin: 0, cost: null, needsBooking: false,
    tip: { text: 'The grounds stay open after the main hall closes at 5 PM.', source: 'deepseek' },
    objectives: ['explore', 'pictures'],
  },
  ueno: {
    id: 'ueno', name: 'Ueno Park', area: 'Ueno', city: 'Tokyo',
    location: { lat: 35.7156, lng: 139.7745 },
    hours: { kind: 'always' },
    lastEntryMin: 0, cost: null, needsBooking: false, tip: null,
    objectives: ['explore'],
  },
  meiji: {
    id: 'meiji', name: 'Meiji Jingu', area: 'Harajuku', city: 'Tokyo',
    location: { lat: 35.6764, lng: 139.6993 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(6, 40), closeMin: h(16, 20) }] },
    lastEntryMin: 0, cost: null, needsBooking: false, tip: null,
    objectives: ['explore'],
  },
  goldenGai: {
    id: 'goldenGai', name: 'Golden Gai', area: 'Shinjuku', city: 'Tokyo',
    location: { lat: 35.6938, lng: 139.7036 },
    hours: { kind: 'unconfirmed' },
    lastEntryMin: 0, cost: null, needsBooking: false, tip: null,
    objectives: ['experience'],
  },
  omoide: {
    id: 'omoide', name: 'Omoide Yokocho', area: 'Shinjuku', city: 'Tokyo',
    location: { lat: 35.6929, lng: 139.6995 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(11), closeMin: h(23) }] },
    lastEntryMin: 30, cost: { usd: 20, per: 'person', source: 'deepseek' }, needsBooking: false, tip: null,
    objectives: ['eat'],
  },
  kappabashi: {
    id: 'kappabashi', name: 'Kappabashi Street', area: 'Asakusa', city: 'Tokyo',
    location: { lat: 35.7139, lng: 139.7884 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(10), closeMin: h(17) }] },
    lastEntryMin: 0, cost: null, needsBooking: false, tip: null,
    objectives: ['explore'],
  },
  fushimi: {
    id: 'fushimi', name: 'Fushimi Inari Taisha', area: 'Fushimi', city: 'Kyoto',
    location: { lat: 34.9671, lng: 135.7727 },
    hours: { kind: 'always' },
    lastEntryMin: 0, cost: null, needsBooking: false,
    tip: { text: 'The crowds thin out past the halfway point of the climb.', source: 'deepseek' },
    objectives: ['pictures', 'explore'],
  },
  nishiki: {
    id: 'nishiki', name: 'Nishiki Market', area: 'Nakagyo', city: 'Kyoto',
    location: { lat: 35.005, lng: 135.7649 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(10), closeMin: h(18) }] },
    lastEntryMin: 30, cost: { usd: 18, per: 'person', source: 'deepseek' }, needsBooking: false, tip: null,
    objectives: ['eat'],
  },
  kinkakuji: {
    id: 'kinkakuji', name: 'Kinkaku-ji', area: 'Kita', city: 'Kyoto',
    location: { lat: 35.0394, lng: 135.7292 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(9), closeMin: h(17) }] },
    lastEntryMin: 0, cost: { usd: 3, per: 'ticket', source: 'google' }, needsBooking: false, tip: null,
    objectives: ['pictures'],
  },
  dotonbori: {
    id: 'dotonbori', name: 'Dotonbori', area: 'Namba', city: 'Osaka',
    location: { lat: 34.6687, lng: 135.5013 },
    hours: { kind: 'always' }, lastEntryMin: 0, cost: null, needsBooking: false, tip: null,
    objectives: ['eat', 'explore'],
  },
  gwangjang: {
    id: 'gwangjang', name: 'Gwangjang Market', area: 'Jongno', city: 'Seoul',
    location: { lat: 37.5701, lng: 127.0099 },
    hours: { kind: 'windows', source: 'google', windows: [{ openMin: h(9), closeMin: h(23) }] },
    lastEntryMin: 30, cost: null, needsBooking: false, tip: null,
    objectives: ['eat'],
  },
};

const walk = (minutes: number, distanceM: number): Leg => ({
  mode: 'walk', minutes, distanceM, line: null, fareUsd: null, source: 'routes',
});
const train = (minutes: number, distanceM: number, line: string, fareUsd: number): Leg => ({
  mode: 'transit', minutes, distanceM, line, fareUsd, source: 'routes',
});

/** Legs for a hotel → stops → hotel loop, keyed by node pair. */
function route(stayId: string, placeIds: string[], legs: Leg[]): Partial<Record<LegKey, Leg>> {
  const nodes = [stayId, ...placeIds, stayId];
  return Object.fromEntries(legs.map((leg, i) => [legKey(nodes[i], nodes[i + 1]), leg]));
}

const GINZA_HOTEL = 'Mitsui Garden Hotel Ginza Premier';
const KYOTO_HOTEL = 'Hotel Kanra Kyoto';

export const demoTrip: Trip = {
  id: 'demo',
  name: 'Tokyo & Kyoto',
  startDate: '2026-11-12',
  endDate: '2026-11-17',
  travelers: 1,
  budgetUsd: 3000,
  places,
  stays: [
    {
      id: 'ginza', name: GINZA_HOTEL, city: 'Tokyo', location: { lat: 35.6672, lng: 139.764 },
      checkInDate: '2026-11-12', checkOutDate: '2026-11-15', checkInMin: h(15), checkOutMin: h(11), costUsd: 420,
    },
    {
      id: 'kanra', name: KYOTO_HOTEL, city: 'Kyoto', location: { lat: 34.9978, lng: 135.759 },
      checkInDate: '2026-11-15', checkOutDate: '2026-11-17', checkInMin: h(15), checkOutMin: h(11), costUsd: 220,
    },
  ],
  flights: [
    {
      id: 'out', airline: 'Japan Airlines', number: 'JL 1', from: 'SFO', to: 'HND', date: '2026-11-12',
      timeMin: h(11, 40), direction: 'arrive', international: true, costUsd: 980,
    },
    {
      id: 'home', airline: 'Japan Airlines', number: 'JL 61', from: 'KIX', to: 'SFO', date: '2026-11-17',
      timeMin: h(16, 15), direction: 'depart', international: true, costUsd: null,
    },
  ],
  days: [
    {
      number: 1, date: '2026-11-12', title: 'Ginza on arrival', stayId: 'ginza',
      note: 'Land 11:40 AM, 90 min for immigration and bags, 40 min to the hotel',
      startMin: h(13, 50), endMin: h(21),
      startRows: [
        { kind: 'flight', text: 'Land at HND', atMin: h(11, 40) },
        { kind: 'hotel', text: `Drop bags at ${GINZA_HOTEL}`, atMin: h(13, 50) },
      ],
      endRows: [{ kind: 'hotel', text: `Check in: ${GINZA_HOTEL}`, atMin: h(21) }],
      stops: [
        {
          id: 'd1s1', placeId: 'itoya', title: null, color: 'blue', objectives: ['explore'],
          stay: { minutes: 75, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd1s2', placeId: 'kagari', title: null, color: 'amber', objectives: ['eat'],
          stay: { minutes: 45, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
      ],
    },
    {
      number: 2, date: '2026-11-13', title: 'Markets, art and Shibuya', stayId: 'ginza', note: null,
      startMin: h(8, 30), endMin: h(21, 30),
      startRows: [{ kind: 'hotel', text: `Leave ${GINZA_HOTEL}`, atMin: h(8, 30) }],
      endRows: [{ kind: 'hotel', text: `Back at ${GINZA_HOTEL}`, atMin: h(21, 30) }],
      stops: [
        {
          id: 'd2s1', placeId: 'tsukiji', title: null, color: 'amber', objectives: ['eat', 'explore'],
          stay: { minutes: 90, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd2s2', placeId: 'teamlab', title: null, color: 'blue', objectives: ['experience', 'pictures'],
          stay: { minutes: 120, source: 'user' }, lockedAtMin: h(11),
          comments: [{ id: 'c1', body: 'QR tickets are in the confirmation email.', createdAt: '2026-10-20' }],
        },
        {
          id: 'd2s3', placeId: 'ichiran', title: null, color: 'green', objectives: ['eat'],
          stay: { minutes: 45, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd2s4', placeId: 'shibuyaSky', title: null, color: 'ink', objectives: ['explore', 'pictures'],
          stay: { minutes: 75, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd2s5', placeId: 'nonbei', title: null, color: 'amber', objectives: ['experience'],
          stay: { minutes: 45, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd2s6', placeId: 'uobei', title: null, color: 'green', objectives: ['eat'],
          stay: { minutes: 60, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
      ],
    },
    {
      number: 3, date: '2026-11-14', title: 'Asakusa and Ueno', stayId: 'ginza', note: null,
      startMin: h(8, 30), endMin: h(21, 30),
      startRows: [{ kind: 'hotel', text: `Leave ${GINZA_HOTEL}`, atMin: h(8, 30) }],
      endRows: [{ kind: 'hotel', text: `Back at ${GINZA_HOTEL}`, atMin: h(21, 30) }],
      stops: [
        {
          id: 'd3s1', placeId: 'sensoji', title: null, color: 'amber', objectives: ['explore', 'pictures'],
          stay: { minutes: 75, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd3s2', placeId: 'ueno', title: null, color: 'green', objectives: ['explore'],
          stay: { minutes: 90, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
      ],
    },
    {
      number: 4, date: '2026-11-15', title: 'Move to Kyoto', stayId: 'kanra',
      note: 'Out by 11:00 AM, in from 3:00 PM. A Drop bags stop fills the gap.',
      startMin: h(9), endMin: h(21),
      startRows: [{ kind: 'hotel', text: `Check out: ${GINZA_HOTEL}`, atMin: h(9) }],
      endRows: [{ kind: 'hotel', text: `Check in: ${KYOTO_HOTEL}`, atMin: h(21) }],
      stops: [],
    },
    {
      number: 5, date: '2026-11-16', title: 'Shrines and Nishiki', stayId: 'kanra', note: null,
      startMin: h(8, 30), endMin: h(21, 30),
      startRows: [{ kind: 'hotel', text: `Leave ${KYOTO_HOTEL}`, atMin: h(8, 30) }],
      endRows: [{ kind: 'hotel', text: `Back at ${KYOTO_HOTEL}`, atMin: h(21, 30) }],
      stops: [
        {
          id: 'd5s1', placeId: 'fushimi', title: null, color: 'amber', objectives: ['pictures', 'explore'],
          stay: { minutes: 120, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd5s2', placeId: 'nishiki', title: null, color: 'green', objectives: ['eat'],
          stay: { minutes: 60, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
        {
          id: 'd5s3', placeId: 'kinkakuji', title: null, color: 'blue', objectives: ['pictures'],
          stay: { minutes: 75, source: 'estimate' }, lockedAtMin: null, comments: [],
        },
      ],
    },
    {
      number: 6, date: '2026-11-17', title: 'Fly home', stayId: 'kanra',
      note: 'Departs 4:15 PM, 3 h at the airport, 60 min to KIX',
      startMin: h(8, 30), endMin: h(12, 15),
      startRows: [{ kind: 'hotel', text: `Check out: ${KYOTO_HOTEL}`, atMin: h(8, 30) }],
      endRows: [{ kind: 'flight', text: 'Leave for KIX', atMin: h(12, 15) }],
      stops: [],
    },
  ],
  legs: {
    ...route('ginza', ['itoya', 'kagari'], [walk(8, 600), walk(6, 400), walk(5, 350)]),
    ...route(
      'ginza',
      ['tsukiji', 'teamlab', 'ichiran', 'shibuyaSky', 'nonbei', 'uobei'],
      [
        walk(12, 900),
        train(25, 4200, 'Yurikamome Line', 2.1),
        train(38, 11000, 'Yurikamome, then Ginza Line', 2.6),
        walk(8, 550),
        walk(10, 700),
        walk(9, 650),
        train(28, 6400, 'Ginza Line', 1.4),
      ],
    ),
    ...route('ginza', ['sensoji', 'ueno'], [train(25, 5800, 'Ginza Line', 1.4), walk(25, 2000), train(22, 5200, 'Ginza Line', 1.4)]),
    ...route(
      'kanra',
      ['fushimi', 'nishiki', 'kinkakuji'],
      [
        train(15, 4000, 'JR Nara Line', 1.0),
        train(25, 5500, 'Keihan Line', 1.7),
        train(40, 7000, 'City Bus 205', 1.6),
        train(35, 7500, 'City Bus 205', 1.6),
      ],
    ),
  },
  backlog: [
    { placeId: 'meiji', reason: "Closes at 4:20 PM. With this order you'd get there at 4:45 PM." },
    { placeId: 'goldenGai', reason: 'From a Reel. Hours not confirmed.' },
    { placeId: 'kappabashi', reason: 'Added by search. Fits Day 3.' },
    { placeId: 'omoide', reason: "From a Reel. Didn't fit Day 2." },
  ],
  expenses: [
    { id: 'e1', amountUsd: 160, category: 'food', note: 'Meals so far', date: '2026-11-12' },
    { id: 'e2', amountUsd: 60, category: 'tickets', note: 'teamLab and Shibuya Sky', date: '2026-10-20' },
    { id: 'e3', amountUsd: 20, category: 'transit', note: 'Suica top-up', date: '2026-11-12' },
  ],
  savedPlaces: [
    { placeId: 'ichiran', from: 'reel', reelCount: 1, included: true },
    { placeId: 'teamlab', from: 'reel', reelCount: 2, included: true },
    { placeId: 'tsukiji', from: 'search', reelCount: 0, included: true },
    { placeId: 'shibuyaSky', from: 'reel', reelCount: 1, included: true },
    { placeId: 'nonbei', from: 'reel', reelCount: 1, included: true },
    { placeId: 'uobei', from: 'search', reelCount: 0, included: true },
    { placeId: 'goldenGai', from: 'reel', reelCount: 1, included: false },
    { placeId: 'meiji', from: 'reel', reelCount: 1, included: true },
    { placeId: 'fushimi', from: 'reel', reelCount: 1, included: true },
    { placeId: 'nishiki', from: 'search', reelCount: 0, included: true },
    { placeId: 'kinkakuji', from: 'reel', reelCount: 1, included: true },
    { placeId: 'dotonbori', from: 'reel', reelCount: 1, included: false },
    { placeId: 'gwangjang', from: 'reel', reelCount: 1, included: false },
  ],
  savedPosts: [
    { id: 'p1', url: 'https://www.instagram.com/reel/placeholder1/', status: 'done' },
    { id: 'p2', url: 'https://www.instagram.com/reel/placeholder2/', status: 'needs_review' },
  ],
};
