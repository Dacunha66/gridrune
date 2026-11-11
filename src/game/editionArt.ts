// Pictures of card editions in the game (browser only – the rules in puzzles.ts know no pictures).
// Built-in editions bring their own picture; an admin upload replaces it.
import { imageUrl } from './catalog';
import { EditionDef, findEdition } from './puzzles';
import ed01 from '../assets/editions/ed01-runenwolf-mondfinsternis.webp';
import ed01Thumb from '../assets/editions/ed01-runenwolf-mondfinsternis-thumb.webp';
import ed02 from '../assets/editions/ed02-vampirgraf-blutmond.webp';
import ed02Thumb from '../assets/editions/ed02-vampirgraf-blutmond-thumb.webp';
import ed03 from '../assets/editions/ed03-nachtwolf-schattenmond.webp';
import ed03Thumb from '../assets/editions/ed03-nachtwolf-schattenmond-thumb.webp';
import ed04 from '../assets/editions/ed04-mondweberin-totale-finsternis.webp';
import ed04Thumb from '../assets/editions/ed04-mondweberin-totale-finsternis-thumb.webp';

const BUILTIN_ART: Record<string, { image: string; thumb: string }> = {
  ed01: { image: ed01, thumb: ed01Thumb },
  ed02: { image: ed02, thumb: ed02Thumb },
  ed03: { image: ed03, thumb: ed03Thumb },
  ed04: { image: ed04, thumb: ed04Thumb },
};

export function editionImage(e: EditionDef): string | undefined {
  return (e.image && imageUrl(e.image.id)) || BUILTIN_ART[e.id]?.image;
}
export function editionThumb(e: EditionDef): string | undefined {
  return (e.image && imageUrl(e.image.id)) || BUILTIN_ART[e.id]?.thumb;
}

/** Editions the player uses (cardId → editionId), set by the app from the save. */
let EQUIPPED: Record<string, string> = {};
export function setEquippedEditions(map: Record<string, string>): void {
  EQUIPPED = map;
}
export function equippedEdition(cardId: string): EditionDef | null {
  const e = findEdition(EQUIPPED[cardId]);
  return e && e.cardId === cardId ? e : null;
}

/** Runenschmiede frame shown on the player's own cards (null = none), set by the app from the save. */
let FRAME: string | null = null;
export function setEquippedFrame(id: string | null): void {
  FRAME = id;
}
export function equippedFrame(): string | null {
  return FRAME;
}
