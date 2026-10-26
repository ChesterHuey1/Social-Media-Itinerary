import { useState } from 'react';
import type { SavedPlace, Trip } from '../../domain/types';
import { Button } from '../../ui/Button';
import { ObjectiveChip } from '../../ui/Chip';
import { SmallLabel } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import ui from '../../ui/ui.module.css';
import s from './TripSetup.module.css';

const COLLAPSED_COUNT = 4;

type Group = { title: string; items: SavedPlace[] };

/** The trip's cities first, in stay order, then everything else. */
function groupByTripCity(trip: Trip): Group[] {
  const cities = [...new Set(trip.stays.map((st) => st.city))];
  const cityOf = (sp: SavedPlace) => trip.places[sp.placeId].city;
  const groups = cities.map((city) => ({ title: city, items: trip.savedPlaces.filter((sp) => cityOf(sp) === city) }));
  const other = trip.savedPlaces.filter((sp) => !cities.includes(cityOf(sp)));
  return other.length > 0 ? [...groups, { title: 'Other cities', items: other }] : groups;
}

type SavedPlacesProps = {
  trip: Trip;
  included: Set<string>;
  onToggle: (placeId: string) => void;
};

export function SavedPlacesSection({ trip, included, onToggle }: SavedPlacesProps) {
  const unmatched = trip.savedPosts.filter((p) => p.status === 'needs_review').length;
  const cities = [...new Set(trip.stays.map((st) => st.city))];

  return (
    <section className={s.section} aria-labelledby="step-4">
      <div className={s.sectionHead}>
        <SmallLabel>Step 4</SmallLabel>
        <h2 id="step-4" className={s.sectionTitle}>
          Saved places
        </h2>
        <p className={s.muted}>Places in {cities.join(' and ')} come first. Check the ones to plan around.</p>
      </div>

      <div className={ui.field}>
        <label htmlFor="place-search" className={ui.fieldLabel}>
          Add a place
        </label>
        <div className={s.searchWrap}>
          <Icon name="search" />
          <input id="place-search" className={`${ui.input} ${s.searchInput}`} placeholder="Search Google Maps" />
        </div>
      </div>

      {unmatched > 0 && (
        <div className={s.banner} role="status">
          <span>
            {unmatched} {unmatched === 1 ? "post couldn't" : "posts couldn't"} be matched to a place.
          </span>
          <a href="#" className={s.link}>
            Name it
          </a>
        </div>
      )}

      {groupByTripCity(trip).map((group) => (
        <PlaceGroup key={group.title} trip={trip} group={group} included={included} onToggle={onToggle} />
      ))}
    </section>
  );
}

type PlaceGroupProps = { trip: Trip; group: Group; included: Set<string>; onToggle: (placeId: string) => void };

function PlaceGroup({ trip, group, included, onToggle }: PlaceGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.items : group.items.slice(0, COLLAPSED_COUNT);
  const checked = group.items.filter((sp) => included.has(sp.placeId)).length;

  return (
    <div className={s.stack}>
      <div className={s.groupHead}>
        <SmallLabel>
          {group.title} · {group.items.length} saved
        </SmallLabel>
        <SmallLabel>{checked} checked</SmallLabel>
      </div>
      {visible.map((sp) => {
        const place = trip.places[sp.placeId];
        const source = sp.from === 'search' ? 'Added by search' : sp.reelCount > 1 ? `From ${sp.reelCount} Reels` : 'From a Reel';
        const hours = place.hours.kind === 'unconfirmed' ? ' · Hours not confirmed' : '';
        return (
          <label key={sp.placeId} className={s.placeRow}>
            <input
              type="checkbox"
              className={s.checkbox}
              checked={included.has(sp.placeId)}
              onChange={() => onToggle(sp.placeId)}
            />
            <span className={s.placeText}>
              <span className={s.placeName}>{place.name}</span>
              <span className={s.placeMeta}>
                {source} · {place.area}, {place.city}
                {hours}
              </span>
            </span>
            <span className={s.chips}>
              {place.objectives.map((o) => (
                <ObjectiveChip key={o} objective={o} />
              ))}
            </span>
          </label>
        );
      })}
      {group.items.length > COLLAPSED_COUNT && (
        <Button variant="text" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `Show all ${group.items.length}`}
        </Button>
      )}
    </div>
  );
}
