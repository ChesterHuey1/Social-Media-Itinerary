"""Wikivoyage and Wikipedia, through Wikimedia's official API (no key; its etiquette asks for an honest
user agent and one request at a time, which JsonApi does).

Wikivoyage city guides list sights as templates such as
    {{see | name=teamLab Planets | hours=9AM-10PM | price=¥3800 | content=...}}
so a matching listing gives structured hours and price. Wikipedia gives a short summary, used for tips only.
"""

import re
import urllib.parse

from pinpoint import models
from pinpoint.enrich.sources.base import ApiError, Document, JsonApi
from pinpoint.enrich.sources.tips import same_name

WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php"
WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
LISTING_START = re.compile(r"\{\{\s*(see|do|eat|drink|buy|listing|marker)\s*\|", re.IGNORECASE)
ARTICLES_TO_READ = 2


def _template_body(wikitext: str, start: int) -> str:
    """The text of a {{...}} template starting at `start`, allowing templates nested inside it."""
    depth, i = 0, start
    while i < len(wikitext) - 1:
        pair = wikitext[i : i + 2]
        if pair == "{{":
            depth += 1
            i += 2
        elif pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return wikitext[start + 2 : i - 2]
        else:
            i += 1
    return wikitext[start + 2 :]


def _fields(body: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    depth, part, parts = 0, [], []
    for ch in body:
        # A "|" inside a nested [[link|text]] or {{template|...}} is not a field separator.
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
        if ch == "|" and depth == 0:
            parts.append("".join(part))
            part = []
        else:
            part.append(ch)
    parts.append("".join(part))
    for p in parts[1:]:
        if "=" in p:
            key, value = p.split("=", 1)
            fields[key.strip().lower()] = _plain(value)
    return fields


def _plain(wikitext: str) -> str:
    """Drops links, templates and markup, keeping the readable words."""
    text = re.sub(r"\{\{[^{}]*\}\}", "", wikitext)
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", text)
    text = re.sub(r"'{2,}|<[^>]+>", "", text)
    return " ".join(text.split())


def listings_for(wikitext: str, place_name: str, area_words: str = "") -> list[dict[str, str]]:
    found = []
    for match in LISTING_START.finditer(wikitext):
        fields = _fields(_template_body(wikitext, match.start()))
        name = fields.get("name", "")
        if name and same_name(name, place_name, area_words):
            found.append(fields)
    return found


class Wikivoyage:
    kind = "wikivoyage"

    def __init__(self, api: JsonApi) -> None:
        self.api = api

    def find(self, place: models.Place) -> list[Document]:
        try:
            search = self.api.get(
                WIKIVOYAGE_API,
                {"action": "query", "list": "search", "srsearch": place.name, "srlimit": "5", "format": "json"},
            )
        except ApiError:
            return []
        # Only guides about the place's own city: "Kyoto/North", not "Iwakuni".
        titles = [t for hit in search.get("query", {}).get("search", []) if (t := hit["title"]).startswith(place.city)]
        # A guide can list one place twice (under See and Buy); same-name listings merge into one document.
        docs: dict[str, Document] = {}
        for title in titles[:ARTICLES_TO_READ]:
            try:
                page = self.api.get(
                    WIKIVOYAGE_API,
                    {"action": "parse", "page": title, "prop": "wikitext", "format": "json", "formatversion": "2"},
                )
            except ApiError:
                continue
            wikitext = page.get("parse", {}).get("wikitext", "")
            for listing in listings_for(wikitext, place.name, f"{place.area} {place.city}"):
                name = listing.get("name", place.name)
                anchor = urllib.parse.quote(name.replace(" ", "_"))
                lines = [
                    f"Opening hours: {listing['hours']}" if listing.get("hours") else "",
                    f"Admission price: {listing['price']}" if listing.get("price") else "",
                    listing.get("content", ""),
                ]
                url = f"https://en.wikivoyage.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}#{anchor}"
                text = "\n".join(line for line in lines if line)
                fields = tuple((k, listing[k]) for k in ("hours", "price") if listing.get(k))
                if url in docs:
                    old = docs[url]
                    docs[url] = Document(url, old.title, f"{old.text}\n{text}", old.fields + fields)
                else:
                    docs[url] = Document(url, f"Wikivoyage: {title} — {name}", text, fields)
            if docs:
                break
        return list(docs.values())


class Wikipedia:
    kind = "wikipedia"

    def __init__(self, api: JsonApi) -> None:
        self.api = api

    def find(self, place: models.Place) -> list[Document]:
        try:
            search = self.api.get(
                WIKIPEDIA_API,
                {
                    "action": "query",
                    "list": "search",
                    "srsearch": f"{place.name} {place.city}",
                    "srlimit": "1",
                    "format": "json",
                },
            )
            hits = search.get("query", {}).get("search", [])
            if not hits or not same_name(hits[0]["title"], place.name, f"{place.area} {place.city}"):
                return []
            title = hits[0]["title"]
            summary = self.api.get(WIKIPEDIA_SUMMARY + urllib.parse.quote(title.replace(" ", "_")))
        except ApiError:
            return []
        text = summary.get("extract", "")
        url = summary.get("content_urls", {}).get("desktop", {}).get("page", f"https://en.wikipedia.org/wiki/{title}")
        return [Document(url=url, title=f"Wikipedia: {title}", text=text)] if text else []
