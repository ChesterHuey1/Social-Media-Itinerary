import { planChanges, spotText } from '../../domain/planChanges';
import type { Trip } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import s from './TripSetup.module.css';

/** What Rebuild would change: each place that would join a day, move days, go to the backlog, or leave the trip. */
export function RebuildPreview({ before, after }: { before: Trip; after: Trip }) {
  const changes = planChanges(before, after);
  return (
    <section className={s.section} aria-labelledby="rebuild-title">
      <div className={s.previewHead}>
        <h2 id="rebuild-title" className={s.sectionTitle}>
          {changes.length === 0 ? 'Rebuilding changes nothing' : `Rebuilding changes ${changes.length} ${changes.length === 1 ? 'place' : 'places'}`}
        </h2>
        <p className={s.muted}>Stops already on a day stay there. Locked stops don't move.</p>
      </div>
      {changes.length > 0 && (
        <ul className={s.changeList}>
          {changes.map((c) => (
            <li key={c.placeId} className={s.changeRow}>
              <span className={s.strong}>{after.places[c.placeId]?.name ?? before.places[c.placeId].name}</span>
              <span className={s.changeMove}>
                {spotText(c.from)}
                <Icon name="arrowRight" />
                {spotText(c.to)}
              </span>
              {c.reason && <span className={s.small}>{c.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
