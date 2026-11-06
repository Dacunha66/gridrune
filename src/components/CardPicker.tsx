// Choosing a fixed number of cards from a pool (raid: 8 from the collection, online duel: 8 from the deck) – with the
// same tools as the deck editor: the chosen cards in a tray (tap to take one out), "strongest" and "clear", a class
// filter and sorting.
import { useMemo, useState } from 'react';
import { Card } from './Card';
import { ClassShield } from './cardIcons';
import { RARITY_ORDER, cardPower, getCard } from '../game/cards';
import { CLASSES, CLASS_INFO, CardClass } from '../game/effects';

export type PickSort = 'rarity' | 'power' | 'name';
const SORT_LABEL: Record<PickSort, string> = { rarity: 'Seltenheit', power: 'Stärke', name: 'Name' };

export function sortCards(ids: readonly string[], sort: PickSort): string[] {
  return [...ids].sort((a, b) => {
    const ca = getCard(a), cb = getCard(b);
    if (sort === 'name') return ca.name.localeCompare(cb.name, 'de');
    if (sort === 'power') return cardPower(cb) - cardPower(ca) || RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || a.localeCompare(b);
    return RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || cardPower(cb) - cardPower(ca) || a.localeCompare(b);
  });
}

/** The `size` strongest cards of the pool (value sum, then rarity). */
export function strongestCards(pool: readonly string[], size: number): string[] {
  return sortCards(pool, 'power').slice(0, size);
}

interface Props {
  pool: readonly string[];
  picked: readonly string[];
  size: number;
  onChange: (picked: string[]) => void;
  /** Wording for the chosen cards, e.g. "Deine Hand". */
  label?: string;
  /** Put the card grid into its own scroll area (when the screen itself does not scroll). */
  ownScroll?: boolean;
}

export function CardPicker({ pool, picked, size, onChange, label = 'Deine Karten', ownScroll = false }: Props) {
  const [cls, setCls] = useState<CardClass | null>(null);
  const [sort, setSort] = useState<PickSort>('power');
  const [message, setMessage] = useState('');
  const chosen = new Set(picked);
  const shown = useMemo(() => sortCards(pool.filter((id) => !cls || getCard(id).cls === cls), sort), [pool, cls, sort]);
  const classes = CLASSES.filter((c) => pool.some((id) => getCard(id).cls === c));
  const classCount = (c: CardClass) => picked.filter((id) => getCard(id).cls === c).length;
  const avg = picked.length ? picked.reduce((n, id) => n + cardPower(getCard(id)), 0) / picked.length : 0;

  function toggle(id: string) {
    setMessage('');
    if (chosen.has(id)) onChange(picked.filter((p) => p !== id));
    else if (picked.length < size) onChange([...picked, id]);
    else setMessage(`Schon ${size} Karten gewählt. Tippe oben eine Karte an, um sie herauszunehmen.`);
  }

  const grid = (
    <div className="card-grid deck-grid">
      {shown.map((id) => (
        <div key={id} className={`grid-item ${chosen.has(id) ? 'picked' : ''}`}>
          <Card id={id} size="md" showName onClick={() => toggle(id)} ariaLabel={`${getCard(id).name}${chosen.has(id) ? ', gewählt' : ''}`} />
          {chosen.has(id) && <span className="in-deck-tag" aria-hidden="true">✓ Gewählt</span>}
        </div>
      ))}
      {shown.length === 0 && <p className="muted center">Keine Karten dieser Klasse.</p>}
    </div>
  );

  return (
    <>
      <section className="deck-tray" aria-label={label}>
        <div className="deck-tray-head">
          <b>{label}</b>
          <span className={`deck-count ${picked.length === size ? 'full' : ''}`}>{picked.length}/{size}</span>
          {picked.length > 0 && <span className="muted small">Ø Stärke {avg.toFixed(1).replace('.', ',')}</span>}
        </div>
        <div className="deck-strip picker-strip" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
          {picked.map((id) => (
            <button key={id} type="button" className="deck-slot filled" onClick={() => toggle(id)} aria-label={`${getCard(id).name} abwählen`}>
              <Card id={id} size="xs" />
            </button>
          ))}
          {Array.from({ length: Math.max(0, size - picked.length) }, (_, i) => <span key={`e${i}`} className="deck-slot empty" aria-hidden="true" />)}
        </div>
        <div className="deck-stats">
          {CLASSES.map((c) => classCount(c) > 0 && (
            <span key={c} className="deck-stat" title={CLASS_INFO[c].label}><span className="deck-stat-icon"><ClassShield cls={c} /></span>{classCount(c)}</span>
          ))}
        </div>
        <div className="deck-quick">
          <button type="button" className="btn btn-small" onClick={() => { setMessage(''); onChange(strongestCards(pool, size)); }}>Stärkste {size}</button>
          <button type="button" className="btn btn-small" disabled={picked.length === 0} onClick={() => { setMessage(''); onChange([]); }}>Alle abwählen</button>
        </div>
      </section>
      <div className="deck-filter">
        <div className="chips" role="group" aria-label="Nach Klasse filtern">
          <button type="button" className={`chip ${cls === null ? 'active' : ''}`} onClick={() => setCls(null)}>Alle</button>
          {classes.map((c) => (
            <button key={c} type="button" className={`chip chip-icon ${cls === c ? 'active' : ''}`} onClick={() => setCls(cls === c ? null : c)} aria-label={CLASS_INFO[c].label} aria-pressed={cls === c}>
              <span className="deck-stat-icon"><ClassShield cls={c} /></span>
            </button>
          ))}
        </div>
        <label className="deck-sort">
          <span className="sr-only">Sortieren</span>
          <select className="admin-input" value={sort} onChange={(e) => setSort(e.target.value as PickSort)}>
            {(Object.keys(SORT_LABEL) as PickSort[]).map((s) => <option key={s} value={s}>↕ {SORT_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      <p className="hint" aria-live="polite">{message || (picked.length < size ? `Tippe Karten an – noch ${size - picked.length}.` : `${size} Karten gewählt. Tippe eine Karte an, um sie zu tauschen.`)}</p>
      {ownScroll ? <div className="scroll">{grid}</div> : grid}
    </>
  );
}
