"""Reads facts out of a stored page's text: opening hours, last entry, price and booking wording.

In production DeepSeek does this reading (spec: "DeepSeek reads the stored text to pull out these values").
Until DEEPSEEK_API_KEY is set, PatternExtractor stands in with plain pattern matching. Every fact keeps
the line it came from as evidence, so a person can check it.
"""

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any, Literal, Protocol

Field = Literal["hours", "last_entry", "cost", "booking"]


@dataclass(frozen=True)
class Fact:
    field: Field
    value: dict[str, Any]
    evidence: str


class FactExtractor(Protocol):
    def extract(self, text: str) -> list[Fact]: ...


_TIME = r"(\d{1,2})\s*[:：]\s*(\d{2})\s*([ap]\.?m\.?)?"
_DASH = r"\s*(?:-|–|—|~|〜|～|to)\s*"
_RANGE = re.compile(_TIME + _DASH + _TIME, re.IGNORECASE)
_HOURS_WORDS = re.compile(r"open|hours|business|営業|開館|開園|開門|拝観|時間", re.IGNORECASE)
_ALWAYS = re.compile(r"open 24 hours|24 hours a day|24時間営業|24時間", re.IGNORECASE)
_LAST_ENTRY = re.compile(
    r"(?:last (?:admission|entry|entrance|order)|最終入場|最終入館|最終受付|入場は|入館は|L\.?O\.?)\D{0,24}?" + _TIME,
    re.IGNORECASE,
)
_YEN = re.compile(r"(?:¥|￥)\s?([\d,]{3,})|([\d,]{3,})\s?(?:円|yen|JPY)", re.IGNORECASE)
_PRICE_WORDS = re.compile(r"admission|ticket|adult|fee|price|入場料|入館料|料金|大人|拝観料", re.IGNORECASE)
_BOOKING = re.compile(
    r"reservations? (?:are )?(?:required|recommended)|advance (?:tickets?|reservations?|booking)|"
    r"book (?:in advance|ahead)|timed[- ]entry|要予約|事前予約|予約制|予約が必要",
    re.IGNORECASE,
)


def _minutes(hour: str, minute: str, meridiem: str | None) -> int:
    h, m = int(hour), int(minute)
    if meridiem:
        is_pm = meridiem.lower().startswith("p")
        h = (h % 12) + (12 if is_pm else 0)
    return h * 60 + m


def _evidence(line: str) -> str:
    return line if len(line) <= 160 else line[:157] + "..."


def _lines(text: str) -> Iterator[str]:
    return (line.strip() for line in text.splitlines() if line.strip())


class PatternExtractor:
    def extract(self, text: str) -> list[Fact]:
        facts: dict[Field, Fact] = {}
        for line in _lines(text):
            if "hours" not in facts:
                if _ALWAYS.search(line):
                    facts["hours"] = Fact("hours", {"always": True}, _evidence(line))
                elif _HOURS_WORDS.search(line) and (m := _RANGE.search(line)):
                    open_min = _minutes(m[1], m[2], m[3])
                    close_min = _minutes(m[4], m[5], m[6])
                    if close_min <= open_min:
                        close_min += 1440  # Runs past midnight.
                    if 0 <= open_min < 1440 and close_min - open_min <= 1440:
                        facts["hours"] = Fact("hours", {"openMin": open_min, "closeMin": close_min}, _evidence(line))
            if "last_entry" not in facts and (m := _LAST_ENTRY.search(line)):
                facts["last_entry"] = Fact("last_entry", {"atMin": _minutes(m[1], m[2], m[3])}, _evidence(line))
            if "cost" not in facts and _PRICE_WORDS.search(line) and (m := _YEN.search(line)):
                jpy = int((m[1] or m[2]).replace(",", ""))
                if 100 <= jpy <= 100_000:
                    facts["cost"] = Fact("cost", {"jpy": jpy}, _evidence(line))
            if "booking" not in facts and _BOOKING.search(line):
                facts["booking"] = Fact("booking", {"needed": True}, _evidence(line))
        return list(facts.values())
