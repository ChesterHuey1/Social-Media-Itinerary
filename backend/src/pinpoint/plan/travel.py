"""Travel time between two route nodes: a stored leg if we have one, else a straight-line estimate.

The estimate is the same as frontend/src/domain/timeline.ts `estimateLeg`, and both test files check the
same example values, so the two can't drift apart. Google's Routes matrix replaces it once a key is set.
"""

import math
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_000
DETOUR_FACTOR = 1.3
WALK_LIMIT_M = 1500
WALK_M_PER_MIN = 75
TRANSIT_M_PER_MIN = 400
TRANSIT_WAIT_MIN = 8


@dataclass(frozen=True)
class Node:
    id: str
    lat: float
    lng: float


@dataclass(frozen=True)
class Travel:
    mode: str
    minutes: int
    distance_m: int
    source: str


def distance_m(a: Node, b: Node) -> float:
    d_lat = math.radians(b.lat - a.lat)
    d_lng = math.radians(b.lng - a.lng)
    h = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(a.lat)) * math.cos(math.radians(b.lat)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def estimate(a: Node, b: Node) -> Travel:
    # Same rounding as the frontend: to the nearest 50 m with halves rounded up, like JavaScript's
    # Math.round (Python's round() would send halves to the even number), then whole minutes rounded up.
    meters = math.floor(distance_m(a, b) * DETOUR_FACTOR / 50 + 0.5) * 50
    if meters <= WALK_LIMIT_M:
        return Travel("walk", max(1, math.ceil(meters / WALK_M_PER_MIN)), meters, "estimate")
    return Travel("transit", TRANSIT_WAIT_MIN + math.ceil(meters / TRANSIT_M_PER_MIN), meters, "estimate")
