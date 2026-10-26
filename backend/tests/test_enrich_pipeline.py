from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.enrich.extract import PatternExtractor
from pinpoint.enrich.pipeline import enrich_place
from pinpoint.enrich.places import PlaceDetails
from pinpoint.enrich.scraper import PoliteScraper, Response

NOW = datetime(2026, 10, 25, tzinfo=UTC)
FILLER = "<p>menu and news</p>" * 60
HOME = (
    "<a href='/access/'>Access and hours</a><a href='/news/'>News</a><a href='https://other.jp/hours'>Hours</a>"
    + FILLER
)
ACCESS = "<p>Opening hours: 11:00 - 23:00</p><p>Last order 22:30</p><p>Reservations recommended</p>" + FILLER


class Site:
    def __init__(self, root: str) -> None:
        self.root = root
        self.fetched: list[str] = []

    def fetch(self, url: str, agent: str) -> Response:
        pages = {self.root: HOME, f"{self.root}access/": ACCESS}
        if url in pages:
            self.fetched.append(url)
            return Response(200, "text/html", pages[url].encode())
        return Response(404, "text/html", b"")


class Places:
    def __init__(self, website: str | None) -> None:
        self.website = website

    def details(self, place: models.Place) -> PlaceDetails:
        return PlaceDetails(self.website)


def run(session: Session, place_id: str, site: Site, now: datetime = NOW):
    place = session.get(models.Place, place_id)
    scraper = PoliteScraper("PinpointBot/test", fetch=site.fetch, sleep=lambda _: None)
    website = site.root or None
    return place, enrich_place(session, place, Places(website), scraper, PatternExtractor(), now=now)


def test_follows_a_same_site_hours_link_and_fills_unconfirmed_hours(session: Session) -> None:
    site = Site("https://gg.jp/")
    place, report = run(session, "goldenGai", site)
    assert site.fetched == ["https://gg.jp/", "https://gg.jp/access/"]
    assert place.hours == {"kind": "windows", "source": "scrape", "windows": [{"openMin": 660, "closeMin": 1380}]}
    assert place.last_entry_min == 30
    assert report.filled == ["hours", "last entry"]
    fact = session.scalar(
        select(models.PlaceFact).where(models.PlaceFact.place_id == "goldenGai", models.PlaceFact.field == "hours")
    )
    assert (fact.source, fact.page_url, fact.evidence) == (
        "scrape",
        "https://gg.jp/access/",
        "Opening hours: 11:00 - 23:00",
    )


def test_booking_wording_is_recorded_but_not_applied(session: Session) -> None:
    place, report = run(session, "goldenGai", Site("https://gg.jp/"))
    assert any(f.field == "booking" for f, _ in report.facts)
    assert place.needs_booking is False


def test_never_overwrites_better_hours_but_reports_the_disagreement(session: Session) -> None:
    place, report = run(session, "teamlab", Site("https://tl.jp/"))
    assert place.hours["source"] == "google"
    assert place.hours["windows"] == [{"openMin": 540, "closeMin": 1320}]
    assert "hours" not in report.filled
    assert report.conflicts == ["hours"]


def test_reuses_pages_fetched_in_the_last_30_days(session: Session) -> None:
    site = Site("https://gg.jp/")
    run(session, "goldenGai", site)
    _, report = run(session, "goldenGai", site, now=NOW + timedelta(days=29))
    assert len(site.fetched) == 2
    assert all(p.from_cache for p in report.pages)
    run(session, "goldenGai", site, now=NOW + timedelta(days=31))
    assert len(site.fetched) == 4


def test_a_place_with_no_website_is_left_for_deepseek(session: Session) -> None:
    _, report = run(session, "dotonbori", Site(""))
    assert report.pages == []
    assert "cost" in report.still_missing
