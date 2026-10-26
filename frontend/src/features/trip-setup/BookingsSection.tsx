import { formatClock, formatDate, formatShortDate, formatUsd } from '../../domain/format';
import type { Flight, Stay, Trip } from '../../domain/types';
import { Button } from '../../ui/Button';
import { SmallLabel, TextArea, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import ui from '../../ui/ui.module.css';
import s from './TripSetup.module.css';

export function BookingsSection({ trip }: { trip: Trip }) {
  return (
    <section className={s.section} aria-labelledby="step-1">
      <div className={s.sectionHead}>
        <SmallLabel>Step 1</SmallLabel>
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
        <AddFlightForm />
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

function costText(costUsd: number | null, category: string): string {
  return costUsd === null ? 'Cost not added' : `${formatUsd(costUsd)} · ${category}`;
}

function FlightRow({ flight }: { flight: Flight }) {
  const when = flight.direction === 'arrive' ? 'Lands' : 'Departs';
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
      <Button variant="text">Edit</Button>
    </div>
  );
}

function StayRow({ stay }: { stay: Stay }) {
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
      <Button variant="text">Edit</Button>
    </div>
  );
}

function AddFlightForm() {
  return (
    <form className={s.addForm} aria-label="Add a flight" onSubmit={(e) => e.preventDefault()}>
      <span className={s.strong}>Add a flight</span>
      <div className={s.grid3}>
        <TextField label="Airline" />
        <TextField label="Flight number" />
        <div className={ui.field}>
          <span className={ui.fieldLabel}>Type</span>
          <label className={s.checkRow}>
            <input type="checkbox" className={s.checkbox} />
            International
          </label>
        </div>
        <TextField label="From airport" />
        <TextField label="To airport" />
        <TextField label="Cost (optional)" />
        <TextField label="Date" type="date" time />
        <TextField label="Departs" type="time" time />
        <TextField label="Arrives" type="time" time />
      </div>
      <div className={s.formActions}>
        <Button variant="text">Cancel</Button>
        <Button type="submit">Add flight</Button>
      </div>
    </form>
  );
}
