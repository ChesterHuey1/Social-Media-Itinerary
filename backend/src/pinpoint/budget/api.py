import secrets
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from pinpoint import models, schemas
from pinpoint.budget import fx
from pinpoint.db import get_session
from pinpoint.trips.read import load_trip

router = APIRouter(prefix="/api", tags=["budget"])

SessionDep = Annotated[Session, Depends(get_session)]


def get_fx_fetch() -> fx.Fetch:
    """Frankfurter. Tests override this."""
    return fx.frankfurter


FetchDep = Annotated[fx.Fetch, Depends(get_fx_fetch)]


def _date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, f"{value} isn't a date.") from None


def _rate(session: Session, currency: str, on: date, fetch: fx.Fetch) -> fx.Rate:
    if currency not in fx.CURRENCIES:
        raise HTTPException(422, f"{currency} isn't a currency Pinpoint can convert.")
    try:
        return fx.usd_rate(session, currency, on, date.today(), fetch)
    except fx.FxUnavailable as e:
        raise HTTPException(502, str(e)) from None


def _trip(session: Session, trip_id: str) -> models.Trip:
    trip = session.get(models.Trip, trip_id)
    if trip is None:
        raise HTTPException(404, f"No trip {trip_id}")
    return trip


@router.get("/fx", response_model=schemas.FxQuote, response_model_by_alias=True)
def quote(
    session: SessionDep, fetch: FetchDep, currency: Annotated[str, Query()], on: Annotated[str, Query(alias="date")]
) -> schemas.FxQuote:
    """The rate an expense on this date would use, so the form can show the dollar amount before saving."""
    rate = _rate(session, currency, _date(on), fetch)
    session.commit()
    return schemas.FxQuote(
        currency=currency, usd_per_unit=float(rate.usd_per_unit), rate_date=rate.rate_date.isoformat()
    )


@router.post("/trips/{trip_id}/expenses", response_model=schemas.Trip, response_model_by_alias=True)
def add_expense(trip_id: str, body: schemas.NewExpense, session: SessionDep, fetch: FetchDep) -> schemas.Trip:
    """Converts at the rate for the expense's date and keeps the original amount, the rate and the rate's date."""
    trip = _trip(session, trip_id)
    on = _date(body.date)
    amount = Decimal(str(body.amount)).quantize(fx.CENT)
    rate = _rate(session, body.currency, on, fetch)
    foreign = body.currency != "USD"
    trip.expenses.append(
        models.Expense(
            id=f"e-{secrets.token_hex(4)}",
            amount_usd=fx.to_usd(amount, rate),
            original_amount=amount if foreign else None,
            original_currency=body.currency if foreign else None,
            fx_rate=rate.usd_per_unit if foreign else None,
            fx_date=rate.rate_date if foreign else None,
            category=body.category,
            note=body.note.strip(),
            date=on,
        )
    )
    session.commit()
    return load_trip(session, trip_id)


@router.delete("/trips/{trip_id}/expenses/{expense_id}", response_model=schemas.Trip, response_model_by_alias=True)
def delete_expense(trip_id: str, expense_id: str, session: SessionDep) -> schemas.Trip:
    trip = _trip(session, trip_id)
    expense = next((e for e in trip.expenses if e.id == expense_id), None)
    if expense is None:
        raise HTTPException(404, f"No expense {expense_id}")
    trip.expenses.remove(expense)
    session.commit()
    return load_trip(session, trip_id)
