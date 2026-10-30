import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { ClassShield } from '../components/cardIcons';
import { DECK_SIZE, RARITY_LABEL, RARITY_ORDER, Rarity, STARTER_DECK, cardPower, getCard, ownedActiveIds } from '../game/cards';
import { CLASSES, CLASS_INFO, CardClass } from '../game/effects';
import { SaveData, isValidDeck } from '../game/storage';
import { Header } from './Header';
import { ConfirmButton } from '../components/ConfirmButton';
import { RuneBadge } from '../components/RuneBadge';
import { findRune } from '../game/runes';
import { RuneChoiceProps, RunePicker } from './Runes';

interface Props {
  save: SaveData;
  onSave: (deck: string[]) => void;
  /** Rune choice (null = runes not released for this player). */
  runes?: RuneChoiceProps | null;
  onBack: () => void;
}

type Sort = 'rarity' | 'power' | 'name';
const SORT_LABEL: Record<Sort, string> = { rarity: 'Seltenheit', power: 'Stärke', name: 'Name' };

export function DeckEditor({ save, onSave, onBack, runes = null }: Props) {
  const [deck, setDeck] = useState<string[]>(save.deck);
  const [tab, setTab] = useState<'cards' | 'rune'>('cards');
  const [cls, setCls] = useState<CardClass | null>(null);
  const [sort, setSort] = useState<Sort>('rarity');
  const rune = runes ? findRune(runes.equipped) : null;
  const [message, setMessage] = useState('');
  const owned = useMemo(() => ownedActiveIds(save.unlocked), [save.unlocked]);
  const byStrength = useMemo(
    () => [...owned].sort((a, b) => {
      const ca = getCard(a), cb = getCard(b);
      return RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || cardPower(cb) - cardPower(ca) || a.localeCompare(b);
    }),
    [owned],
  );
  const shown = useMemo(() => {
    const list = owned.filter((id) => !cls || getCard(id).cls === cls);
    return list.sort((a, b) => {
      const ca = getCard(a), cb = getCard(b);
      if (sort === 'name') return ca.name.localeCompare(cb.name, 'de');
      if (sort === 'power') return cardPower(cb) - cardPower(ca) || RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || a.localeCompare(b);
      return RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || cardPower(cb) - cardPower(ca) || a.localeCompare(b);
    });
  }, [owned, cls, sort]);
  const selected = new Set(deck);
  const valid = isValidDeck(deck, save.unlocked);
  const dirty = deck.length !== save.deck.length || deck.some((id) => !save.deck.includes(id));
  const avg = deck.length ? deck.reduce((n, id) => n + cardPower(getCard(id)), 0) / deck.length : 0;
  const classCount = (c: CardClass) => deck.filter((id) => getCard(id).cls === c).length;
  const rarityCount = (r: Rarity) => deck.filter((id) => getCard(id).rarity === r).length;
  const classesOwned = CLASSES.filter((c) => owned.some((id) => getCard(id).cls === c));

  function toggle(id: string) {
    setMessage('');
    if (selected.has(id)) setDeck(deck.filter((d) => d !== id));
    else if (deck.length < DECK_SIZE) setDeck([...deck, id]);
    else setMessage(`Dein Deck ist voll (${DECK_SIZE}). Tippe oben eine Karte an, um sie herauszunehmen.`);
  }

  return (
    <main className="screen deck-screen">
      <Header title="Deck" onBack={onBack} backButton={<ConfirmButton label="◀ Zurück" ariaLabel="Zurück" confirmLabel="Verwerfen?" onConfirm={onBack} skipConfirm={!dirty} />} right={<span className={`pill ${valid ? 'ok' : 'warn'}`}>{deck.length}/{DECK_SIZE}</span>} />
      {runes && (
        <div className="segmented deck-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'cards'} className={`seg ${tab === 'cards' ? 'active' : ''}`} onClick={() => setTab('cards')}>🃏 Karten {deck.length}/{DECK_SIZE}</button>
          <button type="button" role="tab" aria-selected={tab === 'rune'} className={`seg ${tab === 'rune' ? 'active' : ''}`} onClick={() => setTab('rune')}>
            {rune ? <RuneBadge rune={rune} className="small" /> : 'ᚱ'} Rune{rune ? '' : ': keine'}
          </button>
        </div>
      )}
      {tab === 'rune' && runes ? (
        <div className="scroll"><RunePicker {...runes} /></div>
      ) : (
        <>
          <section className="deck-tray" aria-label="Dein Deck">
            <div className="deck-tray-head">
              <b>Dein Deck</b>
              <span className={`deck-count ${deck.length === DECK_SIZE ? 'full' : ''}`}>{deck.length}/{DECK_SIZE}</span>
              {deck.length > 0 && <span className="muted small">Ø Stärke {avg.toFixed(1).replace('.', ',')}</span>}
            </div>
            <div className="deck-strip">
              {deck.map((id) => (
                <button key={id} type="button" className="deck-slot filled" onClick={() => toggle(id)} aria-label={`${getCard(id).name} aus dem Deck nehmen`}>
                  <Card id={id} size="xs" />
                </button>
              ))}
              {Array.from({ length: Math.max(0, DECK_SIZE - deck.length) }, (_, i) => <span key={`e${i}`} className="deck-slot empty" aria-hidden="true" />)}
            </div>
            <div className="deck-stats">
              {CLASSES.map((c) => classCount(c) > 0 && (
                <span key={c} className="deck-stat" title={CLASS_INFO[c].label}><span className="deck-stat-icon"><ClassShield cls={c} /></span>{classCount(c)}</span>
              ))}
              <span className="deck-stat-sep" />
              {(['mythic', 'legendary', 'epic', 'rare'] as Rarity[]).map((r) => rarityCount(r) > 0 && (
                <span key={r} className={`rarity-text rarity-${r} deck-stat`}>{rarityCount(r)} {RARITY_LABEL[r]}</span>
              ))}
            </div>
            <div className="deck-quick">
              <button type="button" className="btn btn-small" onClick={() => setDeck([...STARTER_DECK])}>Starterdeck</button>
              <button type="button" className="btn btn-small" onClick={() => setDeck(byStrength.slice(0, DECK_SIZE))}>Stärkste {DECK_SIZE}</button>
              <button type="button" className="btn btn-small" disabled={deck.length === 0} onClick={() => setDeck([])}>Leeren</button>
            </div>
          </section>
          <div className="deck-filter">
            <div className="chips" role="group" aria-label="Nach Klasse filtern">
              <button type="button" className={`chip ${cls === null ? 'active' : ''}`} onClick={() => setCls(null)}>Alle</button>
              {classesOwned.map((c) => (
                <button key={c} type="button" className={`chip chip-icon ${cls === c ? 'active' : ''}`} onClick={() => setCls(cls === c ? null : c)} aria-label={CLASS_INFO[c].label} aria-pressed={cls === c}>
                  <span className="deck-stat-icon"><ClassShield cls={c} /></span>
                </button>
              ))}
            </div>
            <label className="deck-sort">
              <span className="sr-only">Sortieren</span>
              <select className="admin-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>↕ {SORT_LABEL[s]}</option>)}
              </select>
            </label>
          </div>
          <p className="hint" aria-live="polite">{message || (deck.length < DECK_SIZE ? `Tippe Karten an – noch ${DECK_SIZE - deck.length} bis zum vollen Deck.` : 'Dein Deck ist voll. Tippe eine Karte an, um sie zu tauschen.')}</p>
          <div className="scroll">
            <div className="card-grid deck-grid">
              {shown.map((id) => (
                <div key={id} className={`grid-item ${selected.has(id) ? 'picked' : ''}`}>
                  <Card id={id} size="md" showName onClick={() => toggle(id)} ariaLabel={`${getCard(id).name}${selected.has(id) ? ", im Deck" : ""}`} />
                  {selected.has(id) && <span className="in-deck-tag" aria-hidden="true">✓ Im Deck</span>}
                </div>
              ))}
              {shown.length === 0 && <p className="muted center">Keine Karten dieser Klasse in deiner Sammlung.</p>}
            </div>
          </div>
        </>
      )}
      <footer className="bottombar">
        <button
          type="button"
          className="btn btn-primary btn-wide"
          disabled={!valid || !dirty}
          onClick={() => { onSave(deck); setMessage('Deck gespeichert ✓'); }}
        >
          {valid ? (dirty ? 'Deck speichern' : 'Gespeichert ✓') : `Noch ${DECK_SIZE - deck.length} Karte(n) wählen`}
        </button>
      </footer>
    </main>
  );
}
