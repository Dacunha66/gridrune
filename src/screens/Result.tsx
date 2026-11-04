import { CSSProperties } from 'react';
import { Coin } from '../components/Coin';
import { GameIcon, GameIconName } from '../components/GameIcon';
import { Card } from '../components/Card';
import { Burst, Confetti, useCountUp } from '../components/Effects';
import { Outcome } from '../game/battle';
import { RARITY_LABEL, getCard } from '../game/cards';
import { AI_COINS, Reward } from '../game/rewards';
import type { AiLevel } from '../game/ai';

const LEVEL_NAME: Record<AiLevel, string> = { easy: 'Leicht', medium: 'Normal', hard: 'Schwer' };

interface Props {
  outcome: Outcome;
  reward: Reward;
  score: { player: number; cpu: number };
  coins: number;
  onAgain: () => void;
  onMenu: () => void;
  /** Difficulty of the computer in this game. */
  level?: AiLevel;
  /** Signed in: the server checks the result before paying out. */
  status?: 'checking' | 'paid' | 'pending' | 'rejected';
}

const TITLES: Record<Outcome, string> = { win: 'Sieg!', draw: 'Unentschieden', loss: 'Niederlage' };
const ICONS: Record<Outcome, GameIconName> = { win: 'crown', draw: 'handshake', loss: 'skull' };

export const RARITY_COLORS: Record<string, string[]> = {
  common: ['#ffffff', '#c7ccd6'],
  uncommon: ['#4ade80', '#bbf7d0', '#ffffff'],
  rare: ['#60a5fa', '#bfdbfe', '#ffffff'],
  epic: ['#c084fc', '#e9d5ff', '#ffffff'],
  legendary: ['#fbbf24', '#fde68a', '#ffffff'],
  mythic: ['#ff5f6d', '#ffc371', '#f9f871', '#4ade80', '#60a5fa', '#c084fc'],
};

export function Result({ outcome, reward, score, coins, onAgain, onMenu, status, level = 'medium' }: Props) {
  const gained = useCountUp(reward.coins, 900, 0);
  const total = useCountUp(coins, 900, coins - reward.coins);
  const newCard = reward.newCard ? getCard(reward.newCard) : null;
  return (
    <main className={`screen result result-${outcome}`}>
      {outcome === 'win' && <Confetti count={70} />}
      <div className="result-icon" aria-hidden="true"><GameIcon name={ICONS[outcome]} /></div>
      <h1>{TITLES[outcome]}</h1>
      <p className="result-score"><span className="blue">{score.player}</span> : <span className="red">{score.cpu}</span></p>

      <div className="reward-box">
        <p className="reward-coins">+ <Coin className="big" /> {gained}</p>
        {status && (
          <p className={`result-status status-${status}`} role="status">
            {status === 'checking' ? 'Ergebnis wird vom Server geprüft …'
              : status === 'paid' ? '✓ Geprüft und in deinem Konto gutgeschrieben'
                : status === 'pending' ? 'Keine Verbindung – die Belohnung wird gutgeschrieben, sobald du wieder online bist (innerhalb von 24 Stunden).'
                  : 'Das Ergebnis konnte nicht bestätigt werden – es gibt keine Belohnung.'}
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
          <p className="muted">{getCard(reward.duplicateCard).name} hattest du schon – dafür gibt es <Coin /> 50 extra.</p>
        )}
        <p className="muted">Schwierigkeit: {LEVEL_NAME[level]} · Sieg <Coin /> {AI_COINS[level].win}{level !== 'hard' && <> – auf Schwer gibt es <Coin /> {AI_COINS.hard.win}</>}</p>
        <p className="muted">Neue Karten gibt es für einen Sieg in der Rangliste und im Shop.</p>
        <p className="muted">Münzen gesamt: <Coin /> {total} – ausgeben im Shop</p>
      </div>

      <div className="menu-buttons">
        <button type="button" className="btn btn-primary btn-big" onClick={onAgain}>▶ Nochmal ({LEVEL_NAME[level]})</button>
        <button type="button" className="btn" onClick={onMenu}>Menü</button>
      </div>
    </main>
  );
}
