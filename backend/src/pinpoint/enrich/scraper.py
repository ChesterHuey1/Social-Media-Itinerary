"""Fetches a place's own website, politely. The rules are the spec's:

- Check robots.txt and skip pages it disallows.
- Wait at least 2 seconds between requests to the same site.
- Send an honest user agent naming the app and a contact.
- When a site blocks the request, shows a CAPTCHA or needs JavaScript, stop. Never work around it.

Only a place's own website is fetched. Instagram, Google Maps and Yelp are never scraped.
"""

import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from bs4 import BeautifulSoup

MIN_DELAY_S = 2.0
TIMEOUT_S = 15
MAX_BYTES = 2_000_000
# Less visible text than this after cleaning means the page is built by JavaScript.
MIN_TEXT_CHARS = 200
BLOCK_STATUSES = {401, 403, 429, 503}
CHALLENGE_MARKERS = ("captcha", "cf-challenge", "just a moment...", "verify you are human", "attention required")
NEVER_SCRAPE = ("instagram.com", "google.com", "goo.gl", "yelp.com")
# Links worth following from a homepage: where hours, prices and booking rules usually live.
USEFUL_LINK = re.compile(
    r"access|hours|info|guide|visit|ticket|price|admission|fee|menu|reserv|営業|アクセス|料金|拝観|案内|チケット|予約|メニュー",
    re.IGNORECASE,
)

Outcome = Literal["stored", "robots_disallowed", "blocked", "needs_javascript", "not_html", "error"]


def user_agent(contact: str) -> str:
    base = "PinpointBot/0.1 (personal trip planner; +https://github.com/ChesterHuey1/Social-Media-Itinerary"
    return f"{base}; contact: {contact})" if contact else f"{base})"


@dataclass(frozen=True)
class Response:
    status: int | None
    content_type: str
    body: bytes


Fetch = Callable[[str, str], Response]


def http_fetch(url: str, agent: str) -> Response:
    request = urllib.request.Request(url, headers={"User-Agent": agent, "Accept": "text/html,text/plain;q=0.9"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as r:
            return Response(r.status, r.headers.get("Content-Type", ""), r.read(MAX_BYTES))
    except urllib.error.HTTPError as e:
        return Response(e.code, e.headers.get("Content-Type", "") if e.headers else "", b"")
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return Response(None, "", b"")


@dataclass(frozen=True)
class ScrapeResult:
    url: str
    outcome: Outcome
    http_status: int | None
    title: str | None
    text: str | None
    # Same-site links whose text or address suggests hours, prices or booking. Only for stored pages.
    useful_links: tuple[str, ...] = ()


def useful_links(soup: BeautifulSoup, page_url: str) -> tuple[str, ...]:
    host = urlsplit(page_url).netloc
    found: list[str] = []
    for a in soup.find_all("a", href=True):
        url = urljoin(page_url, a["href"]).split("#")[0]
        parts = urlsplit(url)
        same_site = parts.scheme in ("http", "https") and parts.netloc == host
        if same_site and url != page_url and url not in found and USEFUL_LINK.search(f"{a.get_text()} {parts.path}"):
            found.append(url)
    return tuple(found)


def clean_text(soup: BeautifulSoup) -> str:
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "template", "head"]):
        tag.decompose()
    lines = (" ".join(line.split()) for line in soup.get_text("\n").splitlines())
    return "\n".join(line for line in lines if line)


class PoliteScraper:
    def __init__(
        self,
        agent: str,
        fetch: Fetch = http_fetch,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._agent = agent
        self._fetch = fetch
        self._clock = clock
        self._sleep = sleep
        self._robots: dict[str, RobotFileParser] = {}
        self._last_request: dict[str, float] = {}

    def _get(self, url: str) -> Response:
        host = urlsplit(url).netloc
        if host in self._last_request:
            wait = MIN_DELAY_S - (self._clock() - self._last_request[host])
            if wait > 0:
                self._sleep(wait)
        response = self._fetch(url, self._agent)
        self._last_request[host] = self._clock()
        return response

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            parser = RobotFileParser()
            response = self._get(f"{origin}/robots.txt")
            if response.status is not None and 200 <= response.status < 300:
                parser.parse(response.body.decode("utf-8", errors="replace").splitlines())
            elif response.status is not None and 400 <= response.status < 500:
                parser.allow_all = True  # No robots.txt: everything is allowed (RFC 9309).
            else:
                parser.disallow_all = True  # Unreachable: assume nothing is allowed (RFC 9309).
            self._robots[origin] = parser
        return self._robots[origin].can_fetch(self._agent, url)

    def scrape(self, url: str) -> ScrapeResult:
        if any(domain in urlsplit(url).netloc for domain in NEVER_SCRAPE) or not self.allowed(url):
            return ScrapeResult(url, "robots_disallowed", None, None, None)

        response = self._get(url)
        if response.status in BLOCK_STATUSES:
            return ScrapeResult(url, "blocked", response.status, None, None)
        if response.status is None or response.status >= 400:
            return ScrapeResult(url, "error", response.status, None, None)
        if "html" not in response.content_type.lower():
            return ScrapeResult(url, "not_html", response.status, None, None)

        soup = BeautifulSoup(response.body, "html.parser")
        title = " ".join(soup.title.get_text().split()) if soup.title else None
        links = useful_links(soup, url)
        text = clean_text(soup)
        if any(marker in f"{title or ''}\n{text}".lower() for marker in CHALLENGE_MARKERS):
            return ScrapeResult(url, "blocked", response.status, title, None)
        if len(text) < MIN_TEXT_CHARS:
            return ScrapeResult(url, "needs_javascript", response.status, title, None)
        return ScrapeResult(url, "stored", response.status, title, text, links)
