// A rune as a round medallion (uploaded icon or its rune letter), matching the premium card style.
import { imageUrl } from '../game/catalog';
import { DesignImage } from './DesignArt';
import { findRune, type RuneDef } from '../game/runes';

export function RuneBadge({ rune, used, className = '' }: { rune: RuneDef; used?: boolean; className?: string }) {
  const src = rune.icon ? imageUrl(rune.icon.id) : undefined;
  return (
    <span className={`rune-badge rarity-${rune.rarity} ${used ? 'used' : ''} ${className}`} aria-hidden="true">
      {src && rune.icon ? <span className="rune-img"><DesignImage src={src} fit={rune.icon.fit} /></span> : <span className="rune-glyph">{rune.glyph}</span>}
      {used && <span className="rune-used">✓</span>}
    </span>
  );
}

/** "Your rune vs. the opponent's" as two round buttons with names (briefing, league). */
export function RuneMatchup({ player, cpu, note }: { player: string | null; cpu: string | null; note?: string }) {
  const side = (id: string | null, label: string, cls: string) => {
    const r = findRune(id);
    return (
      <span className={`rune-side ${cls}`}>
        {r ? <RuneBadge rune={r} /> : <span className="rune-badge none" aria-hidden="true"><span className="rune-glyph">–</span></span>}
        <span><small className="muted">{label}</small><b>{r ? r.name : 'keine Rune'}</b></span>
      </span>
    );
  };
  return (
    <div className="rune-matchup">
      <div className="rune-matchup-row">{side(player, 'Deine Rune', 'mine')}{side(cpu, 'Gegner', 'theirs')}</div>
      {note && <p className="muted small">{note}</p>}
    </div>
  );
}
