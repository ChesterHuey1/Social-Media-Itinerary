"""Itinerary generation, step one: which day each place goes on. The spec: "group places by area, then by
which trip days each one is open, then solve each day separately." Step two, the order within a day, is
optimize.py.

1. A place only goes on a day whose hotel is in the same city.
2. Within a city, places are split by area with k-means, one group per day, so nearby places share a day.
3. Bigger groups go to longer days.
4. A place that can't be visited within its day's hours (Tsukiji closes at 2 PM; the arrival day starts at
   1:50 PM) moves to the nearest day where it can. If no day works, it goes to the backlog with the reason.
5. A day that needs more time than it has gives its farthest places to the nearest day with room.
(Opening days of the week are not used yet: stored hours are the same every day.)

This module is pure, so it is tested without a database.
"""

import math
from dataclasses import dataclass

# Rough time a stop takes beyond its stay: travel to it plus 10 minutes of slack.
TRAVEL_ALLOWANCE_MIN = 25
# Plan days a little under full, leaving room for waits and the trip back to the hotel.
DAY_FILL = 0.85
KMEANS_ROUNDS = 20


@dataclass(frozen=True)
class PlaceToPlan:
    id: str
    city: str
    lat: float
    lng: float
    stay_min: int
    # Opening windows as (open, close) minutes from midnight. None means open all day.
    windows: tuple[tuple[int, int], ...] | None = None


@dataclass(frozen=True)
class DayToFill:
    number: int
    city: str
    available_min: int
    start_min: int = 0
    end_min: int = 24 * 60


@dataclass(frozen=True)
class Assignment:
    days: dict[int, list[str]]
    # Places with no day in their city, with the reason.
    unplaced: dict[str, str]


def _xy(p: PlaceToPlan, mid_lat: float) -> tuple[float, float]:
    return (p.lng * math.cos(math.radians(mid_lat)), p.lat)


def _distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _kmeans(points: list[tuple[float, float]], k: int) -> list[int]:
    """Cluster labels for each point. Deterministic: seeds are chosen farthest-first from the first point."""
    if k >= len(points):
        return list(range(len(points)))
    seeds = [points[0]]
    while len(seeds) < k:
        seeds.append(max(points, key=lambda p: min(_distance(p, s) for s in seeds)))
    centers = seeds
    labels = [0] * len(points)
    for _ in range(KMEANS_ROUNDS):
        labels = [min(range(k), key=lambda c, p=p: _distance(p, centers[c])) for p in points]
        moved = []
        for c in range(k):
            members = [p for p, label in zip(points, labels, strict=True) if label == c]
            moved.append(
                (sum(p[0] for p in members) / len(members), sum(p[1] for p in members) / len(members))
                if members
                else centers[c]
            )
        if moved == centers:
            break
        centers = moved
    return labels


def _center(places: list[PlaceToPlan], mid_lat: float) -> tuple[float, float]:
    xy = [_xy(p, mid_lat) for p in places]
    return (sum(x for x, _ in xy) / len(xy), sum(y for _, y in xy) / len(xy))


def can_visit(place: PlaceToPlan, day: DayToFill) -> bool:
    """True when the place is open long enough for its stay at some point within the day's hours."""
    if place.windows is None:
        return True
    return any(
        max(open_min, day.start_min) <= min(close_min, day.end_min) - place.stay_min
        for open_min, close_min in place.windows
    )


def _nearest_day(
    place: PlaceToPlan, options: list[DayToFill], planned: dict[int, list[PlaceToPlan]], mid_lat: float
) -> DayToFill:
    """The option whose planned places are centered closest to `place`; an empty day counts as right here."""
    here = _xy(place, mid_lat)
    return min(
        options, key=lambda d: _distance(here, _center(planned[d.number], mid_lat) if planned[d.number] else here)
    )


def _cost(places: list[PlaceToPlan]) -> int:
    return sum(p.stay_min + TRAVEL_ALLOWANCE_MIN for p in places)


def assign_days(places: list[PlaceToPlan], days: list[DayToFill]) -> Assignment:
    result: dict[int, list[str]] = {d.number: [] for d in days}
    unplaced: dict[str, str] = {}

    for city in sorted({p.city for p in places}):
        city_places = [p for p in places if p.city == city]
        city_days = [d for d in days if d.city == city and d.available_min > 0]
        if not city_days:
            for p in city_places:
                unplaced[p.id] = f"No day in {city} on this trip."
            continue

        mid_lat = sum(p.lat for p in city_places) / len(city_places)
        points = [_xy(p, mid_lat) for p in city_places]
        labels = _kmeans(points, len(city_days))
        groups = [
            [p for p, label in zip(city_places, labels, strict=True) if label == c] for c in range(len(city_days))
        ]

        # Bigger groups to longer days.
        groups.sort(key=_cost, reverse=True)
        by_length = sorted(city_days, key=lambda d: d.available_min, reverse=True)
        planned = {d.number: list(g) for d, g in zip(by_length, groups, strict=False)}
        budget = {d.number: d.available_min * DAY_FILL for d in city_days}

        # Places that can't be visited within their day's hours move to the nearest day where they can.
        for day in by_length:
            for place in [p for p in planned[day.number] if not can_visit(p, day)]:
                planned[day.number].remove(place)
                options = [d for d in city_days if can_visit(place, d)]
                if not options:
                    unplaced[place.id] = f"Not open during your day hours in {city}."
                    continue
                roomy = [d for d in options if _cost(planned[d.number]) + _cost([place]) <= budget[d.number]]
                planned[_nearest_day(place, roomy or options, planned, mid_lat).number].append(place)

        # Overfull days give their farthest places to the nearest day with room.
        for day in by_length:
            group = planned[day.number]
            while group and _cost(group) > budget[day.number]:
                c = _center(group, mid_lat)
                far = max(group, key=lambda p: _distance(_xy(p, mid_lat), c))
                group.remove(far)
                roomy = [
                    d
                    for d in city_days
                    if d.number != day.number
                    and can_visit(far, d)
                    and _cost(planned[d.number]) + _cost([far]) <= budget[d.number]
                ]
                if roomy:
                    planned[_nearest_day(far, roomy, planned, mid_lat).number].append(far)
                else:
                    # No day has room: keep it here and let the day's solver decide; it may move it to the backlog.
                    group.append(far)
                    break

        for number, group in planned.items():
            result[number].extend(p.id for p in group)
    return Assignment(result, unplaced)
