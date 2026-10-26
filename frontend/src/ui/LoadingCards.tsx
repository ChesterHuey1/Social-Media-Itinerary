import s from './LoadingCards.module.css';

/** While the trip loads: three gray cards the size of stop cards, no spinner (spec, "Loading a day"). */
export function LoadingCards() {
  return (
    <div className={s.page} role="status" aria-label="Loading your trip">
      {[0, 1, 2].map((i) => (
        <div key={i} className={s.card}>
          <div className={s.line} />
          <div className={s.lineShort} />
        </div>
      ))}
    </div>
  );
}
