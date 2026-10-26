import type { StopColor } from '../../domain/types';

/** Each has white text at 4.5:1 or better. */
export const STOP_COLORS: { id: StopColor; label: string; value: string }[] = [
  { id: 'orange', label: 'Orange', value: 'var(--orange)' },
  { id: 'slate', label: 'Slate', value: 'var(--slate)' },
  { id: 'moss', label: 'Moss', value: 'var(--moss)' },
  { id: 'ink', label: 'Ink', value: 'var(--ink)' },
];

export const stopColorValue = Object.fromEntries(STOP_COLORS.map((c) => [c.id, c.value])) as Record<StopColor, string>;
