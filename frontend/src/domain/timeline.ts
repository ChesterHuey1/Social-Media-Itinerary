import { distanceM } from './geo';
import { formatClock } from './format';
import { checkVisit, visitProblemText, type VisitCheck } from './hours';
import { stayForDay } from './trip';
import type { Day, LatLng, Leg, LegKey, Objective, Place, Stop, Trip } from './types';

/** Extra minutes per leg for finding the entrance or a late train. */
export const LEG_SLACK_MIN = 10;
/** Arriving up to this long before opening, you wait. Any earlier means the order is wrong (spec). */
export const MAX_WAIT_MIN = 20;

const DETOUR_FACTOR = 1.3;
const WALK_LIMIT_M = 1500;
const WALK_M_PER_MIN = 75;
const TRANSIT_M_PER_MIN = 400;
const TRANSIT_WAIT_MIN = 8;

/** Default time spent per objective. A stop with several takes the longest. */
const DEFAULT_STAY_MIN: Record<Objective, number> = { eat: 60, explore: 90, pictures: 45, experience: 120 };
const FALLBACK_STAY_MIN = 60;

export function defaultStayMinutes(objectives: Objective[]): number {
  return objectives.length === 0 ? FALLBACK_STAY_MIN : Math.max(...objectives.map((o) => DEFAULT_STAY_MIN[o]));
}

export type StopProblem =
  | { kind: 'hours'; check: Exclude<VisitCheck, { ok: true }> }
  | { kind: 'lock'; lockedAtMin: number; earliestMin: number };

export function stopProblemText(problem: StopProblem, arriveMin: number): string {
  return problem.kind === 'lock'
    ? `Can't make your ${formatClock(problem.lockedAtMin)} time. Earliest arrival is ${formatClock(problem.earliestMin)}.`
    : visitProblemText(problem.check, arriveMin);
}

export type TimelineStop = {
  stop: Stop;
  place: Place;
  legBefore: Leg;
  arriveMin: number;
  leaveMin: number;
  problem: StopProblem | null;
};

export type Timeline = {
  stops: TimelineStop[];
  returnLeg: Leg | null;
  backAtMin: number;
  /** Minutes past the day's end time. Zero when the day fits. */
  overrunMin: number;
};

type RouteNode = { id: string; location: LatLng };

export function legKey(fromId: string, toId: string): LegKey {
  return `${fromId}>${toId}`;
}

/** Straight-line guess: walk up to 1.5 km, transit beyond. Replaced by the Routes API later. */
export function estimateLeg(from: LatLng, to: LatLng): Leg {
  const meters = Math.round((distanceM(from, to) * DETOUR_FACTOR) / 50) * 50;
  if (meters <= WALK_LIMIT_M) {
    return { mode: 'walk', minutes: Math.max(1, Math.ceil(meters / WALK_M_PER_MIN)), distanceM: meters, line: null, fareUsd: null, source: 'estimate' };
  }
  return {
    mode: 'transit',
    minutes: TRANSIT_WAIT_MIN + Math.ceil(meters / TRANSIT_M_PER_MIN),
    distanceM: meters,
    line: null,
    fareUsd: null,
    source: 'estimate',
  };
}

function legBetween(trip: Trip, from: RouteNode, to: RouteNode): Leg {
  return trip.legs[legKey(from.id, to.id)] ?? estimateLeg(from.location, to.location);
}

/**
 * Walks the day in order: leave the hotel at the start time, travel each leg plus slack,
 * wait for a locked time if early, wait for opening if within MAX_WAIT_MIN (or leave the hotel later
 * for the first stop), and stay the planned minutes. Every stop is checked against its opening hours
 * with the arrival time it actually gets. backend/src/pinpoint/plan/optimize.py plans by the same rules.
 */
export function buildTimeline(trip: Trip, day: Day): Timeline {
  const stay = stayForDay(trip, day);
  const hotel: RouteNode = { id: stay.id, location: stay.location };

  let previous = hotel;
  let clock = day.startMin;
  const stops: TimelineStop[] = day.stops.map((stop) => {
    const place = trip.places[stop.placeId];
    const node: RouteNode = { id: place.id, location: place.location };
    const legBefore = legBetween(trip, previous, node);
    // Exact minutes, no rounding, so this matches the backend optimizer's arithmetic.
    const earliest = clock + legBefore.minutes + LEG_SLACK_MIN;

    let arriveMin = earliest;
    let problem: StopProblem | null = null;
    if (stop.lockedAtMin !== null) {
      if (earliest > stop.lockedAtMin) problem = { kind: 'lock', lockedAtMin: stop.lockedAtMin, earliestMin: earliest };
      else arriveMin = stop.lockedAtMin;
    }
    if (!problem) {
      let check = checkVisit(arriveMin, stop.stay.minutes, place.hours, place.lastEntryMin);
      // Wait for opening: for the first stop you just leave later; elsewhere, up to MAX_WAIT_MIN.
      const isFirst = previous === hotel;
      if (!check.ok && check.reason === 'not-open-yet' && (isFirst || check.opensAt - arriveMin <= MAX_WAIT_MIN)) {
        arriveMin = check.opensAt;
        check = checkVisit(arriveMin, stop.stay.minutes, place.hours, place.lastEntryMin);
      }
      if (!check.ok) problem = { kind: 'hours', check };
    }

    const leaveMin = arriveMin + stop.stay.minutes;
    previous = node;
    clock = leaveMin;
    return { stop, place, legBefore, arriveMin, leaveMin, problem };
  });

  const returnLeg = stops.length > 0 ? legBetween(trip, previous, hotel) : null;
  const backAtMin = returnLeg ? clock + returnLeg.minutes + LEG_SLACK_MIN : day.startMin;
  return { stops, returnLeg, backAtMin, overrunMin: Math.max(0, backAtMin - day.endMin) };
}
