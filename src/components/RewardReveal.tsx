// Big reveal of what a campaign result brought: one reward after the other, with a light burst behind it.
// Runes show their artwork, rarity and what the effect does; cards are shown large; coins count up.
import { useEffect, useState } from 'react';
import { Card } from './Card';
import { RuneBadge } from './RuneBadge';
import { useCountUp } from './Effects';
import { DesignImage } from './DesignArt';
import { RARITY_LABEL, getCard } from '../game/cards';
import { imageUrl } from '../game/catalog';
import { GAME_MODES, MODE_NAME, RuneDef } from '../game/runes';
import { REWARD_ICON, Reward, rewardText } from '../game/campaign';

export type RevealItem =
  | { kind: 'rune'; rune: RuneDef }
  | { kind: 'coins'; amount: number; sources: string[] }
  | { kind: 'card'; cardId: string; source: string }
  /** A reward type that does not exist in the game yet (or a guest's preview). */
  | { kind: 'preview'; reward: Reward; source: string };

/** What a rune does in short, plain words (shown under its description). */
export function runeFacts(r: RuneDef): string[] {
  const facts = ['Einmal pro Duell einsetzbar – statt oder vor deinem Zug.'];
  if (r.minPlaced > 0) facts.push(`Erst ab ${r.minPlaced} Karten auf dem Spielfeld nutzbar.`);
  const modes = GAME_MODES.filter((m) => r.modes[m]).map((m) => MODE_NAME[m]);
  if (modes.length) facts.push(`Gilt in: ${modes.join(' · ')}.`);
  return facts;
}

function CoinCount({ amount }: { amount: number }) {
  const n = useCountUp(amount, 900, 0);
  return <span className="reveal-coins">🪙 +{n}</span>;
}

export function RewardReveal({ items, reducedMotion, guest = false, onClose }: {
  items: RevealItem[]; reducedMotion: boolean; guest?: boolean; onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const item = items[i];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (!item) return null;
  const last = i === items.length - 1;
  const rarity = item.kind === 'rune' ? item.rune.rarity : item.kind === 'card' ? getCard(item.cardId).rarity : 'rare';
  const title = item.kind === 'rune' ? 'Neue Rune freigespielt!' : item.kind === 'card' ? 'Neue Karte!' : item.kind === 'coins' ? 'Münzen erhalten!' : 'Belohnung freigeschaltet!';
  return (
    <div className={`reveal-overlay ${reducedMotion ? 'still' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div key={i} className={`reveal-stage rarity-${rarity}`}>
        <div className="reveal-rays" aria-hidden="true" />
        <p className="reveal-title">{title}</p>
        {items.length > 1 && <p className="reveal-count">{i + 1} / {items.length}</p>}

        {item.kind === 'rune' && (
          <>
            <div className="reveal-item reveal-rune">
              {item.rune.image && imageUrl(item.rune.image.id)
                ? <span className="reveal-rune-art"><DesignImage src={imageUrl(item.rune.image.id)!} fit={item.rune.image.fit} /></span>
                : <RuneBadge rune={item.rune} className="huge" />}
            </div>
            <h2 className="reveal-name">{item.rune.name}</h2>
            <span className={`reveal-rarity rarity-${item.rune.rarity}`}>{RARITY_LABEL[item.rune.rarity]}</span>
            <p className="reveal-text">{item.rune.description}</p>
            <ul className="reveal-facts">{runeFacts(item.rune).map((f) => <li key={f}>{f}</li>)}</ul>
            <p className="reveal-hint">Ausrüsten unter „Deck bearbeiten“ → „Rune“.</p>
          </>
        )}

        {item.kind === 'card' && (
          <>
            <div className="reveal-item reveal-card"><Card id={item.cardId} size="lg" /></div>
            <h2 className="reveal-name">{getCard(item.cardId).name}</h2>
            <span className={`reveal-rarity rarity-${rarity}`}>{RARITY_LABEL[rarity]}</span>
            <p className="reveal-hint">{item.source} · jetzt in deiner Sammlung</p>
          </>
        )}

        {item.kind === 'coins' && (
          <>
            <div className="reveal-item"><CoinCount amount={item.amount} /></div>
            <ul className="reveal-facts">{item.sources.map((s, k) => <li key={k}>{s}</li>)}</ul>
          </>
        )}

        {item.kind === 'preview' && (
          <>
            <div className="reveal-item"><span className="reveal-icon">{REWARD_ICON[item.reward.type]}</span></div>
            <h2 className="reveal-name">{rewardText(item.reward)}</h2>
            <p className="reveal-hint">{item.source}</p>
            <p className="reveal-text muted">
              {guest && (item.reward.type === 'coins' || item.reward.type === 'card' || item.reward.type === 'pack')
                ? 'Vorschau – mit einem Konto wird diese Belohnung gutgeschrieben.'
                : 'Diese Belohnung kommt mit einem späteren Update ins Spiel.'}
            </p>
          </>
        )}

        <button type="button" className="btn btn-primary btn-big reveal-next" onClick={() => (last ? onClose() : setI(i + 1))} autoFocus>
          {last ? 'Super!' : 'Weiter ▶'}
        </button>
      </div>
    </div>
  );
}
