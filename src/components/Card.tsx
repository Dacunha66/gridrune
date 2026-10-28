import { CSSProperties } from 'react';
import { CardDef, RARITY_LABEL, getCard } from '../game/cards';
import type { Side } from '../game/battle';
import { CLASS_INFO, EFFECTS } from '../game/effects';
import { CLASS_ICON, EFFECT_ICON, Icon, SHIELD_PATH } from './cardIcons';

export type CardBadge = 'deck' | 'discovery' | null;

interface Props {
  id: string;
  /** Only on the board: thin blue/red owner ring inside the card edge. */
  owner?: Side;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  locked?: boolean;
  badge?: CardBadge;
  /** Kind of discovery marker: "NEU" (not owned yet), "★" (owned), "Neutral" (league). */
  badgeText?: string;
  selected?: boolean;
  showName?: boolean;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  /** Added to all four values (e.g. -1 after a stumble); values stay within 1–10. */
  mod?: number;
  /** Show this card data instead of looking up `id` (live preview of unsaved cards). */
  def?: CardDef;
  /** Effective values in the duel [top, right, bottom, left]; higher than printed = green ink, lower = orange number. */
  values?: readonly number[];
  /** Magische Barriere shield is up. */
  shield?: boolean;
  /** A terrain bonus is active right now (soft green glow inside the picture). */
  terrainGlow?: boolean;
  /** Large view: parchment with name and effect text, rarity gem under the picture. */
  detail?: boolean;
}

const DIRS = ['top', 'right', 'bottom', 'left'] as const;

/** Ink blot behind a value (0–100 box, a few splashes outside). */
const BLOT = 'M50 9 C61 5 69 14 77 11 C88 9 93 21 88 31 C95 39 96 52 89 60 C93 72 84 85 72 84 C66 94 51 95 42 89 C30 93 18 87 16 75 C6 69 5 55 12 47 C5 37 10 22 22 20 C28 10 39 9 50 9 Z';

/** Brass gear around the class symbol (12 teeth). */
const GEAR = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const w = (Math.PI / 12) * 0.55;
    for (const [ang, r] of [[a - w, 41], [a - w * 0.6, 49], [a + w * 0.6, 49], [a + w, 41]]) {
      pts.push(`${(50 + Math.cos(ang) * r).toFixed(1)} ${(50 + Math.sin(ang) * r).toFixed(1)}`);
    }
  }
  return `M${pts.join(' L')} Z`;
})();

/** A value in its ink blot. Green ink = raised by an effect, orange number = lowered. */
function Value({ dir, value, delta, locked }: { dir: (typeof DIRS)[number]; value: number; delta: number; locked?: boolean }) {
  return (
    <span className={`val val-${dir} ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
      <svg className="blot" viewBox="0 0 100 100" aria-hidden="true">
        <path d={BLOT} />
        <circle cx="90" cy="14" r="3.2" />
        <circle cx="9" cy="86" r="2.6" />
        <circle cx="95" cy="78" r="1.8" />
      </svg>
      <span className="v">{locked ? '?' : value}</span>
    </span>
  );
}

/** Faceted rarity gem in a brass setting (like the gem under the picture of collectible card games). */
function Gem({ mythic }: { mythic: boolean }) {
  const fill = mythic ? 'url(#gem-rainbow)' : 'var(--rc)';
  return (
    <svg className="gem" viewBox="0 0 100 100" aria-hidden="true">
      {mythic && (
        <defs>
          <linearGradient id="gem-rainbow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff6b8b" /><stop offset=".3" stopColor="#ffd36b" /><stop offset=".55" stopColor="#8dff9a" />
            <stop offset=".8" stopColor="#6bc5ff" /><stop offset="1" stopColor="#c99bff" />
          </linearGradient>
        </defs>
      )}
      <ellipse cx="50" cy="50" rx="47" ry="49" fill="#5a3f1c" stroke="#d9b66e" strokeWidth="4" />
      <polygon points="50,10 80,30 80,70 50,90 20,70 20,30" fill={fill} />
      <polygon points="50,10 20,30 35,40 50,28" fill="rgba(255,255,255,.55)" />
      <polygon points="50,10 80,30 65,40 50,28" fill="rgba(255,255,255,.28)" />
      <polygon points="80,70 50,90 50,72 65,60" fill="rgba(0,0,0,.35)" />
      <polygon points="20,70 50,90 50,72 35,60" fill="rgba(0,0,0,.18)" />
      <polygon points="35,40 65,40 65,60 50,72 35,60" fill={fill} stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
      <ellipse cx="42" cy="42" rx="6" ry="4" fill="rgba(255,255,255,.75)" />
    </svg>
  );
}

export function Card({
  id, owner, size = 'md', locked, badge, badgeText = 'NEU', selected, showName, className = '', onClick, ariaLabel, mod = 0, def, values, shield,
  terrainGlow, detail,
}: Props) {
  const c = def ?? getCard(id);
  const effective = (i: number) => (values ? values[i] : Math.min(10, Math.max(1, c[DIRS[i]] + mod)));
  const cls = c.cls ? CLASS_ICON[c.cls] : null;
  const effect = c.effect ? EFFECTS[c.effect] : null;
  const style = { '--hue': c.hue, '--cls': cls?.color ?? '#f3c77a' } as CSSProperties;
  const classes = [
    'card', `card-${size}`, `rarity-${c.rarity}`,
    owner ? `owner-${owner}` : '', locked ? 'locked' : '', selected ? 'selected' : '',
    badge === 'discovery' ? 'discovery' : '', detail ? 'card-detail' : '', terrainGlow ? 'terrain-glow' : '', className,
  ].join(' ');
  const label = ariaLabel ?? (locked
    ? `Gesperrte Karte, ${RARITY_LABEL[c.rarity]}`
    : `${c.name}${mod < 0 ? ` (geschwächt ${mod})` : ''}, ${RARITY_LABEL[c.rarity]}${c.cls ? `, ${CLASS_INFO[c.cls].label}` : ''}${effect ? `, Effekt ${effect.name}` : ''}, oben ${effective(0)}, rechts ${effective(1)}, unten ${effective(2)}, links ${effective(3)}${shield ? ', Schild aktiv' : ''}`);
  const content = (
    <>
      <span className="card-frame" aria-hidden="true">
        <i className="rivet r1" /><i className="rivet r2" /><i className="rivet r3" /><i className="rivet r4" />
      </span>
      <span className="art" aria-hidden="true">
        {locked ? <span className="art-emoji">🔒</span> : c.image ? <img src={c.image} alt="" draggable={false} /> : <span className="art-emoji">{c.art}</span>}
      </span>
      {detail && !locked && (
        <span className="parchment">
          <span className="pm-name">{c.name}</span>
          <span className="pm-text">{effect ? effect.text : `${c.cls ? CLASS_INFO[c.cls].label : 'Karte'} · kein Spezialeffekt`}</span>
        </span>
      )}
      {DIRS.map((d, i) => <Value key={d} dir={d} value={effective(i)} delta={values ? effective(i) - c[d] : mod} locked={locked} />)}
      {!locked && (
        <span className="gear" aria-hidden="true">
          <svg className="gear-wheel" viewBox="0 0 100 100">
            <path d={GEAR} fill="#8a6a3a" stroke="#3a2812" strokeWidth="2" />
            <circle cx="50" cy="50" r="34" fill="#b08a4c" stroke="#3a2812" strokeWidth="2" />
            <circle cx="50" cy="50" r="27" fill="#2a1f12" stroke="#d9b66e" strokeWidth="2" />
          </svg>
          {cls && <Icon className="gear-icon" path={cls.path} color={cls.color} />}
        </span>
      )}
      {!locked && <Gem mythic={c.rarity === 'mythic'} />}
      {!detail && !locked && effect && c.effect && (
        <span className="brass fx-icon" aria-hidden="true"><Icon path={EFFECT_ICON[c.effect]} color="#ffd34d" fill="rgba(255,211,77,.25)" /></span>
      )}
      {shield && !locked && (
        <span className="brass shield-icon" aria-hidden="true"><Icon path={SHIELD_PATH} color="#e0f2fe" fill="rgba(125,211,252,.55)" /></span>
      )}
      {owner && <span className="owner-ring" aria-hidden="true" />}
      {badge === 'discovery' && (
        // Small corner symbol – never on top of a value.
        <span className={`badge ${badgeText === 'Neutral' ? 'badge-neutral' : badgeText === 'NEU' ? 'badge-new' : ''}`} title={badgeText} aria-label={badgeText === 'Neutral' ? 'neutrale Entdeckung' : badgeText === 'NEU' ? 'neue Karte' : 'Entdeckung'}>
          {badgeText === 'Neutral' ? '◆' : '★'}
        </span>
      )}
      {showName && <span className="name">{locked ? '???' : c.name}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={classes} style={style} onClick={onClick} aria-label={label} aria-pressed={selected}>
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style} role="img" aria-label={label}>
      {content}
    </div>
  );
}
