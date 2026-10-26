import type { ExpenseCategory, SpendingCategory, Trip } from './types';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'flights', label: 'Flights' },
  { id: 'stay', label: 'Stay' },
  { id: 'food', label: 'Food' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'transit', label: 'Transit' },
];

export const SPENDING_CATEGORIES = EXPENSE_CATEGORIES.filter(
  (c): c is { id: SpendingCategory; label: string } => c.id !== 'flights' && c.id !== 'stay',
);

/** Every currency Frankfurter publishes. backend/tests/test_budget.py checks this matches backend/src/pinpoint/budget/fx.py. */
export const CURRENCIES = [
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK',
  'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
] as const;

/** Flight and hotel costs live on their own rows; everything else is an expense. */
export function spendByCategory(trip: Trip): Record<ExpenseCategory, number> {
  const totals: Record<ExpenseCategory, number> = { flights: 0, stay: 0, food: 0, tickets: 0, transit: 0 };
  for (const f of trip.flights) totals.flights += f.costUsd ?? 0;
  for (const s of trip.stays) totals.stay += s.costUsd ?? 0;
  for (const e of trip.expenses) totals[e.category] += e.amountUsd;
  return totals;
}

export function totalSpent(byCategory: Record<ExpenseCategory, number>): number {
  return Object.values(byCategory).reduce((sum, n) => sum + n, 0);
}

/** The dollar amount the server will save, rounded to the cent the same way (half up). */
export function toUsd(amount: number, usdPerUnit: number): number {
  // Trimming to 12 digits first undoes float error (1.005 * 100 is 100.49999999999999), so halves round up.
  return Math.round(Number((amount * usdPerUnit * 100).toPrecision(12))) / 100;
}

/** The currency the form starts on: the one used for the latest foreign expense, or dollars. */
export function lastCurrency(trip: Trip): string {
  return trip.expenses.findLast((e) => e.originalCurrency !== null)?.originalCurrency ?? 'USD';
}

/** "¥3,200", "€12.50". */
export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}
