import { useState } from 'react';
import { EXPENSE_CATEGORIES, formatMoney, lastCurrency, spendByCategory, totalSpent } from '../../domain/budget';
import { formatShortDate, formatUsd } from '../../domain/format';
import type { Expense, Trip } from '../../domain/types';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { SmallLabel } from '../../ui/Field';
import { AddExpenseForm } from './AddExpenseForm';
import s from './Budget.module.css';
import { todayIso, useExchangeRate } from './exchangeRate';

/** Spend against the budget, by category, with the expenses behind it. Over budget, the bar fills in the warning color. */
export function BudgetPanel({ trip }: { trip: Trip }) {
  const [adding, setAdding] = useState(false);
  const [rate, askRate] = useExchangeRate();
  const byCategory = spendByCategory(trip);
  const spent = totalSpent(byCategory);
  const over = spent - trip.budgetUsd;
  const percent = Math.min(100, Math.round((spent / trip.budgetUsd) * 100));
  const expenses = trip.expenses.toSorted((a, b) => b.date.localeCompare(a.date));

  const open = () => {
    askRate(lastCurrency(trip), todayIso());
    setAdding(true);
  };

  return (
    <section aria-label="Budget" className={s.budget}>
      <SmallLabel>Budget</SmallLabel>
      <div className={s.figure}>
        <span className={s.number}>{over > 0 ? `${formatUsd(over)} over` : formatUsd(spent)}</span>
        <span className={s.meta}>of {formatUsd(trip.budgetUsd)}</span>
      </div>
      <div className={s.bar} role="img" aria-label={`${percent} percent of budget spent`}>
        <div className={cx(s.barFill, over > 0 && s.barOver)} style={{ width: `${percent}%` }} />
      </div>
      <div className={s.categories}>
        {EXPENSE_CATEGORIES.map((c) => (
          <div key={c.id} className={s.row}>
            <span className={s.meta}>{c.label}</span>
            <span>{formatUsd(byCategory[c.id])}</span>
          </div>
        ))}
      </div>
      {adding ? (
        <AddExpenseForm trip={trip} rate={rate} askRate={askRate} onClose={() => setAdding(false)} />
      ) : (
        <Button icon="plus" onClick={open}>
          Add expense
        </Button>
      )}
      {expenses.length > 0 && (
        <div className={s.expenses}>
          <SmallLabel>Expenses</SmallLabel>
          <ul className={s.list}>
            {expenses.map((e) => (
              <ExpenseRow key={e.id} expense={e} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const { removeExpense } = useTrip();
  const [removing, setRemoving] = useState(false);
  const category = EXPENSE_CATEGORIES.find((c) => c.id === expense.category)!.label;
  const name = expense.note || category;

  const remove = () => {
    setRemoving(true);
    removeExpense(expense.id).catch(() => setRemoving(false));
  };

  return (
    <li className={s.expense}>
      <div className={s.expenseText}>
        <span className={s.expenseName}>{name}</span>
        <span className={s.meta}>
          {formatShortDate(expense.date)} · {category}
          {expense.originalCurrency && expense.originalAmount !== null && (
            <> · {formatMoney(expense.originalAmount, expense.originalCurrency)}</>
          )}
        </span>
      </div>
      <span className={s.expenseAmount}>{formatUsd(expense.amountUsd, !Number.isInteger(expense.amountUsd))}</span>
      <Button variant="text" icon="close" aria-label={`Remove ${name}`} onClick={remove} disabled={removing} />
    </li>
  );
}
