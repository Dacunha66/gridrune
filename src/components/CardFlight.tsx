// A placed card on its way to the board: it comes from the hand (own card) or from the opponent's side (turned over on
// the way), is shown large in the middle for a moment, then flies in one arc to its field. A tap skips the pause.
import { CSSProperties, useLayoutEffect, useRef } from 'react';
import { Card } from './Card';
import { getCard } from '../game/cards';
import type { Side } from '../game/battle';

export interface FlightInfo {
  cardId: string;
  mod: number;
  owner: Side;
  /** The four values as they will show on the board (bonuses, Wirbelwind turn). */
  values: number[];
  base: number[];
  rot: number;
  /** Where the card starts (the hand card on the screen); null = the opponent's side at the top. */
  from: DOMRect | null;
  /** The board field it lands on. */
  to: DOMRect;
}

/** Durations in ms: in to the middle, shown large, flight to the field. */
export const FLIGHT_IN = 260;
export const FLIGHT_HOLD = 600;
export const FLIGHT_OUT = 380;

export function CardFlight({ flight, onDone }: { flight: FlightInfo; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const anim = useRef<Animation | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const me = el.getBoundingClientRect();
    const cx = me.left + me.width / 2;
    const cy = me.top + me.height / 2;
    // From: the hand card, or above the board on the opponent's side.
    const from = flight.from ?? new DOMRect(innerWidth / 2 - me.width * 0.2, -me.height * 0.3, me.width * 0.4, me.height * 0.4);
    const at = (r: DOMRect) => ({ x: r.left + r.width / 2 - cx, y: r.top + r.height / 2 - cy, s: r.width / me.width });
    const a = at(from);
    const b = at(flight.to);
    const total = FLIGHT_IN + FLIGHT_HOLD + FLIGHT_OUT;
    const t = (ms: number) => ms / total;
    const cpu = flight.owner === 'cpu';
    // The middle of the flight to the field lies a little higher: an arc instead of a straight line.
    const mid = { x: b.x * 0.5, y: b.y * 0.5 - 40, s: (1 + b.s) / 2 };
    const frames: Keyframe[] = [
      { offset: 0, transform: `translate(${a.x}px, ${a.y}px) scale(${a.s}) ${cpu ? 'rotateY(90deg)' : ''}`, opacity: cpu ? 0 : 1 },
      { offset: t(FLIGHT_IN * 0.7), opacity: 1 },
      { offset: t(FLIGHT_IN), transform: 'translate(0px, 0px) scale(1.08) rotateY(0deg)', easing: 'ease-out' },
      { offset: t(FLIGHT_IN + 140), transform: 'translate(0px, 0px) scale(1) rotateY(0deg)' },
      { offset: t(FLIGHT_IN + FLIGHT_HOLD), transform: 'translate(0px, 0px) scale(1) rotateY(0deg)', easing: 'ease-in' },
      { offset: t(FLIGHT_IN + FLIGHT_HOLD + FLIGHT_OUT * 0.55), transform: `translate(${mid.x}px, ${mid.y}px) scale(${mid.s}) rotate(${cpu ? 4 : -4}deg)`, easing: 'ease-out' },
      { offset: 1, transform: `translate(${b.x}px, ${b.y}px) scale(${b.s}) rotate(0deg)` },
    ];
    const run = el.animate(frames, { duration: total, fill: 'forwards' });
    anim.current = run;
    run.onfinish = () => done.current();
    return () => {
      run.onfinish = null;
      run.cancel();
    };
    // One flight per mounted component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tap during the pause: fly on right away.
  const skip = () => {
    const run = anim.current;
    if (!run || run.currentTime === null) return;
    const now = Number(run.currentTime);
    if (now < FLIGHT_IN + FLIGHT_HOLD) run.currentTime = FLIGHT_IN + FLIGHT_HOLD;
  };

  return (
    <div className={`card-flight owner-${flight.owner}`} onClick={skip} aria-hidden="true">
      <div ref={box} className="card-flight-card" style={{ '--flight-glow': flight.owner === 'cpu' ? 'var(--red)' : 'var(--player)' } as CSSProperties}>
        <Card id={flight.cardId} mod={flight.mod} values={flight.values} base={flight.base} rot={flight.rot} owner={flight.owner} size="md" />
        <p className="card-flight-name">{getCard(flight.cardId).name}</p>
      </div>
    </div>
  );
}
