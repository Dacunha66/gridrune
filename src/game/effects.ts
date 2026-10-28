// Card classes, terrain types and the ten special effects – defined once, here.
// Cards only store a class id and an effect id; all behaviour lives in the duel engine (battle.ts).

export type CardClass = 'krieger' | 'magier' | 'natur' | 'feuer' | 'frost' | 'schatten';

export const CLASSES: CardClass[] = ['krieger', 'magier', 'natur', 'feuer', 'frost', 'schatten'];

export const CLASS_INFO: Record<CardClass, { label: string; icon: string; focus: string }> = {
  krieger: { label: 'Krieger', icon: '⚔️', focus: 'Direkter Kampf und Verteidigung' },
  magier: { label: 'Magier', icon: '🔮', focus: 'Magische Verstärkung und Schutz' },
  natur: { label: 'Natur', icon: '🌿', focus: 'Zusammenspiel mit Natur und Wald' },
  feuer: { label: 'Feuer', icon: '🔥', focus: 'Offensive und Lava' },
  frost: { label: 'Frost', icon: '❄️', focus: 'Defensive und Eis' },
  schatten: { label: 'Schatten', icon: '🌑', focus: 'Schwächung und Überraschung' },
};

export type Terrain = 'normal' | 'wald' | 'lava' | 'eis' | 'schatten';

export const TERRAINS: Terrain[] = ['normal', 'wald', 'lava', 'eis', 'schatten'];

/** Element of a class: on its own terrain a card gets +1 on all values (Krieger and Magier have none). */
export const CLASS_TERRAIN: Partial<Record<CardClass, Exclude<Terrain, 'normal'>>> = { natur: 'wald', feuer: 'lava', frost: 'eis', schatten: 'schatten' };
/** Bonus on all four values for a card on the terrain of its class. */
export const ELEMENT_BONUS = 1;

export const TERRAIN_INFO: Record<Terrain, { label: string; icon: string }> = {
  normal: { label: 'Normal', icon: '' },
  wald: { label: 'Wald', icon: '🌲' },
  lava: { label: 'Lava', icon: '🌋' },
  eis: { label: 'Eis', icon: '❄️' },
  schatten: { label: 'Schatten', icon: '🌑' },
};

export type EffectId =
  | 'kampfgeist' | 'schildwall' | 'arkane_kraft' | 'magische_barriere' | 'wurzelkraft'
  | 'naturbund' | 'flammenherz' | 'frostpanzer' | 'schattenmantel' | 'schwaechender_blick';

export interface EffectDef {
  id: EffectId;
  name: string;
  cls: CardClass;
  /** When it works: once when played, or as long as a condition holds. */
  trigger: 'play' | 'condition';
  /** Terrain the effect needs (terrain effects only). */
  terrain?: Terrain;
  /** Rule text shown in the admin editor and the card details. */
  text: string;
  /** Very short version for the duel hint line. */
  short: string;
  /** Strength in Σ points for balancing (measured in test duels, see BALANCING.md). */
  value: number;
}

export const EFFECTS: Record<EffectId, EffectDef> = {
  kampfgeist: {
    id: 'kampfgeist', short: 'Höchster Wert +1', name: 'Kampfgeist', cls: 'krieger', trigger: 'play', value: 2.1,
    text: 'Beim Ausspielen: Der höchste Wert erhält +1 (bei Gleichstand oben, rechts, unten, links).',
  },
  schildwall: {
    id: 'schildwall', short: '+1 neben eigener Karte', name: 'Schildwall', cls: 'krieger', trigger: 'condition', value: 3.5,
    text: 'Solange eine eigene Karte direkt angrenzt: +1 auf alle Seiten, die nicht zu einer eigenen Karte zeigen.',
  },
  arkane_kraft: {
    id: 'arkane_kraft', short: 'Alle Werte +1', name: 'Arkane Kraft', cls: 'magier', trigger: 'play', value: 4,
    text: 'Beim Ausspielen: Alle vier Werte erhalten +1.',
  },
  magische_barriere: {
    id: 'magische_barriere', short: 'Niedrigster Wert +1 und Schild 🛡', name: 'Magische Barriere', cls: 'magier', trigger: 'play', value: 1,
    text: 'Beim Ausspielen: Der niedrigste Wert erhält +1 (bei Gleichstand alle niedrigsten). Ein Schild 🛡 verhindert die nächste Schwächung durch einen gegnerischen Effekt.',
  },
  wurzelkraft: {
    id: 'wurzelkraft', short: 'Auf Wald 🌲 alle Werte +1', name: 'Wurzelkraft', cls: 'natur', trigger: 'condition', terrain: 'wald', value: 0.9,
    text: 'Solange die Karte auf einem Waldfeld 🌲 liegt: Alle vier Werte +1.',
  },
  naturbund: {
    id: 'naturbund', short: '+1 neben eigener Naturkarte', name: 'Naturbund', cls: 'natur', trigger: 'condition', value: 0.9,
    text: 'Solange eine eigene Naturkarte direkt angrenzt: +1 auf alle Seiten, die nicht zu einer eigenen Karte zeigen.',
  },
  flammenherz: {
    id: 'flammenherz', short: 'Auf Lava 🌋 oben +2', name: 'Flammenherz', cls: 'feuer', trigger: 'condition', terrain: 'lava', value: 0.3,
    text: 'Solange die Karte auf einem Lavafeld 🌋 liegt: Der obere Wert erhält +2.',
  },
  frostpanzer: {
    id: 'frostpanzer', short: 'Auf Eis ❄️ links und rechts +1', name: 'Frostpanzer', cls: 'frost', trigger: 'condition', terrain: 'eis', value: 0.3,
    text: 'Solange die Karte auf einem Eisfeld ❄️ liegt: Linker und rechter Wert erhalten je +1.',
  },
  schattenmantel: {
    id: 'schattenmantel', short: 'Auf Schatten 🌑 niedrigster Wert +2', name: 'Schattenmantel', cls: 'schatten', trigger: 'condition', terrain: 'schatten', value: 0.3,
    text: 'Solange die Karte auf einem Schattenfeld 🌑 liegt: Der niedrigste Wert erhält +2 (bei Gleichstand oben, rechts, unten, links).',
  },
  schwaechender_blick: {
    id: 'schwaechender_blick', short: 'Gegner daneben −1 auf alle Werte', name: 'Schwächender Blick', cls: 'schatten', trigger: 'play', value: 3.1,
    text: 'Beim Ausspielen: Eine angrenzende gegnerische Karte verliert −1 auf alle Werte (bis Duellende). Bei mehreren Gegnern wählst du das Ziel.',
  },
};

export const EFFECT_IDS = Object.keys(EFFECTS) as EffectId[];

export function isCardClass(v: unknown): v is CardClass {
  return typeof v === 'string' && (CLASSES as string[]).includes(v);
}

export function isEffectId(v: unknown): v is EffectId {
  return typeof v === 'string' && v in EFFECTS;
}

export function isTerrain(v: unknown): v is Terrain {
  return typeof v === 'string' && (TERRAINS as string[]).includes(v);
}

/** Effects a card of this class may have. */
export function effectsForClass(cls: CardClass | undefined): EffectDef[] {
  return cls ? EFFECT_IDS.map((id) => EFFECTS[id]).filter((e) => e.cls === cls) : [];
}

type Four = [number, number, number, number];
const clamp = (n: number) => Math.min(10, Math.max(1, n));

/** First index with the highest/lowest value (ties: top, right, bottom, left). */
function pickIndex(v: Four, pick: 'max' | 'min'): number {
  let best = 0;
  for (let i = 1; i < 4; i++) if (pick === 'max' ? v[i] > v[best] : v[i] < v[best]) best = i;
  return best;
}

/**
 * What the effect does to a card's values in a typical situation – for the admin editor preview.
 * Mirrors the duel engine (battle.ts); tests check that both agree.
 */
export function effectPreview(base: Four, effect: EffectId): { situation: string; values: Four; note?: string } {
  const v = [...base] as Four;
  const add = (i: number, n: number) => { v[i] = clamp(v[i] + n); };
  switch (effect) {
    case 'kampfgeist':
      add(pickIndex(base, 'max'), 1);
      return { situation: 'Nach dem Ausspielen', values: v };
    case 'arkane_kraft':
      [0, 1, 2, 3].forEach((i) => add(i, 1));
      return { situation: 'Nach dem Ausspielen', values: v };
    case 'magische_barriere': {
      const low = Math.min(...base);
      [0, 1, 2, 3].filter((i) => base[i] === low).forEach((i) => add(i, 1));
      return { situation: 'Nach dem Ausspielen', values: v, note: 'Dazu ein Schild 🛡 gegen die nächste Schwächung.' };
    }
    case 'schildwall':
    case 'naturbund':
      [0, 1, 2].forEach((i) => add(i, 1));
      return { situation: effect === 'schildwall' ? 'Eigene Karte links daneben' : 'Eigene Naturkarte links daneben', values: v };
    // Terrain effects: the card also gets its element bonus there (+1 on all values).
    case 'wurzelkraft':
      [0, 1, 2, 3].forEach((i) => add(i, 1 + ELEMENT_BONUS));
      return { situation: 'Auf Wald 🌲 (mit Element +1)', values: v };
    case 'flammenherz':
      add(0, 2);
      [0, 1, 2, 3].forEach((i) => add(i, ELEMENT_BONUS));
      return { situation: 'Auf Lava 🌋 (mit Element +1)', values: v };
    case 'frostpanzer':
      add(1, 1);
      add(3, 1);
      [0, 1, 2, 3].forEach((i) => add(i, ELEMENT_BONUS));
      return { situation: 'Auf Eis ❄️ (mit Element +1)', values: v };
    case 'schattenmantel':
      add(pickIndex(base, 'min'), 2);
      [0, 1, 2, 3].forEach((i) => add(i, ELEMENT_BONUS));
      return { situation: 'Auf Schatten 🌑 (mit Element +1)', values: v };
    case 'schwaechender_blick':
      return { situation: 'Beim Ausspielen', values: v, note: 'Die eigenen Werte bleiben gleich – eine Gegnerkarte daneben bekommt −1 auf alle Werte.' };
  }
}
