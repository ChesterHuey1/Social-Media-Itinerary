"""Database tables. The shapes follow docs/decisions.md, which records where they differ from the spec.

Times of day are minutes from local midnight in the place's own time zone, the same as the frontend.
Allowed values for text columns are enforced by CHECK constraints, so bad data fails at the database.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    ARRAY,
    CheckConstraint,
    Date,
    DateTime,
    Double,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def one_of(column: str, values: tuple[str, ...]) -> CheckConstraint:
    allowed = ", ".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({allowed})", name=f"{column}_allowed")


OBJECTIVES = ("eat", "explore", "pictures", "experience")
STOP_COLORS = ("green", "blue", "amber", "ink")
FACT_SOURCES = ("google", "scrape", "deepseek")
# Third-party sources. What they say is recorded in place_facts but never applied to a place.
COMMUNITY_SOURCES = ("wikivoyage", "wikipedia", "reddit", "blog")
Money = Numeric(10, 2)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str | None]
    instagram_id: Mapped[str | None] = mapped_column(unique=True)


class Place(Base):
    """A real place, shared by every trip that uses it. Everything but the Google id is a cache."""

    __tablename__ = "places"
    __table_args__ = (
        one_of("cost_per", ("person", "ticket")),
        one_of("cost_source", FACT_SOURCES),
        one_of("tip_source", FACT_SOURCES),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    google_place_id: Mapped[str | None] = mapped_column(unique=True)
    name: Mapped[str]
    area: Mapped[str]
    city: Mapped[str]
    lat: Mapped[float] = mapped_column(Double)
    lng: Mapped[float] = mapped_column(Double)
    # {"kind": "windows", "windows": [...], "source": ...} | {"kind": "always"} | {"kind": "unconfirmed"}
    hours: Mapped[dict[str, Any]] = mapped_column(JSONB)
    last_entry_min: Mapped[int] = mapped_column(default=0)
    cost_usd: Mapped[Decimal | None] = mapped_column(Money)
    cost_per: Mapped[str | None]
    cost_source: Mapped[str | None]
    needs_booking: Mapped[bool] = mapped_column(default=False)
    tip_text: Mapped[str | None]
    tip_source: Mapped[str | None]
    objectives: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    website: Mapped[str | None]
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ScrapedPage(Base):
    """One fetched page about a place: its own website, or a third-party source such as Wikivoyage or Reddit.
    The text is kept so facts can be re-read without fetching again."""

    __tablename__ = "scraped_pages"
    __table_args__ = (
        one_of("outcome", ("stored", "robots_disallowed", "blocked", "needs_javascript", "not_html", "error")),
        one_of("kind", ("official", *COMMUNITY_SOURCES)),
    )

    url: Mapped[str] = mapped_column(String, primary_key=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    http_status: Mapped[int | None]
    outcome: Mapped[str]
    # "official" for the place's own website, else the third-party source the page came from.
    kind: Mapped[str] = mapped_column(String, server_default="official")
    title: Mapped[str | None]
    # sha256 of the cleaned text, to tell whether the page changed since last time.
    content_hash: Mapped[str | None] = mapped_column(String(64))
    text: Mapped[str | None]
    # Same-site links that looked like hours or price pages, followed on the next pass.
    links: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)


class PlaceFact(Base):
    """One value about a place and where it came from, so the UI can mark estimates."""

    __tablename__ = "place_facts"
    __table_args__ = (
        UniqueConstraint("place_id", "field", "source"),
        one_of("field", ("hours", "last_entry", "cost", "booking", "tip")),
        one_of("source", FACT_SOURCES + COMMUNITY_SOURCES),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id: Mapped[str] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"))
    field: Mapped[str]
    value: Mapped[dict[str, Any]] = mapped_column(JSONB)
    source: Mapped[str]
    page_url: Mapped[str | None]
    # The sentence the value was read from, so a person can check it.
    evidence: Mapped[str | None]
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str]
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    travelers: Mapped[int] = mapped_column(default=1)
    budget_usd: Mapped[Decimal] = mapped_column(Money)

    stays: Mapped[list["Stay"]] = relationship(order_by="Stay.check_in_date", cascade="all, delete-orphan")
    flights: Mapped[list["Flight"]] = relationship(order_by="Flight.date", cascade="all, delete-orphan")
    days: Mapped[list["Day"]] = relationship(order_by="Day.number", cascade="all, delete-orphan")
    backlog: Mapped[list["BacklogItem"]] = relationship(order_by="BacklogItem.position", cascade="all, delete-orphan")
    expenses: Mapped[list["Expense"]] = relationship(order_by="Expense.date, Expense.id", cascade="all, delete-orphan")


class Stay(Base):
    __tablename__ = "stays"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    trip_id: Mapped[str] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    name: Mapped[str]
    city: Mapped[str]
    lat: Mapped[float] = mapped_column(Double)
    lng: Mapped[float] = mapped_column(Double)
    check_in_date: Mapped[date] = mapped_column(Date)
    check_out_date: Mapped[date] = mapped_column(Date)
    check_in_min: Mapped[int]
    check_out_min: Mapped[int]
    cost_usd: Mapped[Decimal | None] = mapped_column(Money)


class Flight(Base):
    __tablename__ = "flights"
    __table_args__ = (one_of("direction", ("arrive", "depart")),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    trip_id: Mapped[str] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    airline: Mapped[str]
    number: Mapped[str]
    from_airport: Mapped[str] = mapped_column(String(3))
    to_airport: Mapped[str] = mapped_column(String(3))
    date: Mapped[date] = mapped_column(Date)
    time_min: Mapped[int]
    direction: Mapped[str]
    international: Mapped[bool]
    cost_usd: Mapped[Decimal | None] = mapped_column(Money)
    # Null uses the airport's default buffer.
    buffer_min: Mapped[int | None]
    # Minutes between the airport and the hotel. Null uses setup/days.py DEFAULT_TRANSFER_MIN.
    transfer_min: Mapped[int | None]
    big_luggage: Mapped[bool] = mapped_column(default=False)


class Day(Base):
    __tablename__ = "days"
    __table_args__ = (UniqueConstraint("trip_id", "number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trip_id: Mapped[str] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    number: Mapped[int]
    date: Mapped[date] = mapped_column(Date)
    title: Mapped[str]
    note: Mapped[str | None]
    # The hours you chose. Only Trip setup writes these.
    preferred_start_min: Mapped[int] = mapped_column(default=510)
    preferred_end_min: Mapped[int] = mapped_column(default=1290)
    # Everything below up to `stops` is worked out from flights, hotels and the hours above by
    # setup/days.py, and written only by setup/service.py `sync_days`.
    stay_id: Mapped[str] = mapped_column(ForeignKey("stays.id"))
    start_min: Mapped[int]
    end_min: Mapped[int]
    # Fixed rows (landing, hotel) shown before the first stop and after the last.
    start_rows: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    end_rows: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)

    stops: Mapped[list["Stop"]] = relationship(order_by="Stop.position", cascade="all, delete-orphan")


class Stop(Base):
    """What the user controls. Arrival times are computed from the order, never stored."""

    __tablename__ = "stops"
    __table_args__ = (
        # Deferred so a reorder can renumber every stop inside one transaction.
        UniqueConstraint("day_id", "position", deferrable=True, initially="DEFERRED"),
        one_of("color", STOP_COLORS),
        one_of("stay_source", ("estimate", "user")),
        CheckConstraint("stay_minutes > 0", name="stay_minutes_positive"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    day_id: Mapped[int] = mapped_column(ForeignKey("days.id", ondelete="CASCADE"))
    place_id: Mapped[str] = mapped_column(ForeignKey("places.id"))
    position: Mapped[int]
    title: Mapped[str | None]
    color: Mapped[str]
    objectives: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    stay_minutes: Mapped[int]
    stay_source: Mapped[str]
    locked_at_min: Mapped[int | None]

    comments: Mapped[list["Comment"]] = relationship(order_by="Comment.created_at", cascade="all, delete-orphan")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    stop_id: Mapped[str] = mapped_column(ForeignKey("stops.id", ondelete="CASCADE"))
    body: Mapped[str]
    created_at: Mapped[date] = mapped_column(Date, server_default=func.current_date())


class Leg(Base):
    """A known travel leg between two route nodes (a place id or a stay id)."""

    __tablename__ = "legs"
    __table_args__ = (one_of("mode", ("walk", "transit")), one_of("source", ("routes", "estimate")))

    from_node: Mapped[str] = mapped_column(String, primary_key=True)
    to_node: Mapped[str] = mapped_column(String, primary_key=True)
    mode: Mapped[str]
    minutes: Mapped[int]
    distance_m: Mapped[int]
    line: Mapped[str | None]
    fare_usd: Mapped[Decimal | None] = mapped_column(Money)
    source: Mapped[str]
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BacklogItem(Base):
    __tablename__ = "backlog"
    __table_args__ = (UniqueConstraint("trip_id", "place_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trip_id: Mapped[str] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    place_id: Mapped[str] = mapped_column(ForeignKey("places.id"))
    reason: Mapped[str]
    position: Mapped[int]


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (one_of("category", ("food", "tickets", "transit")),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    trip_id: Mapped[str] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    amount_usd: Mapped[Decimal] = mapped_column(Money)
    original_amount: Mapped[Decimal | None] = mapped_column(Money)
    original_currency: Mapped[str | None] = mapped_column(String(3))
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    fx_date: Mapped[date | None] = mapped_column(Date)
    category: Mapped[str]
    note: Mapped[str]
    date: Mapped[date] = mapped_column(Date)


class FxRate(Base):
    """US dollars per unit of a currency on a past date, from Frankfurter. Past rates never change, so they are kept.
    `rate_date` is the day the rate is from: a weekend or holiday gives the business day before."""

    __tablename__ = "fx_rates"

    currency: Mapped[str] = mapped_column(String(3), primary_key=True)
    on_date: Mapped[date] = mapped_column(Date, primary_key=True)
    usd_per_unit: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    rate_date: Mapped[date] = mapped_column(Date)


class SavedPlace(Base):
    """A place the user saved, from a Reel or a search. Status tracks whether a trip uses it."""

    __tablename__ = "saved_places"
    __table_args__ = (
        UniqueConstraint("user_id", "place_id"),
        one_of("source", ("reel", "search")),
        one_of("status", ("new", "in_trip", "dismissed")),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    place_id: Mapped[str] = mapped_column(ForeignKey("places.id"))
    source: Mapped[str]
    reel_count: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(default="new")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SavedPost(Base):
    __tablename__ = "saved_posts"
    __table_args__ = (one_of("status", ("pending", "done", "needs_review")),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    url: Mapped[str]
    caption: Mapped[str | None]
    status: Mapped[str]
