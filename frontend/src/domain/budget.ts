import type { ExpenseCategory, Trip } from './types';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'flights', label: 'Flights' },
  { id: 'stay', label: 'Stay' },
  { id: 'food', label: 'Food' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'transit', label: 'Transit' },
];

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
