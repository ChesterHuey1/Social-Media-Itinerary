"""Reddit, through its official Data API. Reddit's robots.txt disallows all crawling, so this is the only
allowed route. It needs a free "script" app on your Reddit account: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET
and REDDIT_USERNAME in backend/.env. Without them the source is skipped.

For each place it searches the city's travel subreddits, then reads the top comments of the best threads.
"""

import base64
import urllib.parse

from pinpoint import models
from pinpoint.enrich.sources.base import ApiError, Document, JsonApi
from pinpoint.enrich.sources.tips import mentions

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
API = "https://oauth.reddit.com"
SUBREDDITS = {
    "Tokyo": "JapanTravel+Tokyo",
    "Kyoto": "JapanTravel+Kyoto",
    "Osaka": "JapanTravel+Osaka",
    "Seoul": "koreatravel+seoul",
}
THREADS_TO_READ = 3
COMMENTS_PER_THREAD = 15


def user_agent(username: str) -> str:
    """Reddit's required format: <platform>:<app id>:<version> (by /u/<username>)."""
    return f"server:pinpoint-trip-planner:0.1 (by /u/{username})"


class Reddit:
    kind = "reddit"

    def __init__(self, api: JsonApi, client_id: str, client_secret: str) -> None:
        self.api = api
        self._client_id = client_id
        self._client_secret = client_secret
        self._token: str | None = None

    def _auth(self) -> dict[str, str]:
        if self._token is None:
            basic = base64.b64encode(f"{self._client_id}:{self._client_secret}".encode()).decode()
            response = self.api.request(
                "POST",
                TOKEN_URL,
                headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
                body=b"grant_type=client_credentials",
            )
            self._token = response["access_token"]
        return {"Authorization": f"Bearer {self._token}"}

    def find(self, place: models.Place) -> list[Document]:
        subs = SUBREDDITS.get(place.city)
        if not subs:
            return []
        try:
            search = self.api.get(
                f"{API}/r/{subs}/search",
                {"q": f'"{place.name}"', "restrict_sr": "1", "sort": "relevance", "t": "all", "limit": "10"},
                self._auth(),
            )
        except (ApiError, KeyError):
            return []
        threads = [
            c["data"]
            for c in search.get("data", {}).get("children", [])
            if mentions(f"{c['data'].get('title', '')} {c['data'].get('selftext', '')}", place.name)
        ]
        docs = []
        for thread in sorted(threads, key=lambda t: t.get("score", 0), reverse=True)[:THREADS_TO_READ]:
            try:
                listing = self.api.get(
                    f"{API}/comments/{thread['id']}",
                    {"limit": str(COMMENTS_PER_THREAD), "depth": "1", "sort": "top"},
                    self._auth(),
                )
            except ApiError:
                continue
            comments = [
                c["data"].get("body", "")
                for c in (listing[1]["data"]["children"] if len(listing) > 1 else [])
                if c.get("kind") == "t1"
            ]
            docs.append(
                Document(
                    url=f"https://www.reddit.com{urllib.parse.quote(thread['permalink'])}",
                    title=f"r/{thread.get('subreddit', '')}: {thread.get('title', '')}",
                    text="\n".join([thread.get("title", ""), thread.get("selftext", ""), *comments]),
                )
            )
        return docs
