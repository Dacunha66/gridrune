import { useState } from 'react';
import { Card } from '../components/Card';
import { CARDS, RARITIES, RARITY_LABEL, Rarity, ownedActiveIds } from '../game/cards';
import { SaveData } from '../game/storage';
import { Header } from './Header';
import { CardDetail } from './CardDetail';
import { editionsOf } from '../game/puzzles';

const FILTERS: (Rarity | 'all')[] = ['all', ...RARITIES];

export function Collection({ save, onBack, focus = null, onEdition }: {
  save: SaveData; onBack: () => void;
  /** Open this card's details right away (e.g. after unlocking an edition). */
  focus?: string | null;
  /** Choose the edition used for a card (null = original). */
  onEdition?: (cardId: string, editionId: string | null) => void;
}) {
  const [filter, setFilter] = useState<Rarity | 'all'>('all');
  const [detail, setDetail] = useState<string | null>(focus);
  const owned = new Set(save.unlocked);
  const deck = new Set(save.deck);
  const shown = CARDS.filter((c) => filter === 'all' || c.rarity === filter);
  return (
    <main className="screen">
      <Header title="Sammlung" onBack={onBack} right={<span className="pill">{ownedActiveIds(save.unlocked).length}/{CARDS.length}</span>} />
      <div className="chips" role="tablist">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Alle' : RARITY_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="scroll">
        <div className="card-grid">
          {shown.map((c) => (
            <div key={c.id} className="grid-item">
              <Card id={c.id} size="md" locked={!owned.has(c.id)} showName onClick={() => setDetail(c.id)} />
              {deck.has(c.id) && <span className="in-deck">Deck</span>}
              {owned.has(c.id) && editionsOf(c.id).some((e) => save.editions.owned.includes(e.id)) && <span className="has-edition" title="Besondere Edition">✦</span>}
            </div>
          ))}
        </div>
      </div>
      {detail && (
        <CardDetail
          id={detail}
          locked={!owned.has(detail)}
          status={!owned.has(detail) ? 'Noch nicht freigeschaltet – gewinne sie in der Rangliste, im Shop oder als Belohnung.' : deck.has(detail) ? 'In deinem Deck' : 'Freigeschaltet'}
          onClose={() => setDetail(null)}
          editions={owned.has(detail) ? { owned: save.editions.owned, equipped: save.editions.equipped[detail] ?? null, onChoose: (e) => onEdition?.(detail, e) } : undefined}
        />
      )}
    </main>
  );
}
