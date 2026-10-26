import { useRef, useState } from 'react';
import { fxQuote, type FxQuote } from '../../state/api';

export type Rate =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; quote: FxQuote }
  | { status: 'failed'; message: string };

export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** The rate for the expense form's currency and date. `ask` runs from event handlers, so no effect is needed. */
export function useExchangeRate(): [Rate, (currency: string, date: string) => void] {
  const [rate, setRate] = useState<Rate>({ status: 'none' });
  // Only the answer for the latest currency and date is shown.
  const latest = useRef('');
  const ask = (currency: string, date: string) => {
    const key = `${currency} ${date}`;
    latest.current = key;
    if (currency === 'USD' || !date) return setRate({ status: 'none' });
    setRate({ status: 'loading' });
    fxQuote(currency, date).then(
      (quote) => latest.current === key && setRate({ status: 'ready', quote }),
      (e: Error) => latest.current === key && setRate({ status: 'failed', message: e.message }),
    );
  };
  return [rate, ask];
}
