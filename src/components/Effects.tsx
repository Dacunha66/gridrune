// Small reusable animation pieces: particle bursts, confetti and counting numbers.
import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

interface BurstProps {
  /** Position in px or as a CSS length such as '50%'. */
  x: number | string;
  y: number | string;
  colors?: string[];
  count?: number;
  /** Distance the particles travel in px. */
  spread?: number;
  /** Position relative to the viewport instead of the parent. */
  fixed?: boolean;
  onDone?: () => void;
}

/** Particles flying out from one point. */
export function Burst({ x, y, colors = ['#ffcc33', '#fff'], count = 14, spread = 60, fixed, onDone }: BurstProps) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current?.(), 750);
    return () => clearTimeout(t);
  }, []);
  const parts = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      a: (360 / count) * i + Math.random() * 20,
      d: spread * (0.6 + Math.random() * 0.6),
      s: 4 + Math.random() * 5,
      c: colors[i % colors.length],
    })),
    [count, spread, colors],
  );
  return (
    <div className={`burst ${fixed ? 'fixed' : ''}`} style={{ left: x, top: y }} aria-hidden="true">
      {parts.map((p, i) => (
        <i key={i} style={{ '--a': `${p.a}deg`, '--d': `${p.d}px`, '--s': `${p.s}px`, background: p.c } as CSSProperties} />
      ))}
    </div>
  );
}

const CONFETTI_COLORS = ['#ffcc33', '#4ade80', '#60a5fa', '#c084fc', '#ff7ad9', '#ff5f6d', '#fff'];

/** Confetti raining over the whole screen. */
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.9,
      dur: 1.8 + Math.random() * 1.6,
      rot: Math.random() * 720 - 360,
      drift: Math.random() * 80 - 40,
      w: 6 + Math.random() * 6,
      c: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
    [count],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`, width: p.w, height: p.w * 0.45, background: p.c,
            animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`,
            '--rot': `${p.rot}deg`, '--drift': `${p.drift}px`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Animates a number from its previous value to `target`. */
export function useCountUp(target: number, duration = 700, from?: number): number {
  const [value, setValue] = useState(from ?? target);
  const prev = useRef(from ?? target);
  useEffect(() => {
    const start = prev.current;
    prev.current = target;
    if (start === target) return;
    const reduced = document.documentElement.classList.contains('reduced-motion');
    if (reduced) {
      setValue(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}
