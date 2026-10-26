import { describe, expect, it } from 'vitest';
import { formatMoney, lastCurrency, spendByCategory, toUsd, totalSpent } from './budget';
import { testTrip } from './testTrip';
import type { Expense } from './types';

const expense = (fields: Partial<Expense>): Expense => ({
  id: 'e',
  amountUsd: 10,
  category: 'food',
  note: '',
  date: '2026-01-01',
  originalAmount: null,
  originalCurrency: null,
  fxRate: null,
  fxDate: null,
  ...fields,
});

describe('budget', () => {
  it('rounds to the cent the way the server does', () => {
    // backend/tests/test_budget.py: 3200 JPY at 0.0063774 saves as $20.41.
    expect(toUsd(3200, 0.0063774)).toBe(20.41);
    expect(toUsd(1.005, 1)).toBe(1.01);
  });

  it('adds flights, stays and expenses into their categories', () => {
    const trip = {
      ...testTrip([]),
      expenses: [expense({ amountUsd: 20.41 }), expense({ id: 'f', amountUsd: 12, category: 'transit' })],
    };
    const byCategory = spendByCategory(trip);
    expect(byCategory.food).toBe(20.41);
    expect(byCategory.transit).toBe(12);
    expect(totalSpent(byCategory)).toBeCloseTo(32.41 + byCategory.flights + byCategory.stay);
  });

  it('starts the form on the currency used last', () => {
    const trip = testTrip([]);
    expect(lastCurrency(trip)).toBe('USD');
    expect(
      lastCurrency({ ...trip, expenses: [expense({ originalCurrency: 'JPY' }), expense({ id: 'f', originalCurrency: null })] }),
    ).toBe('JPY');
  });

  it('formats money in its own currency', () => {
    expect(formatMoney(3200, 'JPY')).toBe('¥3,200');
    expect(formatMoney(12.5, 'EUR')).toBe('€12.50');
  });
});
