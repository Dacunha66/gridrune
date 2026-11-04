// Class and terrain symbols as line icons (instead of the emojis 🌿🔥❄️🌲🌋 …), in the colours the cards use.
import { CLASS_ICON } from './cardIcons';
import { CardClass, Terrain } from '../game/effects';

/** Each terrain shows the symbol of the class it strengthens – the same one as in the card's crest
 * (Wald = Natur leaf, Lava = Feuer flame, Eis = Frost crystal, Schatten = moon, Runenfeld = Magier, Schlachtfeld = Krieger). */
export const TERRAIN_GLYPH: Record<Exclude<Terrain, 'normal'>, { color: string; path: string }> = {
  wald: CLASS_ICON.natur,
  lava: CLASS_ICON.feuer,
  eis: CLASS_ICON.frost,
  schatten: CLASS_ICON.schatten,
  runen: CLASS_ICON.magier,
  schlacht: CLASS_ICON.krieger,
};

export function ClassGlyph({ cls, className = '' }: { cls: CardClass; className?: string }) {
  const c = CLASS_ICON[cls];
  return (
    <svg className={`glyph ${className}`} viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={c.path} />
    </svg>
  );
}

export function TerrainGlyph({ terrain, className = '' }: { terrain: Terrain; className?: string }) {
  if (terrain === 'normal') return null;
  const t = TERRAIN_GLYPH[terrain];
  return (
    <svg className={`glyph ${className}`} viewBox="0 0 24 24" fill="none" stroke={t.color} strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={t.path} />
    </svg>
  );
}
