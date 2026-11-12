import { RuneBadge } from '../components/RuneBadge';
import { meltCount } from '../game/forge';
import { Avatar } from '../components/Avatar';
import { Coin, CoinText, Stone } from '../components/Coin';
import { findRune } from '../game/runes';
import { LogoMark } from '../components/LogoMark';
import { GameIcon, GameIconName } from '../components/GameIcon';
import { CARDS, ownedActiveIds } from '../game/cards';
import { SaveData } from '../game/storage';
import { useState } from 'react';
import type { AiLevel } from '../game/ai';
import { aiCoins } from '../game/rewards';
import type { EventView } from '../game/puzzleApi';
import { timeLeftText } from '../game/puzzles';
import { PuzzleBoard, activeStage, rewardPicture, stageEvent, stagesOf } from './Events';

const LEVELS: { level: AiLevel; label: string; icon: GameIconName; text: string }[] = [
  { level: 'easy', label: 'Leicht', icon: 'leaf', text: 'spielt oft zufällig' },
  { level: 'medium', label: 'Normal', icon: 'sword', text: 'der klassische Gegner' },
  { level: 'hard', label: 'Schwer', icon: 'flame', text: 'denkt deine Antwort voraus' },
  { level: 'nightmare', label: 'Albtraum', icon: 'skull', text: 'stärkere Karten als deine' },
];

interface Props {
  save: SaveData;
  saveOk: boolean;
  /** Owner/Editor of the game page: may open the card administration. */
  isAdmin: boolean;
  /** Simple game against the computer with the chosen difficulty. */
  onPlay: (level: AiLevel) => void;
  onNavigate: (screen: 'collection' | 'forge' | 'deck' | 'rules' | 'tutorial' | 'privacy' | 'shop' | 'admin' | 'league' | 'campaign') => void;
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
  /** Signed in: online duels against real players (invite code or random opponent). */
  onOnline?: (start: 'code' | 'random') => void;
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
  /** Puzzle-Event shown on the start screen (signed in). */
  eventCard?: EventView | null;
  onEvents?: () => void;
  /** Community (clans and chat) – signed-in players only. */
  onCommunity?: () => void;
  /** Postfach: open items (null = none for guests). */
  inbox?: number | null;
  onInbox?: () => void;
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
export type TabBarItem = MenuTab | 'shop' | 'quests' | 'community';

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
      {showQuests && (
        <button type="button" className={cls('community')} aria-current={active === 'community' ? 'page' : undefined} onClick={() => onTab('community')}><GameIcon name="handshake" /><span>Community</span></button>
      )}
      <button type="button" className={cls('more')} aria-current={active === 'more' ? 'page' : undefined} onClick={() => onTab('more')}><GameIcon name="gear" /><span>Mehr</span></button>
    </nav>
  );
}

/** Top line of the five areas of the bottom bar (Start, Karten, Shop, Erfolge, Mehr): logo, coins, account. */
export function MenuTop({ coins, stones = null, account = null, avatar = null, onAccount, inbox = null, onInbox }: {
  coins: number; stones?: number | null; account?: string | 'guest' | null; avatar?: string | null; onAccount?: () => void;
  /** Postfach: open items (null = no Postfach, e.g. guests). */
  inbox?: number | null; onInbox?: () => void;
}) {
  return (
    <header className="menu-top">
      {/* First line: the logo in the middle; second line: account on the left, Runensteine, coins and Postfach on the right. */}
      <span className="menu-brand"><LogoMark className="menu-mark" /> <span>GridRune</span></span>
      <span className="menu-top-row">
        {account ? (
          <button type="button" className={`menu-account ${account === 'guest' ? 'guest' : ''}`} onClick={onAccount} aria-label={account === 'guest' ? 'Anmelden oder Konto erstellen' : `Konto ${account}`}>
            {avatar && account !== 'guest' ? <Avatar id={avatar} size={38} /> : <GameIcon name="user" />}{account === 'guest' && <span>Anmelden</span>}
          </button>
        ) : <span />}
        <span className="menu-top-right">
          {stones !== null && <span key={`s${stones}`} className="menu-coins menu-stones" aria-label={`${stones} Runensteine`}><Stone /> {stones}</span>}
          <span key={coins} className="menu-coins" aria-label={`${coins} Münzen`}><Coin /> {coins}</span>
          {inbox !== null && onInbox && (
            <button type="button" className={`menu-inbox ${inbox > 0 ? 'has' : ''}`} onClick={onInbox} aria-label={inbox > 0 ? `Postfach, ${inbox} neu` : 'Postfach'}>
              <GameIcon name="mail" />{inbox > 0 && <b className="menu-tab-badge inbox-badge">{inbox}</b>}
            </button>
          )}
        </span>
      </span>
    </header>
  );
}

export function Menu({ save, saveOk, isAdmin, onPlay, onNavigate, onToggleReducedMotion, runes, equippedRune = null, account = null, onAccount, sync = null, notice = '', onNotice, onOnline, onDraft, onRaid, playOpen = false, onPlayOpen, questsReady = 0, onQuests, nextSteps = [], eventCard = null, onEvents, onCommunity, inbox = null, onInbox, avatar = null, tab: tabProp, onTab, onAvatars }: Props) {
  const equipped = findRune(equippedRune);
  const [chooseLevel, setChooseLevel] = useState(false);
  // The open tab is kept by the app, so coming back from Shop or Erfolge opens the tab chosen in the bar.
  const [ownTab, setOwnTab] = useState<MenuTab>('start');
  const tab = tabProp ?? ownTab;
  const setTab = (t: MenuTab) => (onTab ? onTab(t) : setOwnTab(t));
  const { wins, draws, losses } = save.stats;
  const owned = ownedActiveIds(save.unlocked).length;

  const closePlay = () => { setChooseLevel(false); onPlayOpen?.(false); };
  const playMenu = (
    <nav className="menu-buttons menu-sub" aria-label="Spielen">
      <div className="sub-head">
        <button type="button" className="btn btn-small btn-back" onClick={closePlay} aria-label="Zurück"><GameIcon name="back" /> Zurück</button>
        <h2 className="menu-sub-title">Spielen</h2>
        <span aria-hidden="true" />
      </div>
      <div className="rune-rule" aria-hidden="true">ᚠ ᚱ ᛟ ᚦ ᛉ</div>
      <button type="button" className={`btn btn-primary ${chooseLevel ? '' : 'btn-big'}`} aria-expanded={chooseLevel} onClick={() => setChooseLevel(!chooseLevel)}>
        <GameIcon name="swords" /> Einfaches Spiel <span className="btn-sub">KI oder Spieler</span>
      </button>
      {chooseLevel && (
        <div className="simple-pick">
          <p className="pick-label"><GameIcon name="bot" /> Gegen die KI</p>
          <div className="level-pick" role="group" aria-label="Schwierigkeit wählen">
            {LEVELS.map((l) => (
              <button key={l.level} type="button" className={`btn level-btn level-${l.level}`} onClick={() => onPlay(l.level)}>
                <span className="level-name"><GameIcon name={l.icon} /> {l.label}</span>
                <span className="level-coins">Sieg <Coin /> {aiCoins(l.level).win}</span>
                <span className="level-text">{l.text}</span>
              </button>
            ))}
          </div>
          <p className="pick-label"><GameIcon name="user" /> Gegen Spieler</p>
          <div className="player-pick" role="group" aria-label="Gegen echte Spieler">
            <button type="button" className="btn" disabled={!onOnline} onClick={() => onOnline?.('code')}>
              <span className="level-name"><GameIcon name="share" /> Einladungscode</span>
              <span className="level-text">Freund herausfordern oder Code eingeben</span>
            </button>
            <button type="button" className="btn" disabled={!onOnline} onClick={() => onOnline?.('random')}>
              <span className="level-name"><GameIcon name="dice" /> Zufall</span>
              <span className="level-text">gegen einen zufälligen Gegner</span>
            </button>
          </div>
          {!onOnline && (
            account === 'guest'
              ? <button type="button" className="link-btn" onClick={onAccount}>Gegen Spieler nur mit Konto – jetzt anmelden</button>
              : <p className="muted small center">Gegen Spieler braucht eine Verbindung zum Server.</p>
          )}
        </div>
      )}
      <button type="button" className="btn btn-campaign" onClick={() => onNavigate('campaign')}><GameIcon name="map" /> Kampagne <span className="btn-sub">Welten und Bosse</span></button>
      <button type="button" className="btn btn-league" onClick={() => onNavigate('league')}><GameIcon name="trophy" /> Rangliste <span className="btn-sub">Sieg = neue Karte</span></button>
      {onDraft && <button type="button" className="btn btn-draft" onClick={onDraft}><GameIcon name="draft" /> Draft <span className="btn-sub">gleicher Pool für beide</span></button>}
      {onRaid && <button type="button" className="btn btn-raid" onClick={onRaid}><GameIcon name="raid" /> Raid <span className="btn-sub">alle gegen einen Weltboss</span></button>}
    </nav>
  );

  return (
    <main className="screen menu menu-v2">
      <MenuTop coins={save.coins} stones={account && account !== 'guest' ? save.stones : null} account={account} avatar={avatar} onAccount={onAccount} inbox={inbox} onInbox={onInbox} />

      {notice && (
        <button type="button" className="menu-notice" onClick={onNotice}><CoinText text={notice} /> <b>OK</b></button>
      )}

      <div className="menu-main">
        {playOpen ? playMenu : tab === 'start' ? (
          <>
            <section className="menu-hero">
              <p className="tagline">Sammle. Lege. Erobere das Raster.</p>
              <button type="button" className="btn btn-primary menu-play" onClick={() => onPlayOpen?.(true)}>
                <span className="menu-play-title"><GameIcon name="play" /> Spielen</span>
                <span className="menu-play-sub">Einfaches Spiel · Kampagne · Rangliste</span>
              </button>
            </section>
            {onEvents && (
              <button type="button" className="menu-event" onClick={onEvents}>
                {eventCard ? (() => {
                  const stages = stagesOf(eventCard);
                  const st = activeStage(eventCard);
                  const ev = stageEvent(eventCard, st);
                  const allDone = stages.every((x) => x.done);
                  return (
                    <>
                      <span className="menu-event-art"><PuzzleBoard picture={rewardPicture(ev)} cols={ev.cols} rows={ev.rows} pieces={ev.pieces} have={ev.have} /></span>
                      <span className="menu-event-text">
                        <small>Event · noch {timeLeftText(eventCard.run.endsAt)}</small>
                        <b>{eventCard.name}</b>
                        <span className="event-bar"><i style={{ width: `${Math.round((ev.have.length / ev.pieces) * 100)}%` }} /></span>
                        <small>{allDone ? '✓ Alle Karten freigeschaltet' : `${stages.length > 1 ? `Stufe ${st.index + 1}/${stages.length} · ` : ''}${ev.have.length} / ${ev.pieces} Fragmente`}</small>
                      </span>
                    </>
                  );
                })() : (
                  <span className="menu-event-text"><small>Events</small><b>Puzzle-Events</b><small>Archiv und kommende Events</small></span>
                )}
                <GameIcon name="next" className="menu-step-go" />
              </button>
            )}
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
            <h2 className="menu-sub-title tab-title">Karten</h2>
            <p className="muted">{owned} von {CARDS.length} Karten gesammelt</p>
            <button type="button" className="btn btn-big" onClick={() => onNavigate('collection')}><GameIcon name="book" /> Sammlung <span className="btn-sub">alle Karten ansehen</span></button>
            <button type="button" className="btn btn-big btn-forge" onClick={() => onNavigate('forge')}>
              <GameIcon name="flame" /> Runenschmiede
              <span className="btn-sub">{meltCount(save) > 0 ? `${meltCount(save)} doppelte Karte${meltCount(save) === 1 ? '' : 'n'} bereit` : 'Duplikate einschmelzen, Karten schmieden'}</span>
            </button>
            <button type="button" className="btn btn-big btn-deck" onClick={() => onNavigate('deck')}>
              <GameIcon name="deck" /> Deck bearbeiten
              {runes && (equipped ? <span className="btn-sub"><RuneBadge rune={equipped} className="small" /></span> : <span className="btn-sub">ohne Rune</span>)}
            </button>
          </nav>
        ) : (
          <nav className="menu-buttons menu-sub" aria-label="Mehr">
            <h2 className="menu-sub-title tab-title">Mehr</h2>
            <div className="record" aria-label="Deine Bilanz">
              <div><b>{wins}</b><span><GameIcon name="crown" /> Siege</span></div>
              <div><b>{draws}</b><span><GameIcon name="handshake" /> Unentschieden</span></div>
              <div><b>{losses}</b><span><GameIcon name="skull" /> Niederlagen</span></div>
            </div>
            {account && <button type="button" className="btn" onClick={onAccount}><GameIcon name="user" /> {account === 'guest' ? 'Anmelden / Konto erstellen' : 'Konto'}</button>}
            {onAvatars && <button type="button" className="btn" onClick={onAvatars}>{avatar ? <Avatar id={avatar} size={24} /> : <GameIcon name="user" />} Avatar wählen</button>}
            <button type="button" className="btn" onClick={() => onNavigate('tutorial')}><GameIcon name="book" /> Tutorial</button>
            <button type="button" className="btn" onClick={() => onNavigate('rules')}><GameIcon name="scroll" /> Regeln</button>
            <button type="button" className="btn" onClick={() => onNavigate('privacy')}><GameIcon name="lock" /> Datenschutz</button>
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

      <MenuTabBar active={playOpen ? 'start' : tab} questsReady={questsReady} showQuests={!!onQuests} onTab={(t) => {
        if (t === 'shop') return onNavigate('shop');
        if (t === 'quests') return onQuests?.();
        if (t === 'community') return onCommunity?.();
        setTab(t);
        onPlayOpen?.(false);
      }} />
    </main>
  );
}
