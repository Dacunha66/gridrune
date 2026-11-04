// Class and terrain symbols as line icons (instead of the emojis 🌿🔥❄️🌲🌋 …), in the colours the cards use.
import { CLASS_ICON } from './cardIcons';
import { CardClass, Terrain } from '../game/effects';

export const TERRAIN_GLYPH: Record<Exclude<Terrain, 'normal'>, { color: string; path: string }> = {
  wald: { color: '#7ee08f', path: 'M12 2.5l5.5 7h-3l4.5 6h-14l4.5-6h-3zM12 15.5v6' },
  lava: { color: '#ffa040', path: 'M2.5 20.5l6-10 2.5 3 2-5 8.5 12zM11 5.5l1-3M15 6.5l2-2.5M8 6.5L6.5 4' },
  eis: { color: '#8fe3ff', path: CLASS_ICON.frost.path },
  schatten: { color: '#d1a8ff', path: CLASS_ICON.schatten.path },
  runen: { color: '#7dd3fc', path: 'M8 3v18M8 3l7 4.5L8 12l8 9' },
  schlacht: { color: '#f87171', path: 'M4 4l10 10M4 4h4M4 4v4M20 4L10 14M20 4h-4M20 4v4M7 17l-3 3M17 17l3 3' },
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
