import { Card } from '../components/Card';
import { RARITY_LABEL, getCard } from '../game/cards';
import { CLASS_INFO, EFFECTS } from '../game/effects';

export function CardDetail({ id, locked, status, onClose }: { id: string; locked: boolean; status: string; onClose: () => void }) {
  const c = getCard(id);
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Kartendetails">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <Card id={id} size="lg" locked={locked} />
        <h2>{locked ? '???' : c.name}</h2>
        <p className={`rarity-text rarity-${c.rarity}`}>{RARITY_LABEL[c.rarity]}</p>
        {!locked && (
          <p className="values-line">⬆ {c.top} · ➡ {c.right} · ⬇ {c.bottom} · ⬅ {c.left}</p>
        )}
        {!locked && c.cls && <p className="values-line">{CLASS_INFO[c.cls].icon} {CLASS_INFO[c.cls].label}</p>}
        {!locked && c.effect && (
          <div className="effect-box">
            <p><strong>✨ {EFFECTS[c.effect].name}</strong></p>
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
