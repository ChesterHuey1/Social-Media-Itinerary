"""Travel blogs, found through the Brave Search API (free tier with a key: BRAVE_SEARCH_API_KEY in
backend/.env; skipped without it) and read with the same polite scraper as official sites, so robots.txt,
the 2-second spacing and the stop-on-block rule all apply.

Sites whose terms forbid scraping, or that have their own source here, are never read as blogs.
"""

from urllib.parse import urlsplit

from pinpoint import models
from pinpoint.enrich.scraper import PoliteScraper
from pinpoint.enrich.sources.base import ApiError, Document, JsonApi

SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
BLOGS_TO_READ = 3
SKIP_DOMAINS = (
    "instagram.com",
    "google.",
    "yelp.",
    "tripadvisor.",
    "reddit.com",
    "wikivoyage.org",
    "wikipedia.org",
    "booking.com",
    "expedia.",
    "agoda.",
    "klook.com",
    "facebook.com",
    "tiktok.com",
    "youtube.com",
    "x.com",
)


class Blogs:
    kind = "blog"

    def __init__(self, api: JsonApi, api_key: str, scraper: PoliteScraper) -> None:
        self.api = api
        self._key = api_key
        self._scraper = scraper

    def find(self, place: models.Place) -> list[Document]:
        try:
            results = self.api.get(
                SEARCH_URL,
                {"q": f'"{place.name}" {place.city} tips', "count": "10"},
                {"X-Subscription-Token": self._key, "Accept": "application/json"},
            )
        except ApiError:
            return []
        own_site = urlsplit(place.website or "").netloc
        docs = []
        for hit in results.get("web", {}).get("results", []):
            url = hit.get("url", "")
            host = urlsplit(url).netloc
            if not host or host == own_site or any(d in host for d in SKIP_DOMAINS):
                continue
            page = self._scraper.scrape(url)
            if page.outcome == "stored" and page.text:
                docs.append(Document(url=url, title=f"Blog: {page.title or hit.get('title', host)}", text=page.text))
            if len(docs) == BLOGS_TO_READ:
                break
        return docs
