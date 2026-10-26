import type { StopColor } from '../../domain/types';

/** Each has white text at 4.5:1 or better. */
export const STOP_COLORS: { id: StopColor; label: string; value: string }[] = [
  { id: 'green', label: 'Green', value: 'var(--stop-green)' },
  { id: 'blue', label: 'Blue', value: 'var(--stop-blue)' },
  { id: 'amber', label: 'Amber', value: 'var(--stop-amber)' },
  { id: 'ink', label: 'Ink', value: 'var(--stop-ink)' },
];

export const stopColorValue = Object.fromEntries(STOP_COLORS.map((c) => [c.id, c.value])) as Record<StopColor, string>;
