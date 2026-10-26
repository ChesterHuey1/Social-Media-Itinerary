import type { ReactNode } from 'react';
import { formatDuration } from '../domain/format';
import type { Objective, Stop } from '../domain/types';
import { cx } from './cx';
import { objectiveClass, objectiveLabel } from './objectives';
import ui from './ui.module.css';

export function ObjectiveChip({ objective }: { objective: Objective }) {
  return <span className={cx(ui.chip, objectiveClass[objective])}>{objectiveLabel[objective]}</span>;
}

export function BookAheadChip() {
  return <span className={cx(ui.chip, ui.book)}>Book ahead</span>;
}

export function OutlineChip({ children }: { children: ReactNode }) {
  return <span className={cx(ui.chip, ui.outline)}>{children}</span>;
}

/** Time spent. "est." until the user sets it; clicking opens the edit panel. */
export function StayChip({ stay, onClick }: { stay: Stop['stay']; onClick: () => void }) {
  const set = stay.source === 'user';
  return (
    <button type="button" onClick={onClick} className={cx(ui.chip, ui.outline, ui.chipButton, set && ui.outlineSet)}>
      {formatDuration(stay.minutes)}
      {!set && ' · est.'}
    </button>
  );
}
