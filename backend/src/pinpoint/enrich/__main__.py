"""uv run python -m pinpoint.enrich [--force [all|official|sources]]

For every place on the sample trip: reads its official website (filling gaps), then what Wikivoyage,
Wikipedia, Reddit and travel blogs say about it (recorded, never applied). Prints what each source found.
Pages and documents fetched in the last 30 days are reused unless --force is given.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.config import Settings, get_settings
from pinpoint.db import get_engine
from pinpoint.enrich.community import read_sources
from pinpoint.enrich.extract import PatternExtractor
from pinpoint.enrich.pipeline import APPLIED_FROM_PATTERNS, enrich_place
from pinpoint.enrich.places import places_client
from pinpoint.enrich.scraper import PoliteScraper, user_agent
from pinpoint.enrich.sources import reddit
from pinpoint.enrich.sources.base import JsonApi, Source
from pinpoint.enrich.sources.blogs import Blogs
from pinpoint.enrich.sources.reddit import Reddit
from pinpoint.enrich.sources.wikimedia import Wikipedia, Wikivoyage


def community_sources(settings: Settings, agent: str, scraper: PoliteScraper) -> tuple[list[Source], list[str]]:
    wiki = JsonApi(agent)
    sources: list[Source] = [Wikivoyage(wiki), Wikipedia(wiki)]
    skipped = []
    if settings.reddit_client_id and settings.reddit_client_secret and settings.reddit_username:
        api = JsonApi(reddit.user_agent(settings.reddit_username))
        sources.append(Reddit(api, settings.reddit_client_id, settings.reddit_client_secret))
    else:
        skipped.append("Reddit (set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USERNAME in backend/.env)")
    if settings.brave_search_api_key:
        sources.append(Blogs(JsonApi(agent), settings.brave_search_api_key, scraper))
    else:
        skipped.append("Travel blogs (set BRAVE_SEARCH_API_KEY in backend/.env)")
    return sources, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        nargs="?",
        const="all",
        choices=["all", "official", "sources"],
        help="fetch again even if fetched in the last 30 days: all (default), official sites, or third-party sources",
    )
    args = parser.parse_args()

    # Page titles are often Japanese; the Windows console default encoding cannot print them.
    sys.stdout.reconfigure(encoding="utf-8")
    settings = get_settings()
    agent = user_agent(settings.scraper_contact)
    scraper = PoliteScraper(agent)
    sources, skipped = community_sources(settings, agent, scraper)
    print(f"User agent: {agent}")
    print(f"Sources: official websites, {', '.join(s.kind for s in sources)}")
    for line in skipped:
        print(f"Skipped: {line}")
    print()

    with Session(get_engine()) as session:
        places = session.scalars(select(models.Place).order_by(models.Place.city, models.Place.name)).all()
        for place in places:
            report = enrich_place(
                session,
                place,
                places_client(settings),
                scraper,
                PatternExtractor(),
                force=args.force in ("all", "official"),
            )
            community = read_sources(
                session, place, sources, PatternExtractor(), force=args.force in ("all", "sources")
            )
            session.commit()

            print(report.name)
            if not report.website:
                print("  official site: none from Places details")
            for page in report.pages:
                cached = ", cached" if page.from_cache else ""
                size = f", {page.chars:,} characters" if page.chars else ""
                print(f"  official [{page.outcome}{cached}{size}] {page.url}")
            for fact, _url in report.facts:
                applied = (
                    "" if fact.field in APPLIED_FROM_PATTERNS else " (recorded, not applied until DeepSeek checks it)"
                )
                print(f'    {fact.field}: {fact.value}{applied}  <- "{fact.evidence}"')
            if report.filled:
                print(f"    filled: {', '.join(report.filled)}")
            if report.conflicts:
                print(f"    official site disagrees with our value for: {', '.join(report.conflicts)}")

            for source in community:
                cached = " (cached)" if source.from_cache else ""
                if not source.documents:
                    print(f"  {source.kind}{cached}: nothing found")
                    continue
                print(f"  {source.kind}{cached}: {len(source.documents)} found")
                for doc in source.documents:
                    print(f"    - {doc.title}")
                for fact in source.facts:
                    print(f'    says {fact.field}: {fact.value}  <- "{fact.evidence}"')
                for tip, _url in source.tips:
                    print(f'    tip: "{tip}"')
            print()
            sys.stdout.flush()


if __name__ == "__main__":
    main()
