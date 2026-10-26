"""Matching a place's name in third-party text, and finding practical tips about it.

A name matches when the text contains all of the place's distinctive words, ignoring accents and generic
words like temple, shrine, market or street. So "Meiji Shrine" matches Meiji Jingu, while
"Fushimi Momoyama Castle" does not match Fushimi Inari Taisha and "Shibuya" alone does not match Shibuya Sky.

Tip finding is a stand-in until DeepSeek summarizes sources. It keeps each sentence as written.
"""

import re
import unicodedata

GENERIC_WORDS = {
    "the",
    "of",
    "and",
    "temple",
    "shrine",
    "jingu",
    "jinja",
    "taisha",
    "ji",
    "dera",
    "tera",
    "market",
    "street",
    "dori",
    "park",
    "museum",
    "tower",
    "castle",
    "garden",
    "gardens",
    "station",
    "tokyo",
    "kyoto",
    "osaka",
    "seoul",
}
ADVICE = re.compile(
    r"\b(?:lines?|queues?|wait(?:ed|ing)?|crowd(?:ed|s)?|busy|(?:go|get there|arrive|come) (?:early|before|after|at)|"
    r"early (?:morning|in the day)|book(?:ed|ing)?|reserv(?:e|ation|ations)|tickets?|sold out|sells? out|"
    r"cash only|cash|avoid|recommend(?:ed)?|worth (?:it|the|a)|skip|closed on|tourist trap|best time|sunset|"
    r"weekdays?|weekends?)\b",
    re.IGNORECASE,
)
SENTENCE = re.compile(r"(?<=[.!?。])\s+|\n+")
MIN_CHARS, MAX_CHARS = 40, 240
MAX_TIPS = 3


def _words(text: str) -> list[str]:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.findall(r"[a-z0-9]+", plain)


def core_words(name: str) -> set[str]:
    words = {w for w in _words(name) if w not in GENERIC_WORDS}
    return words or set(_words(name))


def mentions(text: str, place_name: str) -> bool:
    """For free text (a thread, a sentence): true when it contains every distinctive word of the place's name."""
    return core_words(place_name) <= set(_words(text))


def same_name(candidate: str, place_name: str, area_words: str = "") -> bool:
    """For names (a listing, an article title): the same distinctive words, allowing only the place's own
    area or city as extras. "Shinjuku Golden Gai" names Golden Gai; "Ueno Zoo" does not name Ueno Park."""
    extras = core_words(candidate) - core_words(place_name) - set(_words(area_words))
    return mentions(candidate, place_name) and not extras


def find_tips(text: str, place_name: str) -> list[str]:
    tips: list[str] = []
    for sentence in SENTENCE.split(text):
        sentence = " ".join(sentence.split())
        if not (MIN_CHARS <= len(sentence) <= MAX_CHARS) or sentence in tips:
            continue
        if mentions(sentence, place_name) and ADVICE.search(sentence):
            tips.append(sentence)
            if len(tips) == MAX_TIPS:
                break
    return tips
