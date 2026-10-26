"""Reads what third-party sources say about a place: Wikivoyage, Wikipedia, Reddit and blogs.

Everything found is recorded in place_facts under the source's name, with the sentence it came from.
None of it is applied to the place: official websites and Google fill gaps; community sources inform.
Documents are kept in scraped_pages and reused for 30 days, like official pages.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.enrich.extract import Fact, FactExtractor
from pinpoint.enrich.sources.base import Document, Source
from pinpoint.enrich.sources.tips import find_tips

REFRESH_AFTER = timedelta(days=30)


@dataclass
class SourceReport:
    kind: str
    documents: list[Document] = field(default_factory=list)
    facts: list[Fact] = field(default_factory=list)
    tips: list[tuple[str, str]] = field(default_factory=list)
    from_cache: bool = False


def _cached(session: Session, place: models.Place, kind: str, now: datetime) -> list[Document] | None:
    rows = session.scalars(
        select(models.ScrapedPage).where(
            models.ScrapedPage.place_id == place.id,
            models.ScrapedPage.kind == kind,
            models.ScrapedPage.fetched_at > now - REFRESH_AFTER,
        )
    ).all()
    if not rows:
        return None
    # The key carries the place id; the document's real address is before it.
    return [Document(url=r.url.split("#for=")[0], title=r.title or "", text=r.text or "") for r in rows if r.text]


def _store(session: Session, place: models.Place, kind: str, docs: list[Document], now: datetime) -> None:
    for old in session.scalars(
        select(models.ScrapedPage).where(models.ScrapedPage.place_id == place.id, models.ScrapedPage.kind == kind)
    ):
        session.delete(old)
    session.flush()
    stored: set[str] = set()
    for doc in docs:
        if doc.url in stored:  # Two search results can point at one page.
            continue
        stored.add(doc.url)
        # One thread or guide can be about several places; the key keeps one row per place.
        session.add(
            models.ScrapedPage(
                url=f"{doc.url}#for={place.id}",
                place_id=place.id,
                kind=kind,
                fetched_at=now,
                http_status=200,
                outcome="stored",
                title=doc.title,
                text=doc.text,
            )
        )
    if not docs:
        # Remember that the source had nothing, so it isn't asked again for 30 days.
        session.add(
            models.ScrapedPage(
                url=f"{kind}:none#for={place.id}",
                place_id=place.id,
                kind=kind,
                fetched_at=now,
                outcome="stored",
                text="",
            )
        )


def _record(
    session: Session,
    place: models.Place,
    kind: str,
    field_name: str,
    value: dict,
    evidence: str,
    url: str,
    now: datetime,
):
    row = session.scalar(
        select(models.PlaceFact).where(
            models.PlaceFact.place_id == place.id, models.PlaceFact.field == field_name, models.PlaceFact.source == kind
        )
    )
    row = row or models.PlaceFact(place_id=place.id, field=field_name, source=kind)
    row.value, row.evidence, row.page_url, row.fetched_at = value, evidence, url, now
    session.add(row)


def read_sources(
    session: Session,
    place: models.Place,
    sources: list[Source],
    extractor: FactExtractor,
    now: datetime | None = None,
    force: bool = False,
) -> list[SourceReport]:
    now = now or datetime.now(UTC)
    reports = []
    for source in sources:
        cached = None if force else _cached(session, place, source.kind, now)
        docs = cached if cached is not None else source.find(place)
        if cached is None:
            _store(session, place, source.kind, docs, now)
        report = SourceReport(source.kind, docs, from_cache=cached is not None)

        seen_fields: set[str] = set()
        for doc in docs:
            for fact in extractor.extract(doc.text):
                if fact.field not in seen_fields:
                    seen_fields.add(fact.field)
                    report.facts.append(fact)
                    _record(session, place, source.kind, fact.field, fact.value, fact.evidence, doc.url, now)
            report.tips.extend((tip, doc.url) for tip in find_tips(doc.text, place.name))
        report.tips = report.tips[:3]
        if report.tips:
            _record(
                session,
                place,
                source.kind,
                "tip",
                {"tips": [{"text": t, "url": u} for t, u in report.tips]},
                report.tips[0][0],
                report.tips[0][1],
                now,
            )
        reports.append(report)
    return reports
