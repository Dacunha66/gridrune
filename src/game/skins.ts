// Visual upgrades bought in the shop. They never change game values.
export type SkinKind = 'card' | 'runner';

export interface SkinDef {
  id: string;
  kind: SkinKind;
  name: string;
  description: string;
  price: number;
  /** Main, dark and light colour of the skin. */
  colors: [main: string, dark: string, light: string];
}

export const SKINS: SkinDef[] = [
  { id: 'card-saphir', kind: 'card', name: 'Saphir', description: 'Deine Karten im Duell – klassisch blau.', price: 0, colors: ['#4f8ff7', '#1e3a8a', '#9cc3ff'] },
  { id: 'card-smaragd', kind: 'card', name: 'Smaragd', description: 'Deine Karten im Duell in tiefem Grün.', price: 250, colors: ['#22c55e', '#14532d', '#9af0b8'] },
  { id: 'card-amethyst', kind: 'card', name: 'Amethyst', description: 'Deine Karten im Duell in leuchtendem Violett.', price: 250, colors: ['#a855f7', '#4c1d95', '#dab4ff'] },
  { id: 'card-gletscher', kind: 'card', name: 'Gletscher', description: 'Eisiges Türkis mit hellem Rand.', price: 400, colors: ['#22d3ee', '#155e75', '#e0fbff'] },
  { id: 'runner-blau', kind: 'runner', name: 'Blauer Umhang', description: 'Die Standardfigur im Lauf.', price: 0, colors: ['#7cc4ff', '#2563eb', '#ffffff'] },
  { id: 'runner-glut', kind: 'runner', name: 'Glutläufer', description: 'Ein feuriger Umhang für den Lauf.', price: 200, colors: ['#fdba74', '#ea580c', '#fff1e0'] },
  { id: 'runner-wald', kind: 'runner', name: 'Waldläufer', description: 'Ein Umhang aus Moos und Blättern.', price: 200, colors: ['#86efac', '#15803d', '#f0fff4'] },
  { id: 'runner-schatten', kind: 'runner', name: 'Schattenläufer', description: 'Ein dunkler Umhang in tiefem Violett.', price: 400, colors: ['#c4b5fd', '#3b0764', '#f5f3ff'] },
];

export const DEFAULT_SKINS: Record<SkinKind, string> = { card: 'card-saphir', runner: 'runner-blau' };

const BY_ID = new Map(SKINS.map((s) => [s.id, s]));

export function getSkin(id: string): SkinDef {
  return BY_ID.get(id) ?? BY_ID.get(id.startsWith('runner') ? DEFAULT_SKINS.runner : DEFAULT_SKINS.card)!;
}

export function isSkinId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}
