import { RuneBadge } from '../components/RuneBadge';
import { Avatar } from '../components/Avatar';
import { Coin, CoinText } from '../components/Coin';
import { findRune } from '../game/runes';
import { LogoMark } from '../components/LogoMark';
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
  /** Erfolge: how many rewards are ready to collect (signed in). */
  questsReady?: number;
  /** The signed-in player's avatar (shown instead of the account icon). */
  avatar?: string | null;
  /** Open tab (kept by the app across Shop/Erfolge). */
  tab?: MenuTab;
  onTab?: (t: MenuTab) => void;
  /** Opens the avatar choice (signed in). */
  onAvatars?: () => void;
  onQuests?: () => void;
  /** "Dein nächster Schritt": what the player can do next (campaign, quests, rewards). */
  nextSteps?: NextStep[];
}

export interface NextStep {
  icon: GameIconName;
  title: string;
  sub: string;
  /** 0–1: progress bar under the line. */
  progress?: number;
  onClick: () => void;
}

export type MenuTab = 'start' | 'cards' | 'more';
/** The tab shown as active in the bottom bar (Shop and Erfolge are their own screens). */
export type TabBarItem = MenuTab | 'shop' | 'quests';

/** The bottom bar of the main menu – also under Shop and Erfolge, so it never disappears there. */
export function MenuTabBar({ active, onTab, questsReady = 0, showQuests }: { active: TabBarItem | null; onTab: (t: TabBarItem) => void; questsReady?: number; showQuests: boolean }) {
  const cls = (t: TabBarItem) => `menu-tab ${active === t ? 'on' : ''}`;
  return (
    <nav className="menu-tabs" aria-label="Bereiche">
      <button type="button" className={cls('start')} aria-current={active === 'start' ? 'page' : undefined} onClick={() => onTab('start')}><GameIcon name="play" /><span>Start</span></button>
      <button type="button" className={cls('cards')} aria-current={active === 'cards' ? 'page' : undefined} onClick={() => onTab('cards')}><GameIcon name="cards" /><span>Karten</span></button>
      <button type="button" className={cls('shop')} aria-current={active === 'shop' ? 'page' : undefined} onClick={() => onTab('shop')}><GameIcon name="shop" /><span>Shop</span></button>
      {showQuests && (
        <button type="button" className={cls('quests')} aria-current={active === 'quests' ? 'page' : undefined} onClick={() => onTab('quests')}>
          <GameIcon name="trophy" /><span>Erfolge</span>{questsReady > 0 && <b className="menu-tab-badge" aria-label={`${questsReady} bereit`}>{questsReady}</b>}
        </button>
      )}
      <button type="button" className={cls('more')} aria-current={active === 'more' ? 'page' : undefined} onClick={() => onTab('more')}><GameIcon name="gear" /><span>Mehr</span></button>
    </nav>
  );
}

export function Menu({ save, saveOk, isAdmin, onPlay, onNavigate, onToggleReducedMotion, runes, equippedRune = null, account = null, onAccount, sync = null, notice = '', onNotice, onOnline, onDraft, onRaid, playOpen = false, onPlayOpen, questsReady = 0, onQuests, nextSteps = [], avatar = null, tab: tabProp, onTab, onAvatars }: Props) {
  const equipped = findRune(equippedRune);
  const [chooseLevel, setChooseLevel] = useState(false);
  // The open tab is kept by the app, so coming back from Shop or Erfolge opens the tab chosen in the bar.
  const [ownTab, setOwnTab] = useState<MenuTab>('start');
  const tab = tabProp ?? ownTab;
  const setTab = (t: MenuTab) => (onTab ? onTab(t) : setOwnTab(t));
  const { wins, draws, losses } = save.stats;
  const owned = ownedActiveIds(save.unlocked).length;

  const playMenu = (
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
      <button type="button" className="btn btn-campaign" onClick={() => onNavigate('campaign')}><GameIcon name="map" /> Kampagne <span className="btn-sub">Welten und Bosse</span></button>
      {onOnline && <button type="button" className="btn btn-online" onClick={onOnline}><GameIcon name="swords" /> Online-Duell <span className="btn-sub">gegen echte Spieler</span></button>}
      {onDraft && <button type="button" className="btn btn-draft" onClick={onDraft}><GameIcon name="draft" /> Draft-Liga <span className="btn-sub">gleicher Pool für beide</span></button>}
      {onRaid && <button type="button" className="btn btn-raid" onClick={onRaid}><GameIcon name="raid" /> Weltboss-Raid <span className="btn-sub">alle gegen einen</span></button>}
      <button type="button" className="btn btn-league" onClick={() => onNavigate('league')}><GameIcon name="trophy" /> Rangliste <span className="btn-sub">Sieg = neue Karte</span></button>
      <button type="button" className="btn menu-back" onClick={() => { setChooseLevel(false); onPlayOpen?.(false); }}><GameIcon name="back" /> Zurück</button>
    </nav>
  );

  return (
    <main className="screen menu menu-v2">
      <header className="menu-top">
        <span className="menu-brand"><LogoMark className="menu-mark" /> <span>GridRune</span></span>
        <span className="menu-top-right">
          <span className="menu-coins" aria-label={`${save.coins} Münzen`}><Coin /> {save.coins}</span>
          {account && (
            <button type="button" className={`menu-account ${account === 'guest' ? 'guest' : ''}`} onClick={onAccount} aria-label={account === 'guest' ? 'Anmelden oder Konto erstellen' : `Konto ${account}`}>
              {avatar && account !== 'guest' ? <Avatar id={avatar} size={34} /> : <GameIcon name="user" />}{account === 'guest' && <span>Anmelden</span>}
            </button>
          )}
        </span>
      </header>

      {notice && (
        <button type="button" className="menu-notice" onClick={onNotice}><CoinText text={notice} /> <b>OK</b></button>
      )}

      <div className="menu-main">
        {playOpen ? playMenu : tab === 'start' ? (
          <>
            <section className="menu-hero">
              <p className="tagline">Renne. Sammle. Erobere das Raster.</p>
              <button type="button" className="btn btn-primary menu-play" onClick={() => onPlayOpen?.(true)}>
                <span className="menu-play-title"><GameIcon name="play" /> Spielen</span>
                <span className="menu-play-sub">Duell gegen die KI · Kampagne{onOnline ? ' · Online' : ''}</span>
              </button>
            </section>
            {nextSteps.length > 0 && (
              <section className="menu-next" aria-label="Dein nächster Schritt">
                <h2>Dein nächster Schritt</h2>
                {nextSteps.map((n) => (
                  <button key={n.title} type="button" className="menu-step" onClick={n.onClick}>
                    <span className="menu-step-icon"><GameIcon name={n.icon} /></span>
                    <span className="menu-step-text">
                      <b>{n.title}</b>
                      <small>{n.sub}</small>
                      {n.progress !== undefined && <span className="menu-step-bar"><i style={{ width: `${Math.round(Math.min(1, n.progress) * 100)}%` }} /></span>}
                    </span>
                    <GameIcon name="next" className="menu-step-go" />
                  </button>
                ))}
              </section>
            )}
          </>
        ) : tab === 'cards' ? (
          <nav className="menu-buttons menu-sub" aria-label="Karten">
            <h2 className="menu-sub-title">Deine Karten</h2>
            <p className="muted">{owned} von {CARDS.length} Karten gesammelt</p>
            <button type="button" className="btn btn-big" onClick={() => onNavigate('collection')}><GameIcon name="book" /> Sammlung <span className="btn-sub">alle Karten ansehen</span></button>
            <button type="button" className="btn btn-big btn-deck" onClick={() => onNavigate('deck')}>
              <GameIcon name="deck" /> Deck bearbeiten
              {runes && (equipped ? <span className="btn-sub"><RuneBadge rune={equipped} className="small" /></span> : <span className="btn-sub">ohne Rune</span>)}
            </button>
          </nav>
        ) : (
          <nav className="menu-buttons menu-sub" aria-label="Mehr">
            <h2 className="menu-sub-title">Mehr</h2>
            <div className="wallet" aria-label="Statistik">
              <span><GameIcon name="crown" label="Siege" /> {wins} Siege</span>
              <span><GameIcon name="handshake" label="Unentschieden" /> {draws}</span>
              <span><GameIcon name="skull" label="Niederlagen" /> {losses}</span>
            </div>
            {account && <button type="button" className="btn" onClick={onAccount}><GameIcon name="user" /> {account === 'guest' ? 'Anmelden / Konto erstellen' : 'Konto'}</button>}
            {onAvatars && <button type="button" className="btn" onClick={onAvatars}>{avatar ? <Avatar id={avatar} size={24} /> : <GameIcon name="user" />} Avatar wählen</button>}
            <button type="button" className="btn" onClick={() => onNavigate('rules')}><GameIcon name="scroll" /> Regeln</button>
            {isAdmin && <button type="button" className="btn btn-admin" onClick={() => onNavigate('admin')}><GameIcon name="gear" /> Kartenverwaltung</button>}
            <label className="toggle">
              <input type="checkbox" checked={save.settings.reducedMotion} onChange={onToggleReducedMotion} />
              <span>Animationen reduzieren</span>
            </label>
            <p className="fineprint">
              {sync
                ? sync === 'offline'
                  ? 'Keine Verbindung – dein Fortschritt ist auf diesem Gerät gesichert und wird gespeichert, sobald du wieder online bist.'
                  : sync === 'saved' ? 'Dein Spielstand ist in deinem Konto gespeichert – auf jedem Gerät.' : 'Wird gespeichert …'
                : saveOk
                ? 'Dein Fortschritt wird nur in diesem Browser auf diesem Gerät gespeichert. Ohne Konto gibt es keine Sicherung auf anderen Geräten.'
                : 'Speichern ist in diesem Browser gerade nicht möglich (z. B. im privaten Modus). Fortschritt geht beim Schließen verloren.'}
            </p>
          </nav>
        )}
      </div>

      <MenuTabBar active={playOpen ? null : tab} questsReady={questsReady} showQuests={!!onQuests} onTab={(t) => {
        if (t === 'shop') return onNavigate('shop');
        if (t === 'quests') return onQuests?.();
        setTab(t);
        onPlayOpen?.(false);
      }} />
    </main>
  );
}
