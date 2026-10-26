"""Exchange rates from Frankfurter (https://frankfurter.dev): free, no key, European Central Bank rates.

An expense is converted at the rate for its date. A date on or after today (a trip still ahead) uses the
latest rate. Rates for past dates are kept in `fx_rates`, since they never change.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from pinpoint import models
from pinpoint.enrich.sources.base import ApiError, Transport, http_json

API = "https://api.frankfurter.dev/v1"
# Every currency Frankfurter publishes.
CURRENCIES = (
    "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
    "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
)  # fmt: skip
CENT = Decimal("0.01")


class FxUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Rate:
    usd_per_unit: Decimal
    # The day the rate is from. A weekend or holiday gives the business day before.
    rate_date: date


# (currency, date or None for the latest) -> Rate. Tests pass a fake.
Fetch = Callable[[str, date | None], Rate]


def frankfurter(currency: str, on: date | None, transport: Transport = http_json) -> Rate:
    url = f"{API}/{on.isoformat() if on else 'latest'}?base={currency}&symbols=USD"
    try:
        body = transport("GET", url, {"Accept": "application/json", "User-Agent": "Pinpoint"}, None)
        return Rate(Decimal(str(body["rates"]["USD"])), date.fromisoformat(body["date"]))
    except (ApiError, KeyError, TypeError, ValueError) as e:
        raise FxUnavailable(f"Couldn't get the {currency} exchange rate. Try again in a minute.") from e


def usd_rate(session: Session, currency: str, on: date, today: date, fetch: Fetch = frankfurter) -> Rate:
    """`currency` must be one of CURRENCIES."""
    if currency == "USD":
        return Rate(Decimal(1), on)
    if on >= today:
        return fetch(currency, None)
    kept = session.get(models.FxRate, (currency, on))
    if kept is not None:
        return Rate(kept.usd_per_unit, kept.rate_date)
    rate = fetch(currency, on)
    session.add(models.FxRate(currency=currency, on_date=on, usd_per_unit=rate.usd_per_unit, rate_date=rate.rate_date))
    return rate


def to_usd(amount: Decimal, rate: Rate) -> Decimal:
    return (amount * rate.usd_per_unit).quantize(CENT, rounding=ROUND_HALF_UP)
