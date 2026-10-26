"""The fill-in pipeline, in the spec's order: Places details, then the place's own website, then DeepSeek.

It only fills gaps: a value the place already has is never overwritten by a later, weaker source. When the
website disagrees with the value we have, the report says so. Every value found is kept in place_facts with
its source and the line it came from.

Until DEEPSEEK_API_KEY is set, the page is read by PatternExtractor. Its hours and last-entry readings are
checked strictly enough to fill gaps; its booking and price readings are recorded with their evidence but
not applied, because pattern matching can't tell whose booking rule or price a line describes.
"""

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.enrich.extract import Fact, FactExtractor
from pinpoint.enrich.places import PlacesClient
from pinpoint.enrich.scraper import PoliteScraper

REFRESH_AFTER = timedelta(days=30)
# Besides the homepage, at most this many same-site pages per place.
MAX_EXTRA_PAGES = 2
# A last entry further than this before closing is more likely a misread than a rule.
MAX_LAST_ENTRY_GAP_MIN = 180
APPLIED_FROM_PATTERNS = ("hours", "last_entry")


@dataclass
class PageReport:
    url: str
    outcome: str
    title: str | None
    chars: int
    from_cache: bool


@dataclass
class PlaceReport:
    place_id: str
    name: str
    website: str | None
    pages: list[PageReport] = field(default_factory=list)
    facts: list[tuple[Fact, str]] = field(default_factory=list)
    filled: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)
    still_missing: list[str] = field(default_factory=list)


def _page(session: Session, place: models.Place, url: str, scraper: PoliteScraper, now: datetime, force: bool):
    page = session.get(models.ScrapedPage, url)
    if page and not force and now - page.fetched_at < REFRESH_AFTER:
        return page, True
    result = scraper.scrape(url)
    page = page or models.ScrapedPage(url=url, place_id=place.id)
    page.fetched_at = now
    page.http_status = result.http_status
    page.outcome = result.outcome
    page.title = result.title
    page.text = result.text
    page.content_hash = hashlib.sha256(result.text.encode()).hexdigest() if result.text else None
    page.links = list(result.useful_links)
    session.add(page)
    return page, False


def _save_fact(session: Session, place: models.Place, fact: Fact, url: str, now: datetime) -> None:
    row = session.scalar(
        select(models.PlaceFact).where(
            models.PlaceFact.place_id == place.id,
            models.PlaceFact.field == fact.field,
            models.PlaceFact.source == "scrape",
        )
    )
    row = row or models.PlaceFact(place_id=place.id, field=fact.field, source="scrape")
    row.value, row.page_url, row.evidence, row.fetched_at = fact.value, url, fact.evidence, now
    session.add(row)


def _hours_from(value: dict) -> dict:
    if value.get("always"):
        return {"kind": "always"}
    return {
        "kind": "windows",
        "source": "scrape",
        "windows": [{"openMin": value["openMin"], "closeMin": value["closeMin"]}],
    }


def _fill_gaps(place: models.Place, found: dict[str, dict]) -> tuple[list[str], list[str]]:
    filled, conflicts = [], []
    if "hours" in found:
        site_hours = _hours_from(found["hours"])
        if place.hours.get("kind") == "unconfirmed":
            place.hours = site_hours
            filled.append("hours")
        elif site_hours.get("windows") and place.hours.get("windows") != site_hours["windows"]:
            conflicts.append("hours")
    windows = place.hours.get("windows", [])
    if place.last_entry_min == 0 and "last_entry" in found and len(windows) == 1:
        gap = windows[0]["closeMin"] - found["last_entry"]["atMin"]
        if 0 < gap <= MAX_LAST_ENTRY_GAP_MIN:
            place.last_entry_min = gap
            filled.append("last entry")
    return filled, conflicts


def _still_missing(place: models.Place) -> list[str]:
    missing = []
    if place.hours.get("kind") == "unconfirmed":
        missing.append("hours")
    if place.cost_usd is None:
        missing.append("cost")
    if not place.tip_text:
        missing.append("tip")
    return missing


def enrich_place(
    session: Session,
    place: models.Place,
    places: PlacesClient,
    scraper: PoliteScraper,
    extractor: FactExtractor,
    now: datetime | None = None,
    force: bool = False,
) -> PlaceReport:
    now = now or datetime.now(UTC)

    # 1. Places details: fills the website if we don't have one.
    if not place.website:
        place.website = places.details(place).website
    report = PlaceReport(place.id, place.name, place.website)
    if not place.website:
        report.still_missing = _still_missing(place)
        return report

    # 2. The place's own website: the homepage, then a few same-site pages that look like hours or prices.
    found: dict[str, dict] = {}
    queue = [place.website]
    while queue and len(report.pages) <= MAX_EXTRA_PAGES:
        url = queue.pop(0)
        page, from_cache = _page(session, place, url, scraper, now, force)
        report.pages.append(PageReport(url, page.outcome, page.title, len(page.text or ""), from_cache))
        if page.outcome != "stored" or not page.text:
            continue
        for fact in extractor.extract(page.text):
            if fact.field not in found:
                found[fact.field] = fact.value
                report.facts.append((fact, url))
                _save_fact(session, place, fact, url, now)
        if url == place.website:
            queue.extend(page.links or [])
        if {"hours", "cost"} <= found.keys():
            break

    report.filled, report.conflicts = _fill_gaps(place, {k: v for k, v in found.items() if k in APPLIED_FROM_PATTERNS})

    # 3. DeepSeek fills what is still missing, labeled as an estimate. Not run until DEEPSEEK_API_KEY is set.
    report.still_missing = _still_missing(place)
    return report
