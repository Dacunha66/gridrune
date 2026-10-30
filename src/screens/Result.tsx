import { CSSProperties } from 'react';
import { Card } from '../components/Card';
import { Burst, Confetti, useCountUp } from '../components/Effects';
import { Outcome } from '../game/battle';
import { RARITY_LABEL, getCard } from '../game/cards';
import { Reward } from '../game/rewards';

interface Props {
  outcome: Outcome;
  reward: Reward;
  score: { player: number; cpu: number };
  coins: number;
  onAgain: () => void;
  onMenu: () => void;
  /** Signed in: the server checks the result before paying out. */
  status?: 'checking' | 'paid' | 'pending' | 'rejected';
}

const TITLES: Record<Outcome, string> = { win: 'Sieg!', draw: 'Unentschieden', loss: 'Niederlage' };
const ICONS: Record<Outcome, string> = { win: '🏆', draw: '🤝', loss: '💀' };

export const RARITY_COLORS: Record<string, string[]> = {
  common: ['#ffffff', '#c7ccd6'],
  uncommon: ['#4ade80', '#bbf7d0', '#ffffff'],
  rare: ['#60a5fa', '#bfdbfe', '#ffffff'],
  epic: ['#c084fc', '#e9d5ff', '#ffffff'],
  legendary: ['#fbbf24', '#fde68a', '#ffffff'],
  mythic: ['#ff5f6d', '#ffc371', '#f9f871', '#4ade80', '#60a5fa', '#c084fc'],
};

export function Result({ outcome, reward, score, coins, onAgain, onMenu, status }: Props) {
  const gained = useCountUp(reward.coins, 900, 0);
  const total = useCountUp(coins, 900, coins - reward.coins);
  const newCard = reward.newCard ? getCard(reward.newCard) : null;
  return (
    <main className={`screen result result-${outcome}`}>
      {outcome === 'win' && <Confetti count={70} />}
      <div className="result-icon" aria-hidden="true">{ICONS[outcome]}</div>
      <h1>{TITLES[outcome]}</h1>
      <p className="result-score"><span className="blue">{score.player}</span> : <span className="red">{score.cpu}</span></p>

      <div className="reward-box">
        <p className="reward-coins">+ 🪙 {gained}</p>
        {status && (
          <p className={`result-status status-${status}`} role="status">
            {status === 'checking' ? '☁️ Ergebnis wird vom Server geprüft …'
              : status === 'paid' ? '✓ Geprüft und in deinem Konto gutgeschrieben'
                : status === 'pending' ? '⏳ Keine Verbindung – die Belohnung wird gutgeschrieben, sobald du wieder online bist (innerhalb von 24 Stunden).'
                  : '⚠️ Das Ergebnis konnte nicht bestätigt werden – es gibt keine Belohnung.'}
          </p>
        )}
        {newCard && (
          <div className="new-card">
            <p>Neue Karte freigeschaltet!</p>
            <div className={`reveal-stage rarity-bg-${newCard.rarity}`} style={{ '--delay': '0.6s' } as CSSProperties}>
              <span className="rays" aria-hidden="true" />
              <Card id={newCard.id} size="lg" className="reveal" />
              <Burst x="50%" y="50%" colors={RARITY_COLORS[newCard.rarity]} count={24} spread={130} />
            </div>
            <p className="new-card-name">{newCard.name}</p>
            <p className={`rarity-text rarity-${newCard.rarity}`}>{RARITY_LABEL[newCard.rarity]}</p>
          </div>
        )}
        {reward.duplicateCard && (
          <p className="muted">{getCard(reward.duplicateCard).name} hattest du schon – dafür gibt es 🪙 50 extra.</p>
        )}
        {outcome === 'win' && !reward.newCard && !reward.duplicateCard && (
          <p className="muted">Tipp: Nimm im Lauf goldene „NEU“-Karten, um nach einem Sieg neue Karten zu bekommen.</p>
        )}
        {outcome !== 'win' && <p className="muted">Nur ein Sieg schaltet neue Karten frei.</p>}
        <p className="muted">Münzen gesamt: 🪙 {total} – ausgeben im 🛒 Shop</p>
      </div>

      <div className="menu-buttons">
        <button type="button" className="btn btn-primary btn-big" onClick={onAgain}>▶ Neuer Lauf</button>
        <button type="button" className="btn" onClick={onMenu}>Hauptmenü</button>
      </div>
    </main>
  );
}
