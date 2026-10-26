import type { ButtonHTMLAttributes, Ref } from 'react';
import { formatRange, formatUsd } from '../../domain/format';
import { hoursText } from '../../domain/hours';
import { stopProblemText, type TimelineStop } from '../../domain/timeline';
import type { Place } from '../../domain/types';
import { Button } from '../../ui/Button';
import { BookAheadChip, ObjectiveChip, StayChip } from '../../ui/Chip';
import { cx } from '../../ui/cx';
import { Icon, type IconName } from '../../ui/Icon';
import s from './DayView.module.css';
import { stopColorValue } from './stopColors';

type StopCardProps = {
  item: TimelineStop;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  dragHandle: ButtonHTMLAttributes<HTMLButtonElement> & { ref: Ref<HTMLButtonElement> };
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveLater: () => void;
  onToggleLock: () => void;
  onMoveToBacklog: () => void;
};

function costText(place: Place): string | null {
  if (!place.cost) return null;
  const approx = place.cost.source === 'deepseek' ? '~' : '';
  return `${approx}${formatUsd(place.cost.usd)} ${place.cost.per === 'person' ? 'per person' : 'ticket'}`;
}

type IconActionProps = {
  icon: IconName;
  label: string;
  onClick: () => void;
  on?: boolean;
  accent?: boolean;
  disabled?: boolean;
};

function IconAction({ icon, label, onClick, on, accent, disabled }: IconActionProps) {
  return (
    <button
      type="button"
      className={cx(s.iconButton, on && s.iconButtonOn, accent && s.iconButtonAccent)}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

export function StopCard(props: StopCardProps) {
  const { item, number, isFirst, isLast, dragHandle, onEdit, onMoveUp, onMoveDown, onMoveLater, onToggleLock, onMoveToBacklog } = props;
  const { stop, place, arriveMin, leaveMin, problem } = item;
  const name = stop.title ?? place.name;
  const locked = stop.lockedAtMin !== null;
  const cost = costText(place);

  return (
    // The view-transition name lets the card glide to its new spot after Optimize route.
    <article className={cx(s.card, s.stop)} style={{ viewTransitionName: `stop-${stop.id}` }}>
      <div className={s.stopHead}>
        <button type="button" className={s.handle} {...dragHandle} aria-label={`Drag to reorder ${name}`}>
          <Icon name="grip" />
        </button>
        <span className={s.badge} style={{ background: stopColorValue[stop.color] }}>
          {number}
        </span>
        <div className={s.stopTitle}>
          <h3 className={s.stopName}>{name}</h3>
          <span className={s.range}>
            {locked && <Icon name="lock" label="Locked" />}
            {formatRange(arriveMin, leaveMin)}
          </span>
        </div>
        <span className={s.iconActions}>
          <IconAction icon="chevronUp" label="Move up" onClick={onMoveUp} disabled={isFirst} />
          <IconAction icon="chevronDown" label="Move down" onClick={onMoveDown} disabled={isLast} />
          <IconAction icon="pencil" label="Edit stop" onClick={onEdit} />
          <IconAction icon={locked ? 'lock' : 'unlock'} label={locked ? 'Unlock time' : 'Lock time'} on={locked} onClick={onToggleLock} />
          <IconAction icon="backlog" label="Move to backlog" accent onClick={onMoveToBacklog} />
        </span>
      </div>

      <div className={s.stopBody}>
        {problem && (
          <div className={s.alert} role="alert">
            <span>{stopProblemText(problem, arriveMin)}</span>
            {problem.kind === 'lock' ? (
              <Button onClick={onToggleLock}>Unlock time</Button>
            ) : (
              <Button onClick={onMoveLater} disabled={isLast}>
                Move later
              </Button>
            )}
          </div>
        )}
        <div className={s.chips}>
          {place.needsBooking && <BookAheadChip />}
          {stop.objectives.map((o) => (
            <ObjectiveChip key={o} objective={o} />
          ))}
          <StayChip stay={stop.stay} onClick={onEdit} />
        </div>
        {place.tip && <p>{place.tip.text}</p>}
        <dl className={s.details}>
          <div>
            <dt>Hours</dt>
            <dd>{hoursText(place.hours)}</dd>
          </div>
          {cost && (
            <div>
              <dt>Cost</dt>
              <dd>{cost}</dd>
            </div>
          )}
        </dl>
        {stop.comments.map((c) => (
          <p key={c.id} className={s.comment}>
            <span className={s.commentWho}>You</span>
            {c.body}
          </p>
        ))}
      </div>
    </article>
  );
}
