import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { DECK_SIZE, RARITY_ORDER, STARTER_DECK, cardPower, getCard, ownedActiveIds } from '../game/cards';
import { SaveData, isValidDeck } from '../game/storage';
import { Header } from './Header';
import { ConfirmButton } from '../components/ConfirmButton';

interface Props {
  save: SaveData;
  onSave: (deck: string[]) => void;
  onBack: () => void;
}

export function DeckEditor({ save, onSave, onBack }: Props) {
  const [deck, setDeck] = useState<string[]>(save.deck);
  const [message, setMessage] = useState('');
  const sorted = useMemo(
    () => ownedActiveIds(save.unlocked).sort((a, b) => {
      const ca = getCard(a), cb = getCard(b);
      return RARITY_ORDER[cb.rarity] - RARITY_ORDER[ca.rarity] || cardPower(cb) - cardPower(ca) || a.localeCompare(b);
    }),
    [save.unlocked],
  );
  const selected = new Set(deck);
  const valid = isValidDeck(deck, save.unlocked);
  const dirty = deck.length !== save.deck.length || deck.some((id) => !save.deck.includes(id));

  function toggle(id: string) {
    setMessage('');
    if (selected.has(id)) setDeck(deck.filter((d) => d !== id));
    else if (deck.length < DECK_SIZE) setDeck([...deck, id]);
    else setMessage(`Dein Deck ist voll (${DECK_SIZE}). Entferne zuerst eine Karte.`);
  }

  return (
    <main className="screen">
      <Header title="Deck" onBack={onBack} backButton={<ConfirmButton label="◀ Zurück" ariaLabel="Zurück" confirmLabel="Verwerfen?" onConfirm={onBack} skipConfirm={!dirty} />} right={<span className={`pill ${valid ? 'ok' : 'warn'}`}>{deck.length}/{DECK_SIZE}</span>} />
      <div className="deck-actions">
        <button type="button" className="btn btn-small" onClick={() => setDeck([...STARTER_DECK])}>Starterdeck</button>
        <button type="button" className="btn btn-small" onClick={() => setDeck(sorted.slice(0, DECK_SIZE))}>Stärkste 20</button>
        <button type="button" className="btn btn-small" onClick={() => setDeck([])}>Leeren</button>
      </div>
      <p className="hint" aria-live="polite">{message || 'Tippe Karten an, um sie hinzuzufügen oder zu entfernen.'}</p>
      <div className="scroll">
        <div className="card-grid">
          {sorted.map((id) => (
            <div key={id} className="grid-item">
              <Card id={id} size="md" showName selected={selected.has(id)} onClick={() => toggle(id)} />
              {selected.has(id) && <span className="check" aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>
      </div>
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
