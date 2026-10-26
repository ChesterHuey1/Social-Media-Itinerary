"""uv run python -m pinpoint.enrich [--force]

Runs the fill-in pipeline for every place on the sample trip and prints what it found.
Pages fetched in the last 30 days are reused unless --force is given.
"""

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.config import get_settings
from pinpoint.db import get_engine
from pinpoint.enrich.extract import PatternExtractor
from pinpoint.enrich.pipeline import APPLIED_FROM_PATTERNS, enrich_place
from pinpoint.enrich.places import places_client
from pinpoint.enrich.scraper import PoliteScraper, user_agent


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="fetch again even if fetched in the last 30 days")
    args = parser.parse_args()

    # Page titles are often Japanese; the Windows console default encoding cannot print them.
    sys.stdout.reconfigure(encoding="utf-8")
    settings = get_settings()
    agent = user_agent(settings.scraper_contact)
    scraper = PoliteScraper(agent)
    print(f"User agent: {agent}\n")

    with Session(get_engine()) as session:
        places = session.scalars(select(models.Place).order_by(models.Place.city, models.Place.name)).all()
        for place in places:
            report = enrich_place(
                session, place, places_client(settings), scraper, PatternExtractor(), force=args.force
            )
            session.commit()
            print(report.name)
            if not report.website:
                print("  no website from Places details")
            for page in report.pages:
                cached = ", cached" if page.from_cache else ""
                size = f", {page.chars:,} characters" if page.chars else ""
                print(f"  [{page.outcome}{cached}{size}] {page.url}")
                if page.title:
                    print(f"      title: {page.title}")
            for fact, url in report.facts:
                applied = (
                    "" if fact.field in APPLIED_FROM_PATTERNS else "  (recorded, not applied until DeepSeek checks it)"
                )
                print(f"  found {fact.field}: {fact.value}{applied}")
                print(f'      from "{fact.evidence}" on {url}')
            if report.filled:
                print(f"  filled: {', '.join(report.filled)}")
            if report.conflicts:
                print(f"  site disagrees with our value for: {', '.join(report.conflicts)}")
            if report.still_missing:
                print(f"  left for DeepSeek: {', '.join(report.still_missing)}")
            print()
            sys.stdout.flush()


if __name__ == "__main__":
    main()
