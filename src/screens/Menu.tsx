import logoMark from '../assets/gridrune-mark.png';
import logoWord from '../assets/gridrune-wordmark.png';
import { CARDS, ownedActiveIds } from '../game/cards';
import { SaveData } from '../game/storage';

interface Props {
  save: SaveData;
  saveOk: boolean;
  /** Owner/Editor of the game page: may open the card administration. */
  isAdmin: boolean;
  onPlay: () => void;
  onNavigate: (screen: 'collection' | 'deck' | 'rules' | 'shop' | 'admin' | 'league') => void;
  onToggleReducedMotion: () => void;
}

export function Menu({ save, saveOk, isAdmin, onPlay, onNavigate, onToggleReducedMotion }: Props) {
  const { wins, draws, losses } = save.stats;
  return (
    <main className="screen menu">
      <div className="logo">
        <h1 className="brand">
          <img className="brand-mark" src={logoMark} alt="" />
          <img className="brand-word" src={logoWord} alt="GridRune" />
        </h1>
        <p className="tagline">Renne. Sammle. Erobere das Raster.</p>
      </div>

      <div className="wallet" aria-label="Spielstand">
        <span>🪙 {save.coins}</span>
        <span>🃏 {ownedActiveIds(save.unlocked).length}/{CARDS.length}</span>
        <span>🏆 {wins} · 🤝 {draws} · 💀 {losses}</span>
      </div>

      <nav className="menu-buttons">
        <button type="button" className="btn btn-primary btn-big" onClick={onPlay}>▶ Spielen</button>
        <button type="button" className="btn btn-league" onClick={() => onNavigate('league')}>🏆 Collection League <span className="btn-sub">Test</span></button>
        <button type="button" className="btn" onClick={() => onNavigate('shop')}>🛒 Shop <span className="btn-sub">🪙 {save.coins}</span></button>
        <button type="button" className="btn" onClick={() => onNavigate('collection')}>📚 Sammlung</button>
        <button type="button" className="btn" onClick={() => onNavigate('deck')}>🗂️ Deck bearbeiten</button>
        <button type="button" className="btn" onClick={() => onNavigate('rules')}>📜 Regeln</button>
        {isAdmin && <button type="button" className="btn btn-admin" onClick={() => onNavigate('admin')}>🛠️ Kartenverwaltung</button>}
      </nav>

      <label className="toggle">
        <input type="checkbox" checked={save.settings.reducedMotion} onChange={onToggleReducedMotion} />
        <span>Animationen reduzieren</span>
      </label>

      <p className="fineprint">
        {saveOk
          ? 'Dein Fortschritt wird nur in diesem Browser auf diesem Gerät gespeichert. Ohne Konto gibt es keine Sicherung auf anderen Geräten.'
          : '⚠️ Speichern ist in diesem Browser gerade nicht möglich (z. B. im privaten Modus). Fortschritt geht beim Schließen verloren.'}
      </p>
    </main>
  );
}
