// Card design test (Kartendesign 2.0): which card layout this device shows. Only the admin can switch it
// (admin area or the 🎨 button in the duel); it is stored on this device only – never in the save, never
// for other players. Only the look changes: values, rules and collections stay exactly the same.
import { useSyncExternalStore } from 'react';

export type CardStyle = 'current' | 'classic' | 'compact' | 'split' | 'hybrid' | 'premium' | 'premiumLite';
export const CARD_STYLES: CardStyle[] = ['current', 'classic', 'compact', 'split', 'hybrid', 'premium', 'premiumLite'];
export const CARD_STYLE_LABEL: Record<CardStyle, string> = {
  current: 'Aktuell (Steampunk)',
  classic: 'Design 2 klassisch',
  compact: 'Design 2 kompakt',
  split: 'Design 3 geteilt',
  hybrid: 'Design 4 hybrid',
  premium: 'Hybrid Premium Fantasy',
  premiumLite: 'Hybrid Premium (dezente Werte)',
};
export const CARD_STYLE_HINT: Record<CardStyle, string> = {
  current: 'Das Design, das alle Spieler gerade sehen.',
  classic: 'Werte an den Rändern, Name unten, Klasse oben links, Fähigkeit oben rechts.',
  compact: 'Wie klassisch, größere Werte für kleine Bildschirme; auf dem Spielfeld ohne Namen.',
  split: 'Große Illustration oben, eigener Wertebereich darunter (Werte als Kreuz).',
  hybrid: 'Illustration über die ganze Karte, kompakte Infoleiste unten.',
  premium: 'Außen der Spielerrahmen (rot/blau), innen ein Klassenrahmen aus passendem Material, Werte als Metall-Medaillons, Klasse oben links, Fähigkeit oben rechts, Namensleiste mit bis zu zwei Zeilen.',
  premiumLite: 'Wie Premium, aber mit flacheren, halbtransparenten Wertplaketten – mehr Bild sichtbar.',
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
    return CARD_STYLES.includes(v as CardStyle) ? (v as CardStyle) : 'current';
  } catch {
    return 'current';
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
