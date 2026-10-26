import { useState, type FormEvent } from 'react';
import { formatClock, formatDate, formatShortDate, formatUsd, parseTimeInput, toTimeInput } from '../../domain/format';
import type { Flight, Stay, Trip } from '../../domain/types';
import { Button } from '../../ui/Button';
import { SelectField, SmallLabel, TextArea, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import ui from '../../ui/ui.module.css';
import s from './TripSetup.module.css';
import { useSave } from './useSave';

export function BookingsSection({ trip }: { trip: Trip }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={s.section} aria-labelledby="step-1">
      <div className={s.sectionHead}>
        <span className={s.step}>1</span>
        <h2 id="step-1" className={s.sectionTitle}>
          Flights and hotels
        </h2>
      </div>

      <div className={s.stack}>
        <TextArea label="Paste a confirmation email" rows={3} placeholder="Booking confirmation text" />
        <div className={s.formActions}>
          <Button>Fill from email</Button>
        </div>
      </div>

      <div className={s.divider} />

      <div className={s.stack}>
        <SmallLabel>Flights</SmallLabel>
        {trip.flights.map((f) => (
          <FlightRow key={f.id} flight={f} />
        ))}
        {adding ? (
          <FlightForm flight={newFlight(trip)} title="Add a flight" onClose={() => setAdding(false)} />
        ) : (
          <div>
            <Button icon="plus" onClick={() => setAdding(true)}>
              Add a flight
            </Button>
          </div>
        )}
      </div>

      <div className={s.stack}>
        <SmallLabel>Hotels</SmallLabel>
        {trip.stays.map((stay) => (
          <StayRow key={stay.id} stay={stay} />
        ))}
        <div className={ui.field}>
          <label htmlFor="hotel-search" className={ui.fieldLabel}>
            Add a hotel
          </label>
          <div className={s.searchWrap}>
            <Icon name="search" />
            <input id="hotel-search" className={`${ui.input} ${s.searchInput}`} placeholder="Hotel name or address" />
          </div>
        </div>
      </div>
    </section>
  );
}

/** A blank flight: arriving on the trip's first day if there's no arrival yet, otherwise leaving on its last. */
function newFlight(trip: Trip): Flight {
  const arriving = !trip.flights.some((f) => f.direction === 'arrive');
  return {
    id: `f-${crypto.randomUUID().slice(0, 8)}`,
    airline: '',
    number: '',
    from: '',
    to: '',
    date: arriving ? trip.startDate : trip.endDate,
    timeMin: 12 * 60,
    direction: arriving ? 'arrive' : 'depart',
    international: true,
    costUsd: null,
    bufferMin: null,
    transferMin: null,
  };
}

function costText(costUsd: number | null, category: string): string {
  return costUsd === null ? 'Cost not added' : `${formatUsd(costUsd)} · ${category}`;
}

function FlightRow({ flight }: { flight: Flight }) {
  const [editing, setEditing] = useState(false);
  const when = flight.direction === 'arrive' ? 'Lands' : 'Departs';
  if (editing) return <FlightForm flight={flight} title={`Edit ${flight.number}`} onClose={() => setEditing(false)} />;
  return (
    <div className={s.fixedRow}>
      <Icon name="plane" />
      <span className={s.fixedRowText}>
        <span className={s.strong}>
          {flight.number} · {flight.from} to {flight.to}
        </span>{' '}
        <span className={s.muted}>
          · {when} {formatDate(flight.date)}, {formatClock(flight.timeMin)} · {flight.international ? 'International' : 'Domestic'}
        </span>
      </span>
      <span className={s.small}>{costText(flight.costUsd, 'Flights')}</span>
      <Button variant="text" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}

const DIRECTIONS = [
  { value: 'arrive', label: 'Arriving for the trip' },
  { value: 'depart', label: 'Leaving at the end' },
] as const;

/** "" for empty, otherwise a whole number. */
function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

function FlightForm({ flight, title, onClose }: { flight: Flight; title: string; onClose: () => void }) {
  const { save, saving, error } = useSave();
  const [draft, setDraft] = useState(flight);
  const [cost, setCost] = useState(flight.costUsd?.toString() ?? '');
  const [buffer, setBuffer] = useState(flight.bufferMin?.toString() ?? '');
  const [transfer, setTransfer] = useState(flight.transferMin?.toString() ?? '');
  const isNew = title.startsWith('Add');
  const arriving = draft.direction === 'arrive';
  const set = (fields: Partial<Flight>) => setDraft((d) => ({ ...d, ...fields }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const saved = { ...draft, costUsd: optionalNumber(cost), bufferMin: optionalNumber(buffer), transferMin: optionalNumber(transfer) };
    if (await save({ type: 'saveFlight', flight: saved })) onClose();
  };

  const remove = async () => {
    if (await save({ type: 'removeFlight', flightId: flight.id })) onClose();
  };

  return (
    <form className={s.addForm} aria-label={title} onSubmit={submit}>
      <span className={s.strong}>{title}</span>
      <div className={s.grid3}>
        <TextField label="Airline" required value={draft.airline} onChange={(e) => set({ airline: e.target.value })} />
        <TextField label="Flight number" required value={draft.number} onChange={(e) => set({ number: e.target.value })} />
        <SelectField
          label="This flight is"
          options={DIRECTIONS}
          value={draft.direction}
          onChange={(e) => set({ direction: e.target.value as Flight['direction'] })}
        />
        <TextField
          label="From airport"
          required
          maxLength={3}
          pattern="[A-Za-z]{3}"
          title="The 3-letter airport code, like SFO"
          value={draft.from}
          onChange={(e) => set({ from: e.target.value.toUpperCase() })}
        />
        <TextField
          label="To airport"
          required
          maxLength={3}
          pattern="[A-Za-z]{3}"
          title="The 3-letter airport code, like HND"
          value={draft.to}
          onChange={(e) => set({ to: e.target.value.toUpperCase() })}
        />
        <div className={ui.field}>
          <span className={ui.fieldLabel}>Type</span>
          <label className={s.checkRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={draft.international}
              onChange={(e) => set({ international: e.target.checked })}
            />
            International
          </label>
        </div>
        <TextField label="Date" type="date" time required value={draft.date} onChange={(e) => set({ date: e.target.value })} />
        <TextField
          label={arriving ? 'Lands' : 'Takes off'}
          type="time"
          time
          required
          value={toTimeInput(draft.timeMin)}
          onChange={(e) => {
            const min = parseTimeInput(e.target.value);
            if (min !== null) set({ timeMin: min });
          }}
        />
        <TextField label="Cost (USD)" inputMode="decimal" pattern="[0-9]*[.]?[0-9]{0,2}" value={cost} onChange={(e) => setCost(e.target.value)} />
        <TextField
          label={arriving ? 'Minutes for immigration and bags' : 'Minutes at the airport'}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={String(arriving ? (draft.international ? 90 : 60) : draft.international ? 180 : 120)}
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
        />
        <TextField
          label={arriving ? 'Minutes to the hotel' : 'Minutes to the airport'}
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="60"
          value={transfer}
          onChange={(e) => setTransfer(e.target.value)}
        />
      </div>
      {error && (
        <p className={s.formError} role="alert">
          {error}
        </p>
      )}
      <div className={s.formActions}>
        {!isNew && (
          <Button variant="text" onClick={remove} disabled={saving}>
            Remove flight
          </Button>
        )}
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Add flight' : 'Save flight'}
        </Button>
      </div>
    </form>
  );
}

function StayRow({ stay }: { stay: Stay }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <StayForm stay={stay} onClose={() => setEditing(false)} />;
  return (
    <div className={s.fixedRow}>
      <Icon name="bed" />
      <span className={s.fixedRowText}>
        <span className={s.strong}>{stay.name}</span>{' '}
        <span className={s.muted}>
          · {stay.city} · {formatShortDate(stay.checkInDate)} – {formatShortDate(stay.checkOutDate)} · In{' '}
          {formatClock(stay.checkInMin)}, out {formatClock(stay.checkOutMin)}
        </span>
      </span>
      <span className={s.small}>{costText(stay.costUsd, 'Stay')}</span>
      <Button variant="text" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );
}

function StayForm({ stay, onClose }: { stay: Stay; onClose: () => void }) {
  const { save, saving, error } = useSave();
  const [draft, setDraft] = useState(stay);
  const [cost, setCost] = useState(stay.costUsd?.toString() ?? '');
  const set = (fields: Partial<Stay>) => setDraft((d) => ({ ...d, ...fields }));
  const time = (key: 'checkInMin' | 'checkOutMin') => (value: string) => {
    const min = parseTimeInput(value);
    if (min !== null) set({ [key]: min });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await save({ type: 'saveStay', stay: { ...draft, costUsd: optionalNumber(cost) } })) onClose();
  };

  return (
    <form className={s.addForm} aria-label={`Edit ${stay.name}`} onSubmit={submit}>
      <span className={s.strong}>{stay.name}</span>
      <div className={s.grid3}>
        <TextField label="Check-in date" type="date" time required value={draft.checkInDate} onChange={(e) => set({ checkInDate: e.target.value })} />
        <TextField label="Check-in from" type="time" time required value={toTimeInput(draft.checkInMin)} onChange={(e) => time('checkInMin')(e.target.value)} />
        <TextField label="Cost (USD)" inputMode="decimal" pattern="[0-9]*[.]?[0-9]{0,2}" value={cost} onChange={(e) => setCost(e.target.value)} />
        <TextField label="Check-out date" type="date" time required value={draft.checkOutDate} onChange={(e) => set({ checkOutDate: e.target.value })} />
        <TextField label="Check-out by" type="time" time required value={toTimeInput(draft.checkOutMin)} onChange={(e) => time('checkOutMin')(e.target.value)} />
      </div>
      {error && (
        <p className={s.formError} role="alert">
          {error}
        </p>
      )}
      <div className={s.formActions}>
        <Button variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save hotel'}
        </Button>
      </div>
    </form>
  );
}
