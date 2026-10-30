import { CSSProperties, useState } from 'react';
import { CardDef, RARITY_LABEL, getCard } from '../game/cards';
import type { Side } from '../game/battle';
import { CLASS_INFO, CardClass, EFFECTS } from '../game/effects';
import { AbilityMedallion, CLASS_ICON, ClassShield, EFFECT_ICON, Icon, SHIELD_PATH } from './cardIcons';
import { CardStyle, useCardStyle } from '../game/cardStyle';

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
  /** Design test: show this card design instead of the one chosen for this device. */
  styleOverride?: CardStyle;
  /** Printed values in the card's current orientation (for the bonus/malus colours of a turned card). */
  base?: readonly number[];
  /** Orientation in quarter turns clockwise (shows a small ↻ marker). */
  rot?: number;
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
  terrainGlow, detail, styleOverride, base, rot = 0,
}: Props) {
  const deviceStyle = useCardStyle();
  const cardStyle = styleOverride ?? deviceStyle;
  const premium = cardStyle === 'premium';
  const c = def ?? getCard(id);
  const effective = (i: number) => (values ? values[i] : Math.min(10, Math.max(1, c[DIRS[i]] + mod)));
  const cls = c.cls ? CLASS_ICON[c.cls] : null;
  const effect = c.effect ? EFFECTS[c.effect] : null;
  const style = { '--hue': c.hue, '--cls': cls?.color ?? '#f3c77a' } as CSSProperties;
  const classes = [
    'card', `card-${size}`, `rarity-${c.rarity}`, `cs-${cardStyle}`, premium ? `cs-prem cls-${c.cls ?? 'none'}` : '',
    owner ? `owner-${owner}` : '', locked ? 'locked' : '', selected ? 'selected' : '',
    badge === 'discovery' ? 'discovery' : '', detail ? 'card-detail' : '', terrainGlow ? 'terrain-glow' : '', className,
  ].join(' ');
  const label = ariaLabel ?? (locked
    ? `Gesperrte Karte, ${RARITY_LABEL[c.rarity]}`
    : `${c.name}${mod < 0 ? ` (geschwächt ${mod})` : ''}, ${RARITY_LABEL[c.rarity]}${c.cls ? `, ${CLASS_INFO[c.cls].label}` : ''}${effect ? `, Effekt ${effect.name}` : ''}, oben ${effective(0)}, rechts ${effective(1)}, unten ${effective(2)}, links ${effective(3)}${shield ? ', Schild aktiv' : ''}${rot % 4 ? `, gedreht um ${(rot % 4) * 90} Grad` : ''}`);
  const v2 = premium;
  const content = v2 ? (
    <>
      <span className="cs-frame" aria-hidden="true" />
      {premium && <ClassFrame cls={c.cls} />}
      <span className="art" aria-hidden="true">
        {locked ? <span className="art-emoji">🔒</span> : <CardArt image={size === 'lg' || detail ? c.image : c.thumb ?? c.image} art={c.art} />}
      </span>
      {DIRS.map((d, i) => {
        const delta = values ? effective(i) - (base ? base[i] : c[d]) : mod;
        return (
          <span key={d} className={`pv pv-${d} ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`} aria-hidden="true">
            <span className="v">{locked ? '?' : effective(i)}</span>
          </span>
        );
      })}
      {!locked && c.cls && <span className="cs-cls" data-sym={`cls:${c.cls}`}><ClassShield cls={c.cls} /></span>}
      {!locked && c.effect && <span className="cs-fx" data-sym={`fx:${c.effect}`}><AbilityMedallion effect={c.effect} /></span>}
      {!locked && <span className="cs-name" style={{ '--nl': Math.max(8, c.name.length) } as CSSProperties}>{c.name}</span>}
      {rot % 4 !== 0 && !locked && <span className="cs-rot" aria-hidden="true">↻{(rot % 4) * 90}°</span>}
      {shield && !locked && (
        <span className="cs-shield" aria-hidden="true"><Icon path={SHIELD_PATH} color="#e0f2fe" fill="rgba(125,211,252,.55)" /></span>
      )}
      {owner && <span className="owner-ring" aria-hidden="true" />}
      {badge === 'discovery' && (
        <span className={`badge ${badgeText === 'Neutral' ? 'badge-neutral' : badgeText === 'NEU' ? 'badge-new' : ''}`} title={badgeText} aria-label={badgeText === 'Neutral' ? 'neutrale Entdeckung' : badgeText === 'NEU' ? 'neue Karte' : 'Entdeckung'}>
          {badgeText === 'Neutral' ? '◆' : '★'}
        </span>
      )}
      {showName && <span className="name">{locked ? '???' : c.name}</span>}
    </>
  ) : (
    <>
      <span className="card-frame" aria-hidden="true">
        <i className="rivet r1" /><i className="rivet r2" /><i className="rivet r3" /><i className="rivet r4" />
      </span>
      <span className="art" aria-hidden="true">
        {locked ? <span className="art-emoji">🔒</span> : <CardArt image={size === 'lg' || detail ? c.image : c.thumb ?? c.image} art={c.art} />}
      </span>
      {detail && !locked && (
        <span className="parchment">
          <span className="pm-name">{c.name}</span>
          <span className="pm-text">{effect ? effect.text : `${c.cls ? CLASS_INFO[c.cls].label : 'Karte'} · kein Spezialeffekt`}</span>
        </span>
      )}
      {DIRS.map((d, i) => <Value key={d} dir={d} value={effective(i)} delta={values ? effective(i) - (base ? base[i] : c[d]) : mod} locked={locked} />)}
      {!locked && (
        <span className="gear" aria-hidden="true" data-sym={c.cls ? `cls:${c.cls}` : undefined}>
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
        <span className="brass fx-icon" aria-hidden="true" data-sym={`fx:${c.effect}`}><Icon path={EFFECT_ICON[c.effect]} color="#ffd34d" fill="rgba(255,211,77,.25)" /></span>
      )}
      {rot % 4 !== 0 && !locked && <span className="cs-rot" aria-hidden="true">↻{(rot % 4) * 90}°</span>}
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

/** Hybrid Premium: inner frame in the material of the class (wood, glowing iron, silver, obsidian, steel, arcane). */
function ClassFrame({ cls }: { cls?: CardClass }) {
  return (
    <span className="cf" aria-hidden="true">
      <svg className="cf-orn cf-bl" viewBox="0 0 20 20"><path d={ORNAMENT[cls ?? 'krieger']} /></svg>
      <svg className="cf-orn cf-br" viewBox="0 0 20 20"><path d={ORNAMENT[cls ?? 'krieger']} /></svg>
    </span>
  );
}

/** Small corner ornament per class (bottom corners only – the top corners hold class and ability). */
const ORNAMENT: Record<CardClass, string> = {
  natur: 'M2 18C2 10 7 4 15 3c-1 5-4 8-8 9M5 15c2-1 4-1 6 1', // leafy sprig
  feuer: 'M2 18l3-7 2 4 3-9 2 6 3-4 2 10z', // embers
  frost: 'M2 18L10 4l8 14M6 11h8M10 4v14', // ice crystal
  schatten: 'M2 18l5-12 4 6 3-9 4 15z', // obsidian shards
  krieger: 'M3 17h14M3 17V7M3 7l4 4M8 15a1.4 1.4 0 1 0 0.01 0M14 15a1.4 1.4 0 1 0 0.01 0', // riveted bracket
  magier: 'M3 17l4-12 4 12M5 12h4M13 5v12l4-4', // runes
};

/** Card picture; if it cannot be loaded (missing or offline), the card shows its emoji instead. */
function CardArt({ image, art }: { image?: string; art: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!image || failed === image) return <span className="art-emoji">{art}</span>;
  return <img src={image} alt="" draggable={false} onError={() => setFailed(image)} />;
}
