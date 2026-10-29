// A rune as a round medallion (uploaded icon or its rune letter), matching the premium card style.
import { imageUrl } from '../game/catalog';
import { DesignImage } from './DesignArt';
import type { RuneDef } from '../game/runes';

export function RuneBadge({ rune, used, className = '' }: { rune: RuneDef; used?: boolean; className?: string }) {
  const src = rune.icon ? imageUrl(rune.icon.id) : undefined;
  return (
    <span className={`rune-badge rarity-${rune.rarity} ${used ? 'used' : ''} ${className}`} aria-hidden="true">
      {src && rune.icon ? <span className="rune-img"><DesignImage src={src} fit={rune.icon.fit} /></span> : <span className="rune-glyph">{rune.glyph}</span>}
      {used && <span className="rune-used">✓</span>}
    </span>
  );
}
