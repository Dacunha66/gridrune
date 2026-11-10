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

/** One Runenstein (own drawing: a glowing crystal with a rune), sized like the text around it. */
export function Stone({ className = '', label }: { className?: string; label?: string }) {
  return (
    <svg className={`stone-icon ${className}`} viewBox="0 0 24 24" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id="stone-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9fff4" />
          <stop offset="0.45" stopColor="#45e3cf" />
          <stop offset="1" stopColor="#1f6fb2" />
        </linearGradient>
      </defs>
      <path d="M12 1.5 20.5 8 17.5 20.5h-11L3.5 8Z" fill="url(#stone-a)" stroke="#0b3a4a" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M12 1.5 9 8l3 12.5L15 8Z M3.5 8h17" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.8" />
      <path d="M10.2 6.5v8.5 M10.2 6.5l3.4 2.4-3.4 2.3 3.6 3.8" fill="none" stroke="#0b2f3d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Icon of a reward type – coins and Runensteine as their artwork, the others as their symbol. */
export function RewardIcon({ type }: { type: RewardType }) {
  return type === 'coins' ? <Coin /> : type === 'stones' ? <Stone /> : <>{REWARD_ICON[type]}</>;
}
