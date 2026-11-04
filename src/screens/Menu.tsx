import { RuneBadge } from '../components/RuneBadge';
import { Coin, CoinText } from '../components/Coin';
import { findRune } from '../game/runes';
import logoMark from '../assets/gridrune-mark.png';
import { GameIcon, GameIconName } from '../components/GameIcon';
import { CARDS, ownedActiveIds } from '../game/cards';
import { SaveData } from '../game/storage';
import { useState } from 'react';
import type { AiLevel } from '../game/ai';
import { AI_COINS } from '../game/rewards';

const LEVELS: { level: AiLevel; label: string; icon: GameIconName; text: string }[] = [
  { level: 'easy', label: 'Leicht', icon: 'leaf', text: 'spielt oft zufällig' },
  { level: 'medium', label: 'Normal', icon: 'sword', text: 'der klassische Gegner' },
  { level: 'hard', label: 'Schwer', icon: 'flame', text: 'denkt deine Antwort voraus' },
];

interface Props {
  save: SaveData;
  saveOk: boolean;
  /** Owner/Editor of the game page: may open the card administration. */
  isAdmin: boolean;
  /** Simple game against the computer with the chosen difficulty. */
  onPlay: (level: AiLevel) => void;
  onNavigate: (screen: 'collection' | 'deck' | 'rules' | 'shop' | 'admin' | 'league' | 'campaign') => void;
  /** Runes released for this viewer: shows the rune collection. */
  runes?: boolean;
  /** The equipped rune (shown on the Runen button). */
  equippedRune?: string | null;
  onToggleReducedMotion: () => void;
  /** Web version: the signed-in player's name, 'guest', or null (no accounts, e.g. claude.ai). */
  account?: string | 'guest' | null;
  onAccount?: () => void;
  /** Signed in: state of saving to the account. */
  sync?: 'saved' | 'saving' | 'waiting' | 'offline' | null;
  notice?: string;
  onNotice?: () => void;
  /** Signed in: online duels against real players. */
  onOnline?: () => void;
  /** Draft League (online when signed in, practice against the computer for everyone). */
  onDraft?: () => void;
  /** Signed in: the Weltboss-Raid. */
  onRaid?: () => void;
  /** The "Spielen" submenu is open (kept by the app, so finishing a game returns there). */
  playOpen?: boolean;
  onPlayOpen?: (open: boolean) => void;
}

export function Menu({ save, saveOk, isAdmin, onPlay, onNavigate, onToggleReducedMotion, runes, equippedRune = null, account = null, onAccount, sync = null, notice = '', onNotice, onOnline, onDraft, onRaid, playOpen = false, onPlayOpen }: Props) {
  const equipped = findRune(equippedRune);
  const [chooseLevel, setChooseLevel] = useState(false);
  const { wins, draws, losses } = save.stats;
  return (
    <main className="screen menu">
      <div className="logo">
        <h1 className="brand">
          <img className="brand-mark" src={logoMark} alt="" />
          <span className="brand-name">GridRune</span>
        </h1>
        <p className="tagline">Renne. Sammle. Erobere das Raster.</p>
      </div>

      {account && (
        <button type="button" className={`account-chip ${account === 'guest' ? 'guest' : ''}`} onClick={onAccount}>
          <GameIcon name="user" /> {account === 'guest' ? <>Gast · <b>Anmelden / Konto erstellen</b></> : <b>{account}</b>}
        </button>
      )}

      {notice && (
        <button type="button" className="menu-notice" onClick={onNotice}><CoinText text={notice} /> <b>OK</b></button>
      )}

      <div className="wallet" aria-label="Spielstand">
        <span><Coin /> {save.coins}</span>
        <span><GameIcon name="cards" label="Karten" /> {ownedActiveIds(save.unlocked).length}/{CARDS.length}</span>
        <span><GameIcon name="crown" label="Siege" /> {wins} · <GameIcon name="handshake" label="Unentschieden" /> {draws} · <GameIcon name="skull" label="Niederlagen" /> {losses}</span>
      </div>

      {playOpen ? (
        <nav className="menu-buttons menu-sub" aria-label="Spielen">
          <h2 className="menu-sub-title">Spielen</h2>
          <div className="rune-rule" aria-hidden="true">ᚠ ᚱ ᛟ ᚦ ᛉ</div>
          <button type="button" className={`btn btn-primary ${chooseLevel ? '' : 'btn-big'}`} aria-expanded={chooseLevel} onClick={() => setChooseLevel(!chooseLevel)}>
            <GameIcon name="run" /> Einfaches Spiel <span className="btn-sub">gegen die KI</span>
          </button>
          {chooseLevel && (
            <div className="level-pick" role="group" aria-label="Schwierigkeit wählen">
              {LEVELS.map((l) => (
                <button key={l.level} type="button" className={`btn level-btn level-${l.level}`} onClick={() => onPlay(l.level)}>
                  <span className="level-name"><GameIcon name={l.icon} /> {l.label}</span>
                  <span className="level-coins">Sieg <Coin /> {AI_COINS[l.level].win}</span>
                  <span className="level-text">{l.text}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-campaign" onClick={() => onNavigate('campaign')}><GameIcon name="map" /> Kampagne</button>
          {onOnline && <button type="button" className="btn btn-online" onClick={onOnline}><GameIcon name="swords" /> Online-Duell <span className="btn-sub">gegen echte Spieler</span></button>}
          {onDraft && <button type="button" className="btn btn-draft" onClick={onDraft}><GameIcon name="draft" /> Draft-Liga <span className="btn-sub">gleicher Pool für beide</span></button>}
          {onRaid && <button type="button" className="btn btn-raid" onClick={onRaid}><GameIcon name="raid" /> Weltboss-Raid <span className="btn-sub">alle gegen einen</span></button>}
          <button type="button" className="btn btn-league" onClick={() => onNavigate('league')}><GameIcon name="trophy" /> Rangliste <span className="btn-sub">Sieg = neue Karte</span></button>
          <button type="button" className="btn menu-back" onClick={() => { setChooseLevel(false); onPlayOpen?.(false); }}><GameIcon name="back" /> Zurück</button>
        </nav>
      ) : (
        <nav className="menu-buttons">
          <button type="button" className="btn btn-primary btn-big" onClick={() => onPlayOpen?.(true)}><GameIcon name="play" /> Spielen</button>
          <div className="rune-rule" aria-hidden="true">ᚠ ᚱ ᛟ ᚦ ᛉ</div>
          <button type="button" className="btn" onClick={() => onNavigate('shop')}><GameIcon name="shop" /> Shop <span className="btn-sub"><Coin /> {save.coins}</span></button>
          <button type="button" className="btn" onClick={() => onNavigate('collection')}><GameIcon name="book" /> Sammlung</button>
          <button type="button" className="btn btn-deck" onClick={() => onNavigate('deck')}>
            <GameIcon name="deck" /> Deck bearbeiten
            {runes && (equipped ? <span className="btn-sub"><RuneBadge rune={equipped} className="small" /></span> : <span className="btn-sub">ohne Rune</span>)}
          </button>
          <button type="button" className="btn" onClick={() => onNavigate('rules')}><GameIcon name="scroll" /> Regeln</button>
          {isAdmin && <button type="button" className="btn btn-admin" onClick={() => onNavigate('admin')}><GameIcon name="gear" /> Kartenverwaltung</button>}
        </nav>
      )}

      <label className="toggle">
        <input type="checkbox" checked={save.settings.reducedMotion} onChange={onToggleReducedMotion} />
        <span>Animationen reduzieren</span>
      </label>

      <p className="fineprint">
        {sync
          ? sync === 'offline'
            ? '⚠️ Keine Verbindung – dein Fortschritt ist auf diesem Gerät gesichert und wird gespeichert, sobald du wieder online bist.'
            : sync === 'saved' ? '☁️ Dein Spielstand ist in deinem Konto gespeichert – auf jedem Gerät.' : '☁️ Wird gespeichert …'
          : saveOk
          ? 'Dein Fortschritt wird nur in diesem Browser auf diesem Gerät gespeichert. Ohne Konto gibt es keine Sicherung auf anderen Geräten.'
          : '⚠️ Speichern ist in diesem Browser gerade nicht möglich (z. B. im privaten Modus). Fortschritt geht beim Schließen verloren.'}
      </p>
    </main>
  );
}
