import { Card } from '../components/Card';
import { ClassGlyph } from '../components/GlyphIcons';
import { RARITY_LABEL, getCard } from '../game/cards';
import { CLASS_INFO, EFFECTS } from '../game/effects';
import { editionsOf, findEdition } from '../game/puzzles';

export function CardDetail({ id, locked, status, onClose, editions }: {
  id: string; locked: boolean; status: string; onClose: () => void;
  /** Card editions the player owns: choose which one is used (in the collection, the deck and own duel cards). */
  editions?: { owned: string[]; equipped: string | null; onChoose: (editionId: string | null) => void };
}) {
  const c = getCard(id);
  const mine = editions ? editionsOf(id).filter((e) => editions.owned.includes(e.id)) : [];
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Kartendetails">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <Card id={id} size="lg" locked={locked} edition={editions ? editions.equipped : undefined} />
        <h2>{locked ? '???' : c.name}{editions?.equipped && findEdition(editions.equipped) ? <small className="edition-name"> – {findEdition(editions.equipped)!.name}</small> : null}</h2>
        {mine.length > 0 && editions && (
          <div className="edition-pick" role="group" aria-label="Edition wählen">
            <button type="button" className={`seg ${!editions.equipped ? 'active' : ''}`} onClick={() => editions.onChoose(null)}>Original</button>
            {mine.map((e) => (
              <button key={e.id} type="button" className={`seg ${editions.equipped === e.id ? 'active' : ''}`} onClick={() => editions.onChoose(e.id)}>✦ {e.name}</button>
            ))}
          </div>
        )}
        <p className={`rarity-text rarity-${c.rarity}`}>{RARITY_LABEL[c.rarity]}</p>
        {!locked && (
          <p className="values-line">↑ {c.top} · → {c.right} · ↓ {c.bottom} · ← {c.left}</p>
        )}
        {!locked && c.cls && <p className="values-line"><ClassGlyph cls={c.cls} /> {CLASS_INFO[c.cls].label}</p>}
        {!locked && c.effect && (
          <div className="effect-box">
            <p><strong>{EFFECTS[c.effect].name}</strong></p>
            <p>{EFFECTS[c.effect].text}</p>
          </div>
        )}
        {!locked && c.description && <p className="card-description">{c.description}</p>}
        <p className="muted">{status}</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}
