"""Third-party sources, tested with a fake network: no real API is called."""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.enrich.community import read_sources
from pinpoint.enrich.extract import PatternExtractor
from pinpoint.enrich.scraper import PoliteScraper, Response
from pinpoint.enrich.sources.base import Document, JsonApi
from pinpoint.enrich.sources.blogs import Blogs
from pinpoint.enrich.sources.reddit import Reddit
from pinpoint.enrich.sources.tips import find_tips, mentions, same_name
from pinpoint.enrich.sources.wikimedia import Wikivoyage, listings_for

NOW = datetime(2026, 10, 26, tzinfo=UTC)

WIKITEXT = """==See==
* {{see | name=[[teamLab Planets]] TOKYO | alt=チームラボ | hours=9:00-22:00 | price=Adult ticket ¥3,800
| content=Walk barefoot through water rooms. Book tickets online; same-day tickets often sell out. {{ja|豊洲}} }}
* {{eat | name=Ichiran | hours=24 hours | content=Ramen booths.}}
"""


class FakeApi:
    def __init__(self, routes: dict[str, Any]) -> None:
        self.routes = routes
        self.calls: list[tuple[str, str, dict[str, str]]] = []

    def __call__(self, method: str, url: str, headers: dict[str, str], body: bytes | None) -> Any:
        self.calls.append((method, url, headers))
        for prefix, response in self.routes.items():
            if prefix in url:
                return response
        raise AssertionError(f"unexpected call {url}")


def place(session: Session, place_id: str) -> models.Place:
    return session.get(models.Place, place_id)


def test_finds_a_wikivoyage_listing_and_its_fields() -> None:
    (listing,) = listings_for(WIKITEXT, "teamLab Planets")
    assert listing["hours"] == "9:00-22:00"
    assert listing["price"] == "Adult ticket ¥3,800"
    assert "Book tickets online" in listing["content"]
    assert "{{" not in listing["content"]


def test_wikivoyage_turns_a_listing_into_a_document(session: Session) -> None:
    api = FakeApi(
        {
            "list=search": {"query": {"search": [{"title": "Tokyo/Koto"}]}},
            "action=parse": {"parse": {"wikitext": WIKITEXT}},
        }
    )
    (doc,) = Wikivoyage(JsonApi("test", transport=api, sleep=lambda _: None)).find(place(session, "teamlab"))
    assert doc.url == "https://en.wikivoyage.org/wiki/Tokyo/Koto#teamLab_Planets_TOKYO"
    assert doc.fields == (("hours", "9:00-22:00"), ("price", "Adult ticket ¥3,800"))
    assert all("User-Agent" in headers for _, _, headers in api.calls)


def test_reddit_signs_in_then_reads_matching_threads(session: Session) -> None:
    thread = {
        "id": "abc",
        "title": "teamLab Planets worth it?",
        "selftext": "",
        "permalink": "/r/JapanTravel/x/",
        "score": 50,
        "subreddit": "JapanTravel",
    }
    off_topic = {
        "id": "zzz",
        "title": "Best ramen",
        "selftext": "",
        "permalink": "/r/Tokyo/y/",
        "score": 999,
        "subreddit": "Tokyo",
    }
    api = FakeApi(
        {
            "access_token": {"access_token": "T"},
            "/search": {"data": {"children": [{"data": thread}, {"data": off_topic}]}},
            "/comments/abc": [
                {},
                {
                    "data": {
                        "children": [
                            {"kind": "t1", "data": {"body": "Book teamLab tickets a week early, it sells out."}}
                        ]
                    }
                },
            ],
        }
    )
    docs = Reddit(JsonApi("test", transport=api, sleep=lambda _: None), "id", "secret").find(place(session, "teamlab"))
    assert [d.title for d in docs] == ["r/JapanTravel: teamLab Planets worth it?"]
    assert "sells out" in docs[0].text
    token_call, search_call = api.calls[0], api.calls[1]
    assert token_call[0] == "POST" and token_call[2]["Authorization"].startswith("Basic ")
    assert search_call[2]["Authorization"] == "Bearer T"
    assert "JapanTravel%2BTokyo" in search_call[1] or "JapanTravel+Tokyo" in search_call[1]


def test_blogs_skip_sites_that_forbid_scraping_and_respect_robots(session: Session) -> None:
    api = FakeApi(
        {
            "brave.com": {
                "web": {
                    "results": [
                        {"url": "https://www.tripadvisor.com/x"},
                        {"url": "https://www.reddit.com/r/x"},
                        {"url": "https://blocked.example/post"},
                        {"url": "https://goodblog.example/teamlab"},
                    ]
                }
            }
        }
    )
    body = "<p>Arrive early at teamLab Planets, the line gets long after 11.</p>" * 10

    def fetch(url: str, agent: str) -> Response:
        if url == "https://blocked.example/robots.txt":
            return Response(200, "text/plain", b"User-agent: *\nDisallow: /")
        if url == "https://goodblog.example/teamlab":
            return Response(200, "text/html", body.encode())
        return Response(404, "text/html", b"")

    scraper = PoliteScraper("test", fetch=fetch, sleep=lambda _: None)
    docs = Blogs(JsonApi("test", transport=api, sleep=lambda _: None), "key", scraper).find(place(session, "teamlab"))
    assert [d.url for d in docs] == ["https://goodblog.example/teamlab"]


def test_names_match_on_distinctive_words_only() -> None:
    # Real cases from the first live run.
    assert mentions("Meiji Shrine", "Meiji Jingu")
    assert mentions("Kinkaku-ji Temple", "Kinkaku-ji")
    assert mentions("Sensō-ji", "Senso-ji")
    assert mentions("Kappabashi-dori", "Kappabashi Street")
    assert mentions("Fushimi Inari-taisha", "Fushimi Inari Taisha")
    assert not mentions("Fushimi Momoyama Castle", "Fushimi Inari Taisha")
    assert not mentions("Tsukiji Hongwanji", "Tsukiji Outer Market")
    assert not mentions("Shibuya", "Shibuya Sky")


def test_a_listing_or_title_must_name_the_same_place() -> None:
    assert same_name("Shinjuku Golden Gai", "Golden Gai", "Shinjuku Tokyo")
    assert same_name("Meiji Shrine", "Meiji Jingu", "Harajuku Tokyo")
    assert not same_name("Ueno Zoo", "Ueno Park", "Ueno Tokyo")
    assert not same_name("Nishiki River Water Festival", "Nishiki Market", "Nakagyo Kyoto")


def test_finds_tips_that_name_the_place_and_give_advice() -> None:
    text = (
        "We loved Tokyo. teamLab Planets was magical but book tickets a week ahead because it sells out. "
        "The weather was nice. Get there early to teamLab Planets to avoid the lines. "
        "Meiji Jingu was built in the early 20th century for the emperor and his wife."
    )
    assert find_tips(text, "teamLab Planets") == [
        "teamLab Planets was magical but book tickets a week ahead because it sells out.",
        "Get there early to teamLab Planets to avoid the lines.",
    ]
    # "early 20th century" is history, not advice.
    assert find_tips(text, "Meiji Jingu") == []


def test_wikivoyage_merges_a_place_listed_twice_in_one_guide(session: Session) -> None:
    twice = (
        "* {{see | name=Tsukiji Outer Market | hours=9:00-14:00 | content=Shops.}}\n"
        "* {{buy | name=Tsukiji Outer Market | content=Knives and bowls.}}\n"
        "* {{see | name=Tsukiji Hongwanji | content=A temple.}}"
    )
    api = FakeApi(
        {
            "list=search": {"query": {"search": [{"title": "Tokyo/Chuo"}]}},
            "action=parse": {"parse": {"wikitext": twice}},
        }
    )
    (doc,) = Wikivoyage(JsonApi("test", transport=api, sleep=lambda _: None)).find(place(session, "tsukiji"))
    assert "Shops." in doc.text and "Knives and bowls." in doc.text
    assert "temple" not in doc.text


class StaticSource:
    kind = "wikivoyage"

    def __init__(self, docs: list[Document]) -> None:
        self.docs = docs
        self.calls = 0

    def find(self, place: models.Place) -> list[Document]:
        self.calls += 1
        return self.docs


def test_community_findings_are_recorded_but_never_applied(session: Session) -> None:
    teamlab = place(session, "teamlab")
    hours_before = dict(teamlab.hours)
    doc = Document(
        "https://en.wikivoyage.org/wiki/Tokyo#teamLab",
        "Wikivoyage: teamLab",
        "Opening hours: 10:00-18:00\nBook tickets for teamLab Planets online, it sells out.",
    )
    (report,) = read_sources(session, teamlab, [StaticSource([doc])], PatternExtractor(), now=NOW)

    assert teamlab.hours == hours_before
    assert {f.field for f in report.facts} == {"hours", "booking"}
    rows = session.scalars(
        select(models.PlaceFact).where(models.PlaceFact.place_id == "teamlab", models.PlaceFact.source == "wikivoyage")
    ).all()
    assert {r.field for r in rows} == {"hours", "booking", "tip"}


def test_community_documents_are_reused_for_30_days(session: Session) -> None:
    teamlab = place(session, "teamlab")
    source = StaticSource([Document("https://x.example/a", "A", "teamLab Planets: arrive early, the line is long.")])
    read_sources(session, teamlab, [source], PatternExtractor(), now=NOW)
    (again,) = read_sources(session, teamlab, [source], PatternExtractor(), now=NOW + timedelta(days=10))
    assert source.calls == 1 and again.from_cache
    assert [d.url for d in again.documents] == ["https://x.example/a"]

    empty = StaticSource([])
    read_sources(session, place(session, "ueno"), [empty], PatternExtractor(), now=NOW)
    read_sources(session, place(session, "ueno"), [empty], PatternExtractor(), now=NOW + timedelta(days=1))
    assert empty.calls == 1
