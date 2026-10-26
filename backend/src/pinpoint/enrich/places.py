"""Google Places details: the first source in the fill-in order. A mock until GOOGLE_MAPS_API_KEY is set."""

from dataclasses import dataclass
from typing import Protocol

from pinpoint import models
from pinpoint.config import Settings


@dataclass(frozen=True)
class PlaceDetails:
    website: str | None


class PlacesClient(Protocol):
    def details(self, place: models.Place) -> PlaceDetails: ...


# What Places details would return as `websiteUri` for the sample places.
# Uobei and Nonbei Yokocho are unconfirmed guesses; the scrape report shows each page's title to check them.
SAMPLE_WEBSITES = {
    "tsukiji": "https://www.tsukiji.or.jp/",
    "teamlab": "https://www.teamlab.art/e/planets/",
    "ichiran": "https://en.ichiran.com/",
    "shibuyaSky": "https://www.shibuya-scramble-square.com/sky/",
    "nonbei": "http://nonbei.tokyo/",
    "uobei": "https://www.uobei.info/",
    "itoya": "https://www.ito-ya.co.jp/",
    "sensoji": "https://www.senso-ji.jp/",
    "meiji": "https://www.meijijingu.or.jp/en/",
    "goldenGai": "https://www.goldengai.jp/",
    "omoide": "https://shinjuku-omoide.com/",
    "kappabashi": "https://www.kappabashi.or.jp/",
    "fushimi": "https://inari.jp/en/",
    "nishiki": "https://www.kyoto-nishiki.or.jp/",
    "kinkakuji": "https://www.shokoku-ji.jp/kinkakuji/",
}


class MockPlacesClient:
    def details(self, place: models.Place) -> PlaceDetails:
        return PlaceDetails(website=SAMPLE_WEBSITES.get(place.id))


def places_client(settings: Settings) -> PlacesClient:
    if settings.google_maps_api_key:
        raise NotImplementedError(
            "The real Google Places client is not built yet; clear GOOGLE_MAPS_API_KEY to use the mock."
        )
    return MockPlacesClient()
