import { useState } from 'react';
import { parseTimeInput, toTimeInput } from '../../domain/format';
import { defaultStayMinutes, type TimelineStop } from '../../domain/timeline';
import type { StopChanges } from '../../domain/tripEdits';
import type { Objective, StopColor } from '../../domain/types';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/cx';
import { SmallLabel, TextArea, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { OBJECTIVES, objectiveClass } from '../../ui/objectives';
import ui from '../../ui/ui.module.css';
import s from './DayView.module.css';
import { STOP_COLORS } from './stopColors';

type EditStopPanelProps = {
  dayNumber: number;
  item: TimelineStop;
  index: number;
  stopCount: number;
  onClose: () => void;
};

export function EditStopPanel({ dayNumber, item, index, stopCount, onClose }: EditStopPanelProps) {
  const { edit } = useTrip();
  const { stop, place } = item;

  const [title, setTitle] = useState(stop.title ?? place.name);
  const [color, setColor] = useState<StopColor>(stop.color);
  const [hours, setHours] = useState(String(Math.floor(stop.stay.minutes / 60)));
  const [minutes, setMinutes] = useState(String(stop.stay.minutes % 60));
  const [objectives, setObjectives] = useState<Objective[]>(stop.objectives);
  const [locked, setLocked] = useState(stop.lockedAtMin !== null);
  const [lockTime, setLockTime] = useState(toTimeInput(stop.lockedAtMin ?? item.arriveMin));
  const [comment, setComment] = useState('');

  const toggleObjective = (id: Objective) =>
    setObjectives((current) => (current.includes(id) ? current.filter((o) => o !== id) : [...current, id]));

  const typedMinutes = Number(hours) * 60 + Number(minutes);
  const stayEdited = Number.isFinite(typedMinutes) && typedMinutes > 0 && typedMinutes !== stop.stay.minutes;
  const lockedAtMin = locked ? parseTimeInput(lockTime) : null;

  const save = () => {
    const trimmed = title.trim();
    const objectivesChanged = objectives.join() !== stop.objectives.join();
    const changes: StopChanges = {
      title: trimmed === '' || trimmed === place.name ? null : trimmed,
      color,
      objectives,
      lockedAtMin,
    };
    if (stayEdited) changes.stay = { minutes: typedMinutes, source: 'user' };
    // A user's number always wins; only an estimate follows the objectives.
    else if (objectivesChanged && stop.stay.source === 'estimate')
      changes.stay = { minutes: defaultStayMinutes(objectives), source: 'estimate' };

    edit({ type: 'updateStop', dayNumber, stopId: stop.id, changes });
    edit({
      type: 'addComment',
      dayNumber,
      stopId: stop.id,
      commentId: crypto.randomUUID(),
      body: comment,
      createdAt: new Date().toISOString().slice(0, 10),
    });
    onClose();
  };

  const move = (toIndex: number) => edit({ type: 'moveStop', dayNumber, fromIndex: index, toIndex });

  return (
    <aside
      className={s.panel}
      aria-label="Edit stop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <form
        className={s.panelForm}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className={s.panelBody}>
          <div className={s.panelHead}>
            <div className={s.titleBlock}>
              <SmallLabel>
                Day {dayNumber} · Stop {index + 1}
              </SmallLabel>
              <h2 className={s.panelTitle}>Edit stop</h2>
            </div>
            <button type="button" className={s.iconButton} aria-label="Close panel" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </div>

          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <fieldset className={s.fieldset}>
            <legend className={s.legendText}>Color</legend>
            <div className={s.swatches}>
              {STOP_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={color === c.id}
                  className={cx(s.swatch, color === c.id && s.swatchOn)}
                  style={{ background: c.value }}
                  onClick={() => setColor(c.id)}
                >
                  {color === c.id && <Icon name="check" />}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={s.fieldset}>
            <legend className={s.legendText}>Time spent</legend>
            <div className={s.inline}>
              <TextField
                label="Hours"
                type="number"
                min={0}
                time
                className={s.numberField}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
              <TextField
                label="Minutes"
                type="number"
                min={0}
                max={55}
                step={5}
                time
                className={s.numberField}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className={s.fieldset}>
            <legend className={s.legendText}>Objectives</legend>
            <div className={s.chips}>
              {OBJECTIVES.map((o) => {
                const on = objectives.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    aria-pressed={on}
                    className={cx(ui.chip, ui.chipLarge, on ? objectiveClass[o.id] : ui.toggleOff)}
                    onClick={() => toggleObjective(o.id)}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className={s.fieldset}>
            <label className={s.checkRow}>
              <input type="checkbox" className={s.checkbox} checked={locked} onChange={(e) => setLocked(e.target.checked)} />
              Lock arrival time
            </label>
            <TextField
              label="Arrival time"
              type="time"
              time
              disabled={!locked}
              derived={!locked}
              value={lockTime}
              onChange={(e) => setLockTime(e.target.value)}
            />
          </div>

          <fieldset className={s.fieldset}>
            <legend className={s.legendText}>Order</legend>
            <div className={s.actions}>
              <Button icon="chevronUp" disabled={index === 0} onClick={() => move(index - 1)}>
                Move up
              </Button>
              <Button icon="chevronDown" disabled={index === stopCount - 1} onClick={() => move(index + 1)}>
                Move down
              </Button>
            </div>
          </fieldset>

          <div className={s.divider} />

          <div className={s.fieldset}>
            <span className={s.legendText}>Comments</span>
            {stop.comments.map((c) => (
              <div key={c.id} className={s.comment}>
                <span className={s.commentMeta}>You</span>
                <span>{c.body}</span>
              </div>
            ))}
            <TextArea label="Add a comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>

        <div className={s.panelFoot}>
          <Button
            variant="textAccent"
            onClick={() => {
              edit({ type: 'moveToBacklog', dayNumber, stopId: stop.id });
              onClose();
            }}
          >
            Move to backlog
          </Button>
          <div className={s.panelFootRight}>
            <Button variant="text" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={locked && lockedAtMin === null}>
              Save changes
            </Button>
          </div>
        </div>
      </form>
    </aside>
  );
}
