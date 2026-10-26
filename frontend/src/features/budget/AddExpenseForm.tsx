import { useState, type FormEvent } from 'react';
import { CURRENCIES, lastCurrency, SPENDING_CATEGORIES, toUsd } from '../../domain/budget';
import { formatShortDate, formatUsd } from '../../domain/format';
import type { SpendingCategory, Trip } from '../../domain/types';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { SelectField, TextField } from '../../ui/Field';
import s from './Budget.module.css';
import { todayIso, type Rate } from './exchangeRate';

const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));
const CATEGORY_OPTIONS = SPENDING_CATEGORIES.map((c) => ({ value: c.id, label: c.label }));

/** "$20.41 at the Oct 23 rate" under the amount, so the dollar figure is clear before saving. */
function previewText(amount: number, currency: string, rate: Rate): string | null {
  if (currency === 'USD') return null;
  if (rate.status === 'loading') return 'Getting the exchange rate…';
  if (rate.status === 'failed') return rate.message;
  if (rate.status !== 'ready' || !(amount > 0)) return null;
  return `${formatUsd(toUsd(amount, rate.quote.usdPerUnit), true)} at the ${formatShortDate(rate.quote.rateDate)} rate`;
}

type Props = { trip: Trip; rate: Rate; askRate: (currency: string, date: string) => void; onClose: () => void };

/** Opened with `askRate(lastCurrency(trip), todayIso())` already called, so the starting rate is on its way. */
export function AddExpenseForm({ trip, rate, askRate, onClose }: Props) {
  const { addExpense } = useTrip();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(lastCurrency(trip));
  const [category, setCategory] = useState<SpendingCategory>('food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount);
  const preview = previewText(value, currency, rate);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await addExpense({ amount: value, currency, category, note, date });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <form className={s.form} onSubmit={submit} aria-label="Add expense">
      <div className={s.amountRow}>
        <TextField
          label="Amount"
          inputMode="decimal"
          pattern="[0-9]*[.]?[0-9]{0,2}"
          title="A number, like 3200 or 12.50"
          required
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <SelectField
          label="Currency"
          options={CURRENCY_OPTIONS}
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            askRate(e.target.value, date);
          }}
        />
      </div>
      {preview && (
        <p className={s.preview} role="status">
          {preview}
        </p>
      )}
      <SelectField
        label="Category"
        options={CATEGORY_OPTIONS}
        value={category}
        onChange={(e) => setCategory(e.target.value as SpendingCategory)}
      />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <TextField
        label="Date"
        type="date"
        required
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          askRate(currency, e.target.value);
        }}
      />
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <div className={s.actions}>
        <Button type="submit" disabled={saving || (currency !== 'USD' && rate.status !== 'ready')}>
          {saving ? 'Saving…' : 'Save expense'}
        </Button>
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
