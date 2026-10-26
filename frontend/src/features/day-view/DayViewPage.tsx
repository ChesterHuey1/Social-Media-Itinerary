import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { daySummary } from '../../domain/schedule';
import { buildTimeline } from '../../domain/timeline';
import { stayForDay } from '../../domain/trip';
import { useTrip } from '../../state/tripContext';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/Icon';
import { Backlog } from './Backlog';
import { DayBreakdown, DayHeader } from './DayHeader';
import s from './DayView.module.css';
import { EditStopPanel } from './EditStopPanel';
import { MapPanel } from './MapPanel';
import { Sidebar } from './Sidebar';
import { StopList } from './StopList';

type ViewTab = 'list' | 'map' | 'budget';
const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
  { id: 'budget', label: 'Budget' },
];

export function DayViewPage() {
  const { dayNumber } = useParams();
  const { trip, saveError } = useTrip();
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>('list');
  const [mapOpen, setMapOpen] = useState(false);

  const day = trip.days.find((d) => String(d.number) === dayNumber);
  if (!day) return <Navigate to="/trip/day/1" replace />;

  const stay = stayForDay(trip, day);
  const timeline = buildTimeline(trip, day);
  const summary = daySummary(timeline);
  const unmatchedPosts = trip.savedPosts.filter((p) => p.status === 'needs_review').length;
  const editingIndex = timeline.stops.findIndex((t) => t.stop.id === editingStopId);

  return (
    <div className={s.page} data-tab={tab} data-map-open={mapOpen}>
      <Sidebar trip={trip} activeDay={day.number} />

      <div className={s.viewTabs} role="tablist" aria-label="View">
        {VIEW_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cx(s.viewTab, tab === t.id && s.viewTabActive)}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className={s.center}>
        {saveError && (
          <div className={s.banner} role="alert">
            <Icon name="alert" size={18} />
            <span>Your last change couldn't be saved. This is your trip as last saved.</span>
          </div>
        )}
        {unmatchedPosts > 0 && (
          <div className={s.banner} role="status">
            <Icon name="alert" size={18} />
            <span>
              {unmatchedPosts} {unmatchedPosts === 1 ? "post couldn't" : "posts couldn't"} be matched to a place.
            </span>
            <a href="#" className={s.bannerLink}>
              Name it
            </a>
          </div>
        )}
        <DayHeader day={day} stay={stay} summary={summary} onShowMap={() => setMapOpen(true)} />
        <StopList day={day} timeline={timeline} onEditStop={setEditingStopId} />
        {summary.stopCount > 0 && <DayBreakdown summary={summary} />}
        <Backlog dayNumber={day.number} />
      </main>

      <MapPanel day={day} stay={stay} timeline={timeline} onClose={() => setMapOpen(false)} />

      {editingIndex >= 0 && (
        <EditStopPanel
          key={timeline.stops[editingIndex].stop.id}
          dayNumber={day.number}
          item={timeline.stops[editingIndex]}
          index={editingIndex}
          stopCount={timeline.stops.length}
          onClose={() => setEditingStopId(null)}
        />
      )}
    </div>
  );
}
