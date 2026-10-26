"""What every third-party source shares: the document it returns, and a polite JSON API client.

Third-party sources are read through their official APIs, never by scraping their pages:
Wikimedia's API for Wikivoyage and Wikipedia, Reddit's Data API, and a search API for blogs.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlsplit

from pinpoint import models

TIMEOUT_S = 15
MIN_DELAY_S = 1.0


@dataclass(frozen=True)
class Document:
    """Text about a place from one source, with where it came from."""

    url: str
    title: str
    text: str
    # Structured fields when the source has them, such as a Wikivoyage listing's hours and price.
    fields: tuple[tuple[str, str], ...] = ()


class Source(Protocol):
    kind: str

    def find(self, place: models.Place) -> list[Document]: ...


class ApiError(Exception):
    pass


# (method, url, headers, body) -> parsed JSON. Tests pass a fake.
Transport = Callable[[str, str, dict[str, str], bytes | None], Any]


def http_json(method: str, url: str, headers: dict[str, str], body: bytes | None) -> Any:
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as r:
            return json.load(r)
    except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
        raise ApiError(f"{method} {urlsplit(url).netloc} failed: {e}") from e


class JsonApi:
    """One request at a time per host, at least a second apart, with an honest user agent."""

    def __init__(
        self,
        agent: str,
        transport: Transport = http_json,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.agent = agent
        self._transport = transport
        self._clock = clock
        self._sleep = sleep
        self._last: dict[str, float] = {}

    def request(
        self,
        method: str,
        url: str,
        params: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        body: bytes | None = None,
    ) -> Any:
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        host = urlsplit(url).netloc
        if host in self._last:
            wait = MIN_DELAY_S - (self._clock() - self._last[host])
            if wait > 0:
                self._sleep(wait)
        try:
            return self._transport(method, url, {"User-Agent": self.agent, **(headers or {})}, body)
        finally:
            self._last[host] = self._clock()

    def get(self, url: str, params: dict[str, str] | None = None, headers: dict[str, str] | None = None) -> Any:
        return self.request("GET", url, params, headers)
