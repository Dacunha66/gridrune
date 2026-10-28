// Symbols for classes and special effects (24×24 line icons), plus the class colours used on cards.
import type { CardClass, EffectId } from '../game/effects';

export const SHIELD_PATH = 'M12 2.5l7.5 3v5.5c0 5-3.2 8.8-7.5 10.5-4.3-1.7-7.5-5.5-7.5-10.5V5.5z';

export const CLASS_ICON: Record<CardClass, { color: string; path: string }> = {
  krieger: { color: '#f3c77a', path: 'M14.5 4.5L20 4V9.5L9.5 20 4 14.5zM5 13l6 6M3 21l3-3' },
  magier: { color: '#c4a8ff', path: 'M12 2.5l5.5 7.5L12 21.5 6.5 10zM6.5 10h11M12 2.5v19' },
  natur: { color: '#7ee08f', path: 'M5 19C5 10 11 4.5 20 4.5 20 13.5 14 19.5 6 19.5zM5 19.5l9-9' },
  feuer: { color: '#ffa040', path: 'M12 21.5c4 0 7-2.8 7-6.8 0-4-3-6-4-9.2-1.2 2-2.2 3-3.2 3 .2-3-1-5-2.8-6.5.2 4-4 7-4 12.5 0 4.2 3 7 7 7z' },
  frost: { color: '#8fe3ff', path: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 3.8l3 2.2 3-2.2M9 20.2l3-2.2 3 2.2' },
  schatten: { color: '#d1a8ff', path: 'M19.5 14.5A8 8 0 1 1 9.5 4.5a6.4 6.4 0 0 0 10 10z' },
};

export const EFFECT_ICON: Record<EffectId, string> = {
  kampfgeist: 'M4 4l9.5 9.5M4 4h4.5M4 4v4.5M20 4l-9.5 9.5M20 4h-4.5M20 4v4.5M6.5 17.5l-3 3M17.5 17.5l3 3M8.5 15.5l-2-2M15.5 15.5l2-2',
  schildwall: SHIELD_PATH + 'M9 12h6',
  arkane_kraft: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z',
  magische_barriere: SHIELD_PATH + 'M12 8.5v7M8.5 12h7',
  wurzelkraft: 'M12 3l6 8.5h-3.5L19 18H5l4.5-6.5H6zM12 18v3',
  naturbund: 'M3.5 14C3.5 9 7.5 5 12.5 5c0 5-4 9-9 9zM20.5 10c0 5-4 9-9 9 0-5 4-9 9-9z',
  flammenherz: 'M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.8a4.2 4.2 0 0 1 7.5 2.4c0 5.7-7.5 10.3-7.5 10.3z',
  frostpanzer: SHIELD_PATH + 'M12 8v8M8.6 10l6.8 4M8.6 14l6.8-4',
  schattenmantel: 'M12 3c-4 0-7 4-7 9v8.5l2.4-1.6 2.3 1.6 2.3-1.6 2.3 1.6 2.3-1.6 2.4 1.6V12c0-5-3-9-7-9zM9.5 11.5h.01M14.5 11.5h.01',
  schwaechender_blick: 'M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
};

export function Icon({ path, className, color, fill = 'none' }: { path: string; className?: string; color?: string; fill?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill={fill} stroke={color ?? 'currentColor'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}
