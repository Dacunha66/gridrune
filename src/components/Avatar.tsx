// A player's avatar: round, the creature on its colour, framed by rarity (silver, gold, glowing rune frame).
import { CSSProperties } from 'react';
import { findAvatar } from '../game/avatars';

export function Avatar({ id, size = 40, locked = false, className = '', label }: { id: string | null | undefined; size?: number; locked?: boolean; className?: string; label?: string }) {
  const a = findAvatar(id);
  const style = { '--av-size': `${size}px`, '--av-a': a.bg[0], '--av-b': a.bg[1] } as CSSProperties;
  return (
    <span className={`avatar frame-${a.frame} ${locked ? 'locked' : ''} ${className}`} style={style} role="img" aria-label={label ?? `Avatar ${a.name}`}>
      <span className="avatar-art" aria-hidden="true">{a.art}</span>
    </span>
  );
}
