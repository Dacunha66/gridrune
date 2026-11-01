// The game's coin (own artwork) instead of the 🪙 emoji – inline in texts, buttons and the wallet.
import { ReactNode } from 'react';
import coinImg from '../assets/coin.webp';
import coinLargeImg from '../assets/coin-lg.webp';
import { REWARD_ICON, RewardType } from '../game/campaign';

export const COIN_EMOJI = '🪙';
export { coinLargeImg };

/** One coin, sized like the text around it. */
export function Coin({ className = '', label }: { className?: string; label?: string }) {
  return <img src={coinImg} className={`coin-icon ${className}`} alt={label ?? ''} aria-hidden={label ? undefined : true} draggable={false} />;
}

/** Text that may contain 🪙 (messages built elsewhere): every 🪙 is shown as the coin artwork. */
export function CoinText({ text }: { text: string }): ReactNode {
  if (!text.includes(COIN_EMOJI)) return text;
  const parts = text.split(COIN_EMOJI);
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && <Coin />}{p}</span>)}</>;
}

/** Icon of a reward type – coins as the coin artwork, the others as their symbol. */
export function RewardIcon({ type }: { type: RewardType }) {
  return type === 'coins' ? <Coin /> : <>{REWARD_ICON[type]}</>;
}
