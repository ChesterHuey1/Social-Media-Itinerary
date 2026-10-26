"""Optimize route for one day, as the spec's "How Optimize route solves it" describes.

OR-Tools routing with a time dimension:
1. Nodes are the hotel (start and end) plus each stop.
2. Moving from one node to the next costs its travel time; the time dimension also adds the stay.
3. Each stop's arrival is limited to when it is open, minus last entry and minus the stay so it is
   still open when you leave. Breaks between two openings are removed from the range.
4. Waiting before a stop is capped at 20 minutes. Before the first stop you just leave the hotel later.
5. A locked stop's arrival is exactly its locked time.
6. Every stop has a drop penalty, so one that can't fit is dropped instead of the whole solve failing.
7. The objective is the least total travel time, which also removes backtracking. A smaller cost on
   when the day ends breaks ties toward using the morning instead of leaving the hotel late.

This module is pure: it takes plain values and returns an order, so it is tested without a database.
"""

from collections.abc import Callable
from dataclasses import dataclass

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

# Same arithmetic as frontend/src/domain/timeline.ts: travel + 10 minutes of slack per leg, exact minutes.
LEG_SLACK_MIN = 10
MAX_WAIT_MIN = 20
DROP_PENALTY = 100_000
LOCKED_DROP_PENALTY = 10_000_000
SOLVE_SECONDS = 2


@dataclass(frozen=True)
class Window:
    open_min: int
    close_min: int


@dataclass(frozen=True)
class StopInput:
    id: str
    stay_min: int
    # None means open all day.
    windows: list[Window] | None
    last_entry_min: int
    locked_at_min: int | None


@dataclass(frozen=True)
class DayPlan:
    order: list[str]
    dropped: list[str]


def _arrival_ranges(stop: StopInput, day_start: int, day_end: int) -> list[tuple[int, int]]:
    """Every arrival time that passes the three opening-hours rules, as [earliest, latest] ranges."""
    if stop.locked_at_min is not None:
        return [(stop.locked_at_min, stop.locked_at_min)]
    windows = stop.windows if stop.windows is not None else [Window(day_start, day_end)]
    ranges = []
    for w in windows:
        latest = min(w.close_min - stop.last_entry_min, w.close_min - stop.stay_min)
        earliest = max(w.open_min, day_start)
        if earliest <= latest:
            ranges.append((earliest, latest))
    return ranges


def optimize_day(
    stops: list[StopInput],
    travel_min: Callable[[int, int], int],
    day_start: int,
    day_end: int,
) -> DayPlan:
    """`travel_min(i, j)` is minutes from node i to node j, where node 0 is the hotel and node k is stops[k - 1]."""
    if not stops:
        return DayPlan([], [])

    count = len(stops) + 1
    manager = pywrapcp.RoutingIndexManager(count, 1, 0)
    routing = pywrapcp.RoutingModel(manager)

    def leg(i: int, j: int) -> int:
        return 0 if i == j else travel_min(i, j) + LEG_SLACK_MIN

    def travel_cost(from_index: int, to_index: int) -> int:
        return leg(manager.IndexToNode(from_index), manager.IndexToNode(to_index))

    def time_used(from_index: int, to_index: int) -> int:
        i = manager.IndexToNode(from_index)
        stay = stops[i - 1].stay_min if i > 0 else 0
        return stay + leg(i, manager.IndexToNode(to_index))

    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitCallback(travel_cost))
    time_callback = routing.RegisterTransitCallback(time_used)
    routing.AddDimension(time_callback, MAX_WAIT_MIN, day_end, False, "time")
    time = routing.GetDimensionOrDie("time")

    start, end = routing.Start(0), routing.End(0)
    # You can leave the hotel later than the day starts, so the first stop never needs a capped wait.
    time.CumulVar(start).SetRange(day_start, day_end)
    time.CumulVar(end).SetRange(day_start, day_end)
    # Between plans with equal travel, prefer the one that starts the morning and ends the day earliest.
    time.SetCumulVarSoftUpperBound(end, day_start, 1)

    for k, stop in enumerate(stops, start=1):
        index = manager.NodeToIndex(k)
        ranges = _arrival_ranges(stop, day_start, day_end)
        penalty = LOCKED_DROP_PENALTY if stop.locked_at_min is not None else DROP_PENALTY
        routing.AddDisjunction([index], penalty)
        if not ranges:
            routing.solver().Add(routing.ActiveVar(index) == 0)
            continue
        cumul = time.CumulVar(index)
        cumul.SetRange(ranges[0][0], ranges[-1][1])
        for (_, gap_start), (gap_end, _) in zip(ranges, ranges[1:], strict=False):
            if gap_start + 1 <= gap_end - 1:
                cumul.RemoveInterval(gap_start + 1, gap_end - 1)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = SOLVE_SECONDS
    solution = routing.SolveWithParameters(params)
    if solution is None:
        return DayPlan([], [s.id for s in stops])

    order = []
    index = solution.Value(routing.NextVar(start))
    while not routing.IsEnd(index):
        order.append(stops[manager.IndexToNode(index) - 1].id)
        index = solution.Value(routing.NextVar(index))
    kept = set(order)
    return DayPlan(order, [s.id for s in stops if s.id not in kept])
