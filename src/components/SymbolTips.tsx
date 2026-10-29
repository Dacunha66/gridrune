// Explanations for the symbols on cards: hold a finger on the class shield or the ability medallion (or tap it
// where the card itself does nothing on tap) and a small bubble explains it. Works for every card in the game.
import { useEffect, useRef, useState } from 'react';
import { CLASS_INFO, CLASS_TERRAIN, ELEMENT_BONUS, EFFECTS, TERRAIN_INFO, isCardClass, isEffectId } from '../game/effects';

/** How long a finger must stay on a symbol (a bit shorter than the hand card preview, which it replaces). */
export const SYMBOL_HOLD_MS = 380;

let open = false;
/** True while an explanation is shown or was just opened by holding – other long-press actions skip then. */
export function isSymbolTipOpen(): boolean {
  return open;
}

export function symbolText(sym: string): { title: string; text: string } | null {
  const [kind, id] = sym.split(':');
  if (kind === 'cls' && isCardClass(id)) {
    const t = CLASS_TERRAIN[id];
    return {
      title: `${CLASS_INFO[id].icon} ${CLASS_INFO[id].label} · Klasse`,
      text: `Element: ${TERRAIN_INFO[t].icon} ${TERRAIN_INFO[t].label} – auf diesen Feldern +${ELEMENT_BONUS} auf alle vier Werte. ${CLASS_INFO[id].focus}.`,
    };
  }
  if (kind === 'fx' && isEffectId(id)) {
    const e = EFFECTS[id];
    return { title: `✨ ${e.name} · Fähigkeit`, text: e.text };
  }
  return null;
}

interface Tip {
  title: string;
  text: string;
  x: number;
  y: number;
  below: boolean;
}

export function SymbolTips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const show = (el: Element) => {
      const info = symbolText(el.getAttribute('data-sym') ?? '');
      if (!info) return;
      const r = el.getBoundingClientRect();
      open = true;
      setTip({ ...info, x: r.left + r.width / 2, y: r.top < 170 ? r.bottom + 8 : r.top - 8, below: r.top < 170 });
    };
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    const down = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-sym]');
      if (!el) {
        // Any tap elsewhere closes the bubble.
        if (open && !(e.target as Element | null)?.closest?.('.symbol-tip')) {
          open = false;
          setTip(null);
        }
        return;
      }
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        suppressClick.current = true;
        show(el);
      }, SYMBOL_HOLD_MS);
    };
    const move = (e: PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
    };
    const up = () => {
      clear();
      start.current = null;
    };
    const click = (e: MouseEvent) => {
      if (suppressClick.current) {
        // The hold opened the explanation – this click must not also select or play the card.
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const el = (e.target as Element | null)?.closest?.('[data-sym]');
      // A short tap explains the symbol only where the card itself has no tap action.
      if (el && !el.closest('button')) {
        e.stopPropagation();
        show(el);
      }
    };
    const menu = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-sym]')) e.preventDefault();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('click', click, true);
    document.addEventListener('contextmenu', menu, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('contextmenu', menu, true);
      clear();
    };
  }, []);

  useEffect(() => {
    if (!tip) return;
    const t = setTimeout(() => {
      open = false;
      setTip(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [tip]);

  if (!tip) return null;
  const left = Math.min(Math.max(tip.x, 150), (typeof window !== 'undefined' ? window.innerWidth : 400) - 150);
  return (
    <div className={`symbol-tip ${tip.below ? 'below' : 'above'}`} role="status" style={{ left, top: tip.y }}>
      <b>{tip.title}</b>
      <span>{tip.text}</span>
    </div>
  );
}
