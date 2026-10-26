import type { ReactNode } from 'react';
import { googleMapsDirectionsUrl } from '../../domain/geo';
import type { Timeline } from '../../domain/timeline';
import { nearbyBacklog } from '../../domain/schedule';
import type { Day, Stay } from '../../domain/types';
import { useTrip } from '../../state/tripContext';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import s from './DayView.module.css';
import { layoutPoints, type MapBox } from './mapLayout';
import { stopColorValue } from './stopColors';

const BOX: MapBox = { width: 500, height: 900, padTop: 220, padRight: 48, padBottom: 160, padLeft: 48 };
const PIN_GAP = 38;

type MapPanelProps = {
  day: Day;
  stay: Stay;
  timeline: Timeline;
  onClose: () => void;
};

export function MapPanel({ day, stay, timeline, onClose }: MapPanelProps) {
  const { trip } = useTrip();
  const stopPlaces = timeline.stops.map((t) => t.place);
  const backlog = nearbyBacklog(trip, day);
  const [hotel, ...rest] = layoutPoints(
    [stay.location, ...stopPlaces.map((p) => p.location), ...backlog.map((p) => p.location)],
    BOX,
    PIN_GAP,
  );
  const stopPoints = rest.slice(0, stopPlaces.length);
  const backlogPoints = rest.slice(stopPlaces.length);
  const route = [hotel, ...stopPoints, hotel];

  const flagged = timeline.stops.filter((t) => t.problem).map((t) => t.stop.title ?? t.place.name);
  const mapsUrl =
    stopPlaces.length > 0
      ? googleMapsDirectionsUrl(stay.location, stopPlaces.map((p) => p.location), stay.location)
      : null;

  return (
    <section className={s.map} aria-label={`Map of Day ${day.number}`}>
      <svg className={s.mapSvg} viewBox={`0 0 ${BOX.width} ${BOX.height}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`${day.stops.length} stops starting and ending at ${stay.name}`}>
        {day.stops.length > 0 &&
          route.slice(0, -1).map((from, i) => {
            const to = route[i + 1];
            const leg = i < timeline.stops.length ? timeline.stops[i].legBefore : timeline.returnLeg;
            const isReturn = i === route.length - 2;
            const style = isReturn
              ? { stroke: 'var(--orange)', strokeWidth: 2, strokeDasharray: '1 6' }
              : leg?.mode === 'transit'
                ? { stroke: 'var(--orange)', strokeWidth: 4 }
                : { stroke: 'var(--ink)', strokeWidth: 3, strokeDasharray: '6 5' };
            return (
              <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} strokeLinecap="round" vectorEffect="non-scaling-stroke" {...style} />
            );
          })}

        {backlogPoints.map((p, i) => (
          <circle key={backlog[i].id} cx={p.x} cy={p.y} r={9} fill="var(--paper)" stroke="var(--ink)" strokeWidth={2}>
            <title>{`${backlog[i].name} (backlog)`}</title>
          </circle>
        ))}

        <g>
          <title>{stay.name}</title>
          <circle cx={hotel.x} cy={hotel.y} r={15} fill="var(--ink)" stroke="var(--paper)" strokeWidth={2} />
          <text x={hotel.x} y={hotel.y} textAnchor="middle" dominantBaseline="central" fill="var(--white)" fontSize={13} fontWeight={600}>
            H
          </text>
        </g>

        {stopPoints.map((p, i) => (
          <g key={day.stops[i].id}>
            <title>{`${i + 1}. ${day.stops[i].title ?? stopPlaces[i].name}`}</title>
            {timeline.stops[i].problem && <circle cx={p.x} cy={p.y} r={19} fill="none" stroke="var(--orange)" strokeWidth={2} />}
            <circle cx={p.x} cy={p.y} r={15} fill={stopColorValue[day.stops[i].color]} stroke="var(--paper)" strokeWidth={2} />
            <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fill="var(--white)" fontSize={13} fontWeight={600}>
              {i + 1}
            </text>
          </g>
        ))}
      </svg>

      <div className={s.legend}>
        <LegendRow label="Walk">
          <line x1="2" y1="4" x2="22" y2="4" stroke="var(--ink)" strokeWidth="3" strokeDasharray="5 4" strokeLinecap="round" />
        </LegendRow>
        <LegendRow label="Transit">
          <line x1="2" y1="4" x2="22" y2="4" stroke="var(--orange)" strokeWidth="4" strokeLinecap="round" />
        </LegendRow>
        <LegendRow label="Back to hotel">
          <line x1="2" y1="4" x2="22" y2="4" stroke="var(--orange)" strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />
        </LegendRow>
        <LegendRow label="Backlog nearby">
          <circle cx="12" cy="4" r="3.5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1.5" />
        </LegendRow>
      </div>

      <div className={s.mapControls}>
        <Button className={s.closeMap} icon="close" onClick={onClose}>
          Close map
        </Button>
        <div className={s.zoom}>
          <button type="button" className={s.zoomBtn} aria-label="Zoom in">
            <Icon name="plus" size={18} />
          </button>
          <span className={s.zoomDivider} />
          <button type="button" className={s.zoomBtn} aria-label="Zoom out">
            <Icon name="minus" size={18} />
          </button>
        </div>
      </div>

      {day.stops.length > 0 && (
        <div className={s.routeCheck}>
          {flagged.length === 0 ? (
            <span className={s.ok}>
              <Icon name="check" />
              Every stop fits its hours
            </span>
          ) : (
            <span className={s.warn}>
              <Icon name="alert" />
              {flagged.length} {flagged.length === 1 ? 'stop needs' : 'stops need'} attention: {flagged.join(', ')}
            </span>
          )}
          {mapsUrl && (
            <a className={`${s.bannerLink} ${s.mapsLink}`} href={mapsUrl} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
          )}
        </div>
      )}
    </section>
  );
}

function LegendRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className={s.legendRow}>
      <svg width="24" height="8" viewBox="0 0 24 8" aria-hidden="true" overflow="visible">
        {children}
      </svg>
      {label}
    </span>
  );
}
