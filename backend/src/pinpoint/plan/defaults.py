"""Defaults for a new stop. The frontend has the same values in frontend/src/domain/timeline.ts
(defaultStayMinutes) and frontend/src/domain/tripEdits.ts (the color cycle); both test suites check them."""

# Time spent per objective. A stop with several objectives takes the longest.
DEFAULT_STAY_MIN = {"eat": 60, "explore": 90, "pictures": 45, "experience": 120}
FALLBACK_STAY_MIN = 60
STOP_COLOR_CYCLE = ("green", "blue", "amber", "ink")


def default_stay_minutes(objectives: list[str]) -> int:
    return max((DEFAULT_STAY_MIN[o] for o in objectives), default=FALLBACK_STAY_MIN)
