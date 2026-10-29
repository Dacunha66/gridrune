// Card design: everyone sees "Hybrid Premium". The admin can switch this device back to the former
// steampunk design to compare (admin area or the 🎨 button in the duel); stored on this device only –
// never in the save, never for other players. Only the look changes: values, rules and collections stay the same.
import { useSyncExternalStore } from 'react';

export type CardStyle = 'premium' | 'current';
export const CARD_STYLES: CardStyle[] = ['premium', 'current'];
/** Design every player sees. */
export const DEFAULT_CARD_STYLE: CardStyle = 'premium';
export const CARD_STYLE_LABEL: Record<CardStyle, string> = {
  premium: 'Hybrid Premium',
  current: 'Standard (Steampunk)',
};
export const CARD_STYLE_HINT: Record<CardStyle, string> = {
  premium: 'Außen der Spielerrahmen (rot/blau), innen ein Klassenrahmen aus passendem Material, Werte als Metall-Medaillons, Klasse oben links, Fähigkeit oben rechts, Namensleiste mit bis zu zwei Zeilen.',
  current: 'Das bisherige Steampunk-Design (zum Vergleich).',
};

export const CARD_STYLE_KEY = 'gridrune/dev-card-style';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read(): CardStyle {
  try {
    const v = storage()?.getItem(CARD_STYLE_KEY);
    return CARD_STYLES.includes(v as CardStyle) ? (v as CardStyle) : DEFAULT_CARD_STYLE;
  } catch {
    return DEFAULT_CARD_STYLE;
  }
}

let style: CardStyle = read();
let devEnabled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function getCardStyle(): CardStyle {
  return style;
}

export function setCardStyle(next: CardStyle): void {
  style = next;
  try {
    storage()?.setItem(CARD_STYLE_KEY, next);
  } catch {
    /* private mode: only for this visit */
  }
  emit();
}

/** Next design (for the 🎨 button in the duel). */
export function cycleCardStyle(): CardStyle {
  const next = CARD_STYLES[(CARD_STYLES.indexOf(style) + 1) % CARD_STYLES.length];
  setCardStyle(next);
  return next;
}

/** Set by the app once it knows this viewer is an admin: shows the design switch in the duel. */
export function setDevTools(on: boolean): void {
  if (devEnabled === on) return;
  devEnabled = on;
  emit();
}

export function useCardStyle(): CardStyle {
  return useSyncExternalStore(subscribe, getCardStyle, getCardStyle);
}

export function useDevTools(): boolean {
  return useSyncExternalStore(subscribe, () => devEnabled, () => devEnabled);
}
