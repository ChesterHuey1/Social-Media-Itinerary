import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { daySummary } from '../../domain/schedule';
import { buildTimeline } from '../../domain/timeline';
import { stayForDay } from '../../domain/trip';
import type { BuiltState } from '../../state/api';
import { useTrip } from '../../state/tripContext';
import { cx } from '../../ui/cx';
import { Icon } from '../../ui/Icon';
import { Backlog } from './Backlog';
import { NewSaves } from './NewSaves';
import { DayBreakdown, DayHeader } from './DayHeader';
import s from './DayView.module.css';
import { EditStopPanel } from './EditStopPanel';
import { MapPanel } from './MapPanel';
import { OptimizeToast, type ToastState } from './OptimizeToast';
import { Sidebar } from './Sidebar';
import { StopList } from './StopList';

/** How long Undo stays available after Optimize route. */
const UNDO_MS = 10_000;
/** A build result older than this (for example after a page refresh) no longer offers Undo. */
const BUILT_FRESH_MS = 60_000;

type ViewTab = 'list' | 'map' | 'budget';
const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
  { id: 'budget', label: 'Budget' },
];

export function DayViewPage() {
  const { dayNumber } = useParams();
  const { trip, edit, optimize, saveError } = useTrip();
  const location = useLocation();
  const navigate = useNavigate();
  const [optimizing, setOptimizing] = useState(false);
  // After Build itinerary, Trip setup sends the result here; it becomes the first toast, with Undo.
  const [toast, setToast] = useState<ToastState | null>(() => {
    const built = (location.state as { built?: BuiltState } | null)?.built;
    if (!built || Date.now() - built.at > BUILT_FRESH_MS) return null;
    const parts = [`Built your trip: ${built.placed} ${built.placed === 1 ? 'stop' : 'stops'} across ${trip.days.length} days.`];
    if (built.backlogged > 0) parts.push(`${built.backlogged} in the backlog.`);
    return {
      message: parts.join(' '),
      onUndo: () => {
        edit({ type: 'restorePlan', days: built.previous.days, backlog: built.previous.backlog });
        forgetBuilt();
        setToast({ message: 'Back to your plan from before.', onUndo: null });
      },
    };
  });
  const toastTimer = useRef<number | undefined>(undefined);
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

  // Drops the build result from history, so a refresh never offers a stale Undo.
  function forgetBuilt() {
    if ((location.state as { built?: BuiltState } | null)?.built) navigate(location.pathname, { replace: true, state: null });
  }

  const showToast = (next: ToastState | null) => {
    forgetBuilt();
    window.clearTimeout(toastTimer.current);
    setToast(next);
    if (next) toastTimer.current = window.setTimeout(() => setToast(null), UNDO_MS);
  };

  const runOptimize = async () => {
    setOptimizing(true);
    try {
      const result = await optimize(day.number);
      const moved = result.dropped.length;
      const dayNumber = day.number;
      showToast({
        message: moved === 0 ? 'Optimized. Every stop is open when you arrive.' : `Optimized. ${moved} ${moved === 1 ? 'stop' : 'stops'} moved to the backlog.`,
        onUndo: () => {
          edit({ type: 'replaceDayStops', dayNumber, stops: result.previousStops }, true);
          showToast({ message: 'Back to your order.', onUndo: null });
        },
      });
    } catch {
      showToast({ message: "Couldn't optimize this day. Try again.", onUndo: null });
    } finally {
      setOptimizing(false);
    }
  };

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
        <DayHeader
          day={day}
          stay={stay}
          summary={summary}
          optimizing={optimizing}
          onOptimize={runOptimize}
          onShowMap={() => setMapOpen(true)}
        />
        <StopList day={day} timeline={timeline} onEditStop={setEditingStopId} />
        {summary.stopCount > 0 && <DayBreakdown summary={summary} />}
        <NewSaves />
        <Backlog dayNumber={day.number} />
      </main>

      <MapPanel day={day} stay={stay} timeline={timeline} onClose={() => setMapOpen(false)} />

      {toast && <OptimizeToast toast={toast} onClose={() => showToast(null)} />}

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
