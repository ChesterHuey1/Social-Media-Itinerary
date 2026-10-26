import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { formatClock, formatDistance, formatDuration, formatUsd } from '../../domain/format';
import { backlogOpenAt, openTimeAtEnd } from '../../domain/schedule';
import type { Timeline, TimelineStop } from '../../domain/timeline';
import { stayForDay } from '../../domain/trip';
import type { Day, FixedRow, LatLng, Leg } from '../../domain/types';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/Icon';
import s from './DayView.module.css';
import { StopCard } from './StopCard';

type StopListProps = {
  day: Day;
  timeline: Timeline;
  onEditStop: (stopId: string) => void;
};

export function StopList({ day, timeline, onEditStop }: StopListProps) {
  const { trip, edit } = useTrip();
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const gap = openTimeAtEnd(day, timeline);
  const last = timeline.stops.at(-1);
  const ids = timeline.stops.map((t) => t.stop.id);

  const moveStop = (fromIndex: number, toIndex: number) => edit({ type: 'moveStop', dayNumber: day.number, fromIndex, toIndex });

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false);    if (!over || active.id === over.id) return;
    moveStop(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  return (
    <ol className={cx(s.list, dragging && s.dragging)} aria-label={`Stops for Day ${day.number}`}>
      {day.startRows.map((row, i) => (
        <FixedRowItem key={`start-${i}`} row={row} />
      ))}

      {timeline.stops.length === 0 && (
        <EmptyDay dayNumber={day.number} near={stayForDay(trip, day).location} fromMin={day.startMin} />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragging(false)}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {timeline.stops.map((item, i) => (
            <SortableStop
              key={item.stop.id}
              item={item}
              number={i + 1}
              isLast={i === timeline.stops.length - 1}
              onEdit={() => onEditStop(item.stop.id)}
              onMoveLater={() => moveStop(i, i + 1)}
              onToggleLock={() =>
                edit({
                  type: 'updateStop',
                  dayNumber: day.number,
                  stopId: item.stop.id,
                  changes: { lockedAtMin: item.stop.lockedAtMin === null ? item.arriveMin : null },
                })
              }
              onMoveToBacklog={() => edit({ type: 'moveToBacklog', dayNumber: day.number, stopId: item.stop.id })}
            />
          ))}
        </SortableContext>
      </DndContext>

      {gap && last && (
        <li className={s.row}>
          <div className={s.time}>{formatClock(gap.fromMin)}</div>
          <OpenTimeBlock dayNumber={day.number} fromMin={gap.fromMin} toMin={gap.toMin} near={last.place.location} area={last.place.area} />
        </li>
      )}

      {timeline.returnLeg && (
        <li>
          <LegItem leg={timeline.returnLeg} />
        </li>
      )}

      {timeline.overrunMin > 0 && (
        <li className={cx(s.alert, s.dayAlert)} role="alert">
          <Icon name="clock" />
          <span>
            Back at {formatClock(timeline.backAtMin)}, {formatDuration(timeline.overrunMin)} after your {formatClock(day.endMin)} end.
          </span>
        </li>
      )}

      {day.endRows.map((row, i) => (
        <FixedRowItem key={`end-${i}`} row={row} />
      ))}
    </ol>
  );
}

type SortableStopProps = {
  item: TimelineStop;
  number: number;
  isLast: boolean;
  onEdit: () => void;
  onMoveLater: () => void;
  onToggleLock: () => void;
  onMoveToBacklog: () => void;
};

function SortableStop({ item, number, ...actions }: SortableStopProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.stop.id,
    transition: { duration: 200, easing: 'ease-out' },
  });

  return (
    <li
      ref={setNodeRef}
      className={cx(s.sortable, isDragging && s.lifted)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <LegItem leg={item.legBefore} />
      <div className={s.row}>
        <div className={s.time}>{formatClock(item.arriveMin)}</div>
        <StopCard
          item={item}
          number={number}
          dragHandle={{ ref: setActivatorNodeRef, ...attributes, ...listeners }}
          {...actions}
        />
      </div>
    </li>
  );
}

function FixedRowItem({ row }: { row: FixedRow }) {
  return (
    <li className={cx(s.row, s.rowCenter)}>
      <div className={s.time}>{formatClock(row.atMin)}</div>
      <div className={s.fixedRow}>
        <span className={s.hBadge}>{row.kind === 'hotel' ? 'H' : <Icon name="plane" label="Flight" />}</span>
        <span className={s.ellipsis}>{row.text}</span>
      </div>
    </li>
  );
}

/** "12 min · 900 m", or "25 min · Yurikamome Line · $2.10". A ~ marks a straight-line estimate. */
function LegItem({ leg }: { leg: Leg }) {
  const parts = [
    `${leg.source === 'estimate' ? '~' : ''}${leg.minutes} min`,
    leg.mode === 'transit' && leg.line ? leg.line : formatDistance(leg.distanceM),
  ];
  if (leg.fareUsd !== null) parts.push(formatUsd(leg.fareUsd, true));
  return (
    <div className={s.leg}>
      <Icon name={leg.mode === 'walk' ? 'walk' : 'train'} label={leg.mode === 'walk' ? 'Walk' : 'Transit'} />
      {parts.join(' · ')}
    </div>
  );
}

type PickerProps = { dayNumber: number; near: LatLng; fromMin: number };

/** Backlog places near the gap that are open then, each with an Add button. */
function BacklogPicker({ dayNumber, near, fromMin }: PickerProps) {
  const { trip, edit } = useTrip();
  const candidates = backlogOpenAt(trip, near, fromMin);
  if (candidates.length === 0) return <span className={s.small}>No backlog places nearby are open then.</span>;
  return (
    <ul className={s.picker}>
      {candidates.map((place) => (
        <li key={place.id} className={s.pickerRow}>
          <span>
            <span className={s.strong}>{place.name}</span> <span className={s.small}>{place.area}</span>
          </span>
          <Button
            variant="text"
            icon="plus"
            onClick={() => edit({ type: 'addFromBacklog', dayNumber, placeId: place.id, stopId: crypto.randomUUID() })}
          >
            Add
          </Button>
        </li>
      ))}
    </ul>
  );
}

type OpenTimeProps = PickerProps & { toMin: number; area: string };

function OpenTimeBlock({ dayNumber, fromMin, toMin, near, area }: OpenTimeProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.openTime}>
      <div>
        <span>
          <span className={s.strong}>{formatDuration(toMin - fromMin)} free</span> until {formatClock(toMin)} near {area}
        </span>
      </div>
      <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Close' : 'Fill from backlog'}
      </Button>
      {open && <BacklogPicker dayNumber={dayNumber} near={near} fromMin={fromMin} />}
    </div>
  );
}

function EmptyDay({ dayNumber, near, fromMin }: PickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <li className={s.empty}>
      <span className={s.emptyTitle}>No stops yet</span>
      <span className={s.small}>Add a place, or fill the day from your backlog.</span>
      <span className={s.actions}>
        <Button variant="primary" icon="plus">
          Add a place
        </Button>
        <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Fill from backlog
        </Button>
      </span>
      {open && <BacklogPicker dayNumber={dayNumber} near={near} fromMin={fromMin} />}
    </li>
  );
}
