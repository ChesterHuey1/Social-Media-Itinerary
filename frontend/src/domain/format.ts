export function formatClock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "08:45", the value an `<input type="time">` takes. */
export function toTimeInput(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function parseTimeInput(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "8:45 – 10:15 AM", or "11:00 AM – 1:00 PM" when the period changes. */
export function formatRange(fromMin: number, toMin: number): string {
  const from = formatClock(fromMin);
  const to = formatClock(toMin);
  const [fromTime, fromPeriod] = from.split(' ');
  return fromPeriod === to.split(' ')[1] ? `${fromTime} – ${to}` : `${from} – ${to}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

export function formatUsd(amount: number, cents = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return meters < 10_000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 1000)} km`;
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "Fri, Nov 13" */
export function formatDate(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Oct 20" */
export function formatShortDate(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Nov 12 – 17, 2026" */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = utcDate(startIso);
  const end = utcDate(endIso);
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const endPart = start.getUTCMonth() === end.getUTCMonth() ? `${end.getUTCDate()}` : `${month(end)} ${end.getUTCDate()}`;
  return `${month(start)} ${start.getUTCDate()} – ${endPart}, ${end.getUTCFullYear()}`;
}
