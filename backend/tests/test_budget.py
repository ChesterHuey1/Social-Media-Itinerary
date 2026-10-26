import re
from collections.abc import Iterator
from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from pinpoint.budget import fx
from pinpoint.budget.api import get_fx_fetch
from pinpoint.config import BACKEND_DIR
from pinpoint.main import app

YESTERDAY = date.today() - timedelta(days=1)
NEXT_MONTH = date.today() + timedelta(days=30)
FRIDAY = date(2026, 10, 23)


class FakeFrankfurter:
    """1 JPY = 0.0063774 USD. A weekend date gives Friday's rate, the way Frankfurter does."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, date | None]] = []
        self.down = False

    def __call__(self, currency: str, on: date | None) -> fx.Rate:
        self.calls.append((currency, on))
        if self.down:
            raise fx.FxUnavailable("Couldn't get the JPY exchange rate. Try again in a minute.")
        if on is None:
            return fx.Rate(Decimal("0.0063514"), date.today())
        return fx.Rate(Decimal("0.0063774"), FRIDAY if on.weekday() >= 5 else on)


@pytest.fixture
def rates() -> Iterator[FakeFrankfurter]:
    fake = FakeFrankfurter()
    app.dependency_overrides[get_fx_fetch] = lambda: fake
    yield fake


def add(client: TestClient, **fields: object) -> dict:
    body = {"amount": 3200, "currency": "JPY", "category": "food", "note": "Ramen", "date": "2026-10-24", **fields}
    response = client.post("/api/trips/demo/expenses", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_foreign_expense_keeps_the_original_and_the_rate_used(client: TestClient, rates: FakeFrankfurter) -> None:
    trip = add(client)
    ramen = next(e for e in trip["expenses"] if e["note"] == "Ramen")
    # 3200 x 0.0063774 = 20.40768. Saturday the 24th uses Friday's rate, and says so.
    assert ramen == {
        "id": ramen["id"],
        "amountUsd": 20.41,
        "category": "food",
        "note": "Ramen",
        "date": "2026-10-24",
        "originalAmount": 3200,
        "originalCurrency": "JPY",
        "fxRate": 0.0063774,
        "fxDate": "2026-10-23",
    }


def test_past_rates_are_fetched_once(client: TestClient, rates: FakeFrankfurter) -> None:
    add(client)
    add(client, note="Coffee", amount=500)
    assert rates.calls == [("JPY", date(2026, 10, 24))]


def test_an_expense_ahead_of_today_uses_the_latest_rate(client: TestClient, rates: FakeFrankfurter) -> None:
    trip = add(client, date=NEXT_MONTH.isoformat())
    ramen = next(e for e in trip["expenses"] if e["note"] == "Ramen")
    assert rates.calls == [("JPY", None)]
    assert ramen["amountUsd"] == 20.32
    assert ramen["fxDate"] == date.today().isoformat()


def test_dollar_expense_needs_no_rate(client: TestClient, rates: FakeFrankfurter) -> None:
    trip = add(client, currency="USD", amount=12.5, note="Taxi", category="transit")
    taxi = next(e for e in trip["expenses"] if e["note"] == "Taxi")
    assert taxi["amountUsd"] == 12.5
    assert taxi["originalCurrency"] is None and taxi["fxRate"] is None
    assert rates.calls == []


def test_no_rate_means_nothing_is_saved(client: TestClient, rates: FakeFrankfurter) -> None:
    rates.down = True
    before = client.get("/api/trips/demo").json()["expenses"]
    body = {"amount": 3200, "currency": "JPY", "category": "food", "note": "Ramen", "date": YESTERDAY.isoformat()}
    response = client.post("/api/trips/demo/expenses", json=body)
    assert response.status_code == 502
    assert "exchange rate" in response.json()["detail"]
    assert client.get("/api/trips/demo").json()["expenses"] == before


@pytest.mark.parametrize(
    "fields",
    [{"amount": 0}, {"amount": -5}, {"currency": "XYZ"}, {"category": "flights"}, {"date": "soon"}],
)
def test_bad_expenses_are_refused(client: TestClient, rates: FakeFrankfurter, fields: dict) -> None:
    body = {"amount": 3200, "currency": "JPY", "category": "food", "note": "", "date": "2026-10-24", **fields}
    assert client.post("/api/trips/demo/expenses", json=body).status_code == 422


def test_delete_expense(client: TestClient, rates: FakeFrankfurter) -> None:
    trip = add(client)
    ramen = next(e for e in trip["expenses"] if e["note"] == "Ramen")
    response = client.delete(f"/api/trips/demo/expenses/{ramen['id']}")
    assert response.status_code == 200
    assert ramen["id"] not in {e["id"] for e in response.json()["expenses"]}
    assert client.delete(f"/api/trips/demo/expenses/{ramen['id']}").status_code == 404


def test_quote_shows_the_rate_before_saving(client: TestClient, rates: FakeFrankfurter) -> None:
    response = client.get("/api/fx", params={"currency": "JPY", "date": "2026-10-25"})
    assert response.json() == {"currency": "JPY", "usdPerUnit": 0.0063774, "rateDate": "2026-10-23"}


def test_frankfurter_reads_the_rate_and_its_date() -> None:
    seen = []

    def transport(method: str, url: str, headers: dict, body: bytes | None) -> dict:
        seen.append(url)
        return {"amount": 1.0, "base": "JPY", "date": "2026-10-23", "rates": {"USD": 0.0063774}}

    rate = fx.frankfurter("JPY", date(2026, 10, 24), transport)
    assert rate == fx.Rate(Decimal("0.0063774"), date(2026, 10, 23))
    assert seen == ["https://api.frankfurter.dev/v1/2026-10-24?base=JPY&symbols=USD"]
    with pytest.raises(fx.FxUnavailable):
        fx.frankfurter("JPY", None, lambda *_: {"message": "not found"})


def test_frontend_offers_the_same_currencies() -> None:
    source = (BACKEND_DIR.parent / "frontend/src/domain/budget.ts").read_text(encoding="utf-8")
    listed = re.search(r"export const CURRENCIES = \[(.*?)\] as const", source, re.DOTALL)
    assert listed, "CURRENCIES not found in frontend/src/domain/budget.ts"
    assert tuple(re.findall(r"'([A-Z]{3})'", listed.group(1))) == fx.CURRENCIES
