// The game's own symbols (24×24 line icons, engraved look) – used instead of emojis, so every device shows the
// same Grimoire style. Colour comes from `currentColor`; `.gi` in styles.css sets size and the rune glow.
export type GameIconName =
  | 'play' | 'shop' | 'book' | 'deck' | 'scroll' | 'gear' | 'map' | 'swords' | 'draft' | 'trophy' | 'raid' | 'back'
  | 'cards' | 'crown' | 'handshake' | 'skull' | 'user' | 'leaf' | 'sword' | 'flame' | 'run' | 'gift' | 'lock' | 'check' | 'close' | 'fast' | 'skip' | 'next';

const PATHS: Record<GameIconName, string> = {
  play: 'M14.5 3.5h6v6L9.5 20.5l-6-6zM5 13l6 6M3 21l3-3',
  shop: 'M5 8.5h14l-1.3 12H6.3zM9 8.5V7a3 3 0 0 1 6 0v1.5M9.5 13h5',
  book: 'M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0zM12 5.5V19',
  deck: 'M8 4h10.5v15H8zM5.5 6.5v14h10M11 9.5h4.5M11 13h4.5',
  scroll: 'M7 4h11a2 2 0 0 1 2 2v1h-4M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7M7 4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2M11.5 9h3.5M11.5 12.5h3.5',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1',
  map: 'M3.5 6l5.5-2 6 2 5.5-2v14l-5.5 2-6-2-5.5 2zM9 4v14M15 6v14',
  swords: 'M4 4l10 10M4 4h4M4 4v4M20 4L10 14M20 4h-4M20 4v4M7 17l-3 3M17 17l3 3M9 15l-2-2M15 15l2-2',
  draft: 'M9 3.5h7l-1 13H8zM5.5 6l3.5-.5M18.5 6L16 5.5M4.5 8l2.5 11.5 4.5-1M19.5 8L17 19.5l-4.5-1',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z',
  raid: 'M12 3c-4.5 0-7.5 3.2-7.5 7.5 0 2.6 1.3 4.6 3 5.8V20h9v-3.7c1.7-1.2 3-3.2 3-5.8C19.5 6.2 16.5 3 12 3zM9 11.5h.01M15 11.5h.01M10.5 20v-2.5M13.5 20v-2.5M4.5 4.5L7 7.5M19.5 4.5L17 7.5',
  back: 'M15 5l-7 7 7 7',
  cards: 'M7 3.5h10v17H7zM10 8h4M10 11.5h4',
  crown: 'M3.5 18.5h17M4.5 18.5L3.5 7.5l5 4 3.5-6.5 3.5 6.5 5-4-1 11',
  handshake: 'M2.5 11l4-4 4 2 3-2 4 1 4 3M6.5 7l-4 6 6 6 2-2M17.5 8l4 5-6 6-2-2M10.5 17l-3-3M13.5 15l-3-3M15.5 13l-3-3',
  skull: 'M12 3C7.6 3 4.5 6 4.5 10.2c0 2.6 1.3 4.5 3 5.6V20h9v-4.2c1.7-1.1 3-3 3-5.6C19.5 6 16.4 3 12 3zM9 11h.01M15 11h.01M11 15h2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  leaf: 'M5 19C5 10 11 4.5 20 4.5 20 13.5 14 19.5 6 19.5zM5 19.5l9-9',
  sword: 'M14.5 3.5h6v6L9.5 20.5l-6-6zM5 13l6 6M3 21l3-3',
  flame: 'M12 21.5c4 0 7-2.8 7-6.8 0-4-3-6-4-9.2-1.2 2-2.2 3-3.2 3 .2-3-1-5-2.8-6.5.2 4-4 7-4 12.5 0 4.2 3 7 7 7z',
  run: 'M13.5 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 21l3-6 3 2.5V22M10 15l1.5-6 4 3.5 3.5.5M11.5 9L8 10.5 6.5 14',
  gift: 'M4 9.5h16v4H4zM5.5 13.5v7h13v-7M12 9.5v11M12 9.5C10 9.5 7.5 9 7.5 7a2 2 0 0 1 4.5-.5c.5-1.5 4.5-2 4.5.5 0 2-2.5 2.5-4.5 2.5',
  lock: 'M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M4.5 12.5l5 5 10-11',
  close: 'M6 6l12 12M18 6L6 18',
  fast: 'M4 6l7 6-7 6zM13 6l7 6-7 6z',
  skip: 'M4 6l7 6-7 6zM12 6l7 6-7 6zM20.5 5.5v13',
  next: 'M9 5l7 7-7 7',
};

export function GameIcon({ name, className = '', label }: { name: GameIconName; className?: string; label?: string }) {
  return (
    <svg className={`gi ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={PATHS[name]} />
    </svg>
  );
}
