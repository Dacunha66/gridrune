import { useCallback, useEffect, useRef, useState } from 'react';
import { Outcome } from './game/battle';
import { Reward, applyReward, computeReward } from './game/rewards';
import type { AiLevel } from './game/ai';
import { Pick } from './game/runner';
import { SaveData, loadSave, writeSave } from './game/storage';
import { Menu, MenuTab, MenuTabBar, TabBarItem } from './screens/Menu';
import { Raid, RaidTestFight } from './screens/Raid';
import type { RaidConfig } from './game/raid';
import { Online } from './screens/Online';
import { DraftPractice } from './screens/Draft';
import { Collection } from './screens/Collection';
import { DeckEditor } from './screens/DeckEditor';
import { Rules } from './screens/Rules';
import { Runner } from './screens/Runner';
import { Battle } from './screens/Battle';
import { Result } from './screens/Result';
import { Shop, skinStyle } from './screens/Shop';
import { getSkin } from './game/skins';
import { CARDS, getCard, setCardCatalog } from './game/cards';
import { CardRecord, buildCatalog, repairDeck } from './game/catalog';
import { getDb, isAdmin, loadArenas, loadAvatars, loadCampaign, loadCardRecords, loadDesignState, loadDesigns, loadGameSettings, loadRunes, loadShopLooks } from './game/cardStore';
import { setPackLooks } from './game/shop';
import { ACTIVE, Design, DesignState, setActiveDesigns } from './game/designs';
import { PageArt } from './components/DesignArt';
import { setArenas } from './game/arenas';
import { GameSettings, SETTINGS, released, setGameSettings } from './game/settings';
import { GameMode, RUNES, RuneDef, availableRunes, setRunes } from './game/runes';
import { Admin } from './screens/Admin';
import { League } from './screens/League';
import { Campaign } from './screens/Campaign';
import { runeUnlocked } from './game/campaignProgress';
import { setDevTools } from './game/cardStyle';
import { SymbolTips } from './components/SymbolTips';
import { CAMPAIGN, CampaignContent, mergeContent, setCampaign } from './game/campaign';
import { CampaignProgress, loadProgress, writeProgress } from './game/campaignProgress';
import { AccountState, isGuest, watchAccount } from './game/account';
import { AccountPage, CloudGate, NewPassword, Welcome } from './screens/Account';
import { useCloudSync } from './game/useCloudSync';
import { Quests } from './screens/Quests';
import { questOverview } from './game/questApi';
import { QuestItem, claimable, rewardText } from './game/quests';
import { NextStep } from './screens/Menu';
import { nextMission } from './game/campaignProgress';
import {
  claimCampaignRewards, finishAdventureRemote, finishLeagueRemote, finishMissionRemote, readPending, startAdventure, writePending,
} from './game/adventureApi';
import { grantedText } from './game/campaignRewards';
import { AdventureLog, AdventureTicket, handPicks } from './game/verify';
import { DEFAULT_AVATAR, setAvatars } from './game/avatars';
import { Avatars } from './screens/Avatars';
import type { DuelRecord } from './screens/Battle';

export type Screen =
  | { name: 'menu' | 'collection' | 'deck' | 'rules' | 'shop' | 'admin' | 'league' | 'account' | 'online' | 'draft' | 'draftPractice' | 'raid' | 'avatars' }
  /** tab = open on this tab (the account page opens the avatars under "Erfolge"). */
  | { name: 'quests'; tab?: 'daily' | 'weekly' | 'achievements' }
  /** preview = admin test (drafts visible, nothing saved); missionId = start this mission directly. */
  | { name: 'campaign'; preview?: boolean; missionId?: string }
  /** Admin: raid test fight with the raid as it is in the editor (nothing stored). */
  | { name: 'raidTest'; config: RaidConfig; phase: number }
  | { name: 'runner'; runId: number; deck: string[]; level: AiLevel; ticket?: AdventureTicket }
  | { name: 'battle'; picks: Pick[]; level: AiLevel; ticket?: AdventureTicket; run?: AdventureLog['run']; battleId?: number }
  | { name: 'result'; outcome: Outcome; reward: Reward; level: AiLevel; score: { player: number; cpu: number }; status?: 'checking' | 'paid' | 'pending' | 'rejected' };

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [saveOk, setSaveOk] = useState(true);
  const reducedMotion = save.settings.reducedMotion || prefersReducedMotion();

  // Guests save in the browser; a signed-in player's save goes to the account (see useCloudSync below).
  const accountModeRef = useRef(false);
  useEffect(() => {
    if (!accountModeRef.current) setSaveOk(writeSave(save));
  }, [save]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);

  // Accounts (web version only). Signing in or out reloads the page, so admin rights and content start fresh.
  const [account, setAccount] = useState<AccountState | null>(null);
  const [guest, setGuestState] = useState(isGuest);
  useEffect(() => {
    let firstUser: string | null | undefined;
    return watchAccount((s) => {
      const user = s.kind === 'signedIn' || s.kind === 'recovery' ? s.account.id : null;
      if (firstUser === undefined) firstUser = user;
      else if (user !== firstUser && s.kind !== 'recovery') {
        window.location.reload();
        return;
      }
      setAccount(s);
    });
  }, []);

  // Card database: load the managed cards once, apply them outside of runs and duels.
  const [admin, setAdmin] = useState(false);
  const [, setCatalogVersion] = useState(0);
  const pendingRecords = useRef<CardRecord[] | null>(null);
  const screenRef = useRef(screen.name);
  screenRef.current = screen.name;

  // New features (runes, Wirbelwind/Kettenübernahme) are only for whom they are released (admin test or everyone).
  const viewerIsAdmin = useRef(false);
  const lastRecords = useRef<CardRecord[] | null>(null);
  const [features, setFeatures] = useState(SETTINGS.features);
  const applyRecords = useCallback((records: CardRecord[]) => {
    lastRecords.current = records;
    if (screenRef.current === 'runner' || screenRef.current === 'battle' || screenRef.current === 'league' || screenRef.current === 'campaign' || screenRef.current === 'online' || screenRef.current === 'draft' || screenRef.current === 'draftPractice') {
      pendingRecords.current = records;
      return;
    }
    pendingRecords.current = null;
    const catalog = buildCatalog(records, released(SETTINGS.features.abilities, viewerIsAdmin.current));
    setCardCatalog(catalog.active, catalog.known);
    setSave((s) => {
      const fixed = repairDeck(s.deck, s.unlocked, CARDS);
      return fixed.deck === s.deck && fixed.unlocked === s.unlocked ? s : { ...s, ...fixed };
    });
    setCatalogVersion((v) => v + 1);
  }, []);

  // Campaign content (built-in world plus the admin's saved worlds, missions, opponents) and this device's progress.
  const [campaign, setCampaignState] = useState<CampaignContent>(() => mergeContent({}));
  const applyCampaign = useCallback((content: CampaignContent) => {
    setCampaign(content);
    setCampaignState(content);
  }, []);
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgress>(() => loadProgress());
  useEffect(() => {
    if (!accountModeRef.current) writeProgress(campaignProgress);
  }, [campaignProgress]);
  const cloud = useCloudSync({ account, save, setSave, progress: campaignProgress, setProgress: setCampaignProgress });
  // Erfolge: how many rewards are ready (badge on the menu button), looked up when the menu opens.
  const [questsReady, setQuestsReady] = useState(0);
  /** The signed-in player's avatar (from the server, with the titles). */
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  /** Open tab of the main menu (kept while Shop or Erfolge is open). */
  const [menuTab, setMenuTab] = useState<MenuTab>('start');
  const [questDaily, setQuestDaily] = useState<QuestItem | null>(null);
  useEffect(() => {
    if (screen.name !== 'menu' || !cloud.uid || cloud.phase !== 'ready') return;
    let alive = true;
    questOverview().then((r) => {
      if (alive && r !== 'offline') {
        setQuestsReady(claimable(r.board).length);
        setMyAvatar(r.titles.avatar ?? DEFAULT_AVATAR);
        setQuestDaily(r.board.daily.find((i) => !i.done) ?? null);
      }
    });
    return () => {
      alive = false;
    };
  }, [screen.name, cloud.uid, cloud.phase]);

  accountModeRef.current = cloud.accountMode;

  // Published designs (board picture, page background). A running duel keeps the board it started with.
  const [pageDesign, setPageDesign] = useState<Design | null>(null);
  const applyDesigns = useCallback((designs: Design[], state: DesignState) => {
    const byId = new Map(designs.map((d) => [d.id, d]));
    setActiveDesigns(state.board ? byId.get(state.board) ?? null : null, state.page ? byId.get(state.page) ?? null : null);
    setPageDesign(ACTIVE.page);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const db = await getDb();
      const [records, settings, arenas, designs, designState, savedCampaign, savedRunes, shopLooks, savedAvatars] = await Promise.all([
        loadCardRecords(db), loadGameSettings(db), loadArenas(db), loadDesigns(db), loadDesignState(db), loadCampaign(db), loadRunes(db),
        loadShopLooks(db), loadAvatars(db),
      ]);
      if (alive && savedAvatars) setAvatars(savedAvatars);
      if (alive && shopLooks) setPackLooks(shopLooks);
      if (alive && savedCampaign) applyCampaign(mergeContent(savedCampaign));
      if (alive && savedRunes) setRunes(savedRunes);
      if (alive && designs && designState) applyDesigns(designs, designState);
      if (alive && settings) {
        setGameSettings(settings);
        setFeatures(settings.features);
      }
      // Arenas are picked when a duel starts, so they can be applied right away.
      if (alive && arenas) setArenas(arenas);
      if (alive && records && records.length > 0) applyRecords(records);
      const ok = await isAdmin();
      if (alive) {
        setAdmin(ok);
        setDevTools(ok);
        viewerIsAdmin.current = ok;
        // Admins may see features released for testing: rebuild the card catalog with them.
        if (ok && lastRecords.current && lastRecords.current.length > 0) applyRecords(lastRecords.current);
      }
    })();
    return () => {
      alive = false;
    };
  }, [applyRecords, applyDesigns, applyCampaign]);

  // Only cards that are in play right now (the database may have changed since the deck was built).
  // Runes are unlocked in the campaign (missions or stars); admins can also set a rune to "für alle".
  const runesOn = released(features.runes, admin);
  const ownedRunes = [...new Set([...save.runes.owned, ...RUNES.filter((r) => runeUnlocked(r, campaignProgress, campaign)).map((r) => r.id)])];
  /** Rune the player takes into a duel of this mode (null = none or not allowed there). */
  // A player who owns runes always plays with one (the chosen one, else the first owned); without runes, none.
  const ownedActiveRunes = RUNES.filter((r) => r.status === 'active' && (r.unlock.kind === 'start' || ownedRunes.includes(r.id)));
  const equippedRune = !runesOn ? null
    : ownedActiveRunes.some((r) => r.id === save.runes.equipped) ? save.runes.equipped : ownedActiveRunes[0]?.id ?? null;
  const duelRune = (mode: GameMode): string | null => {
    if (!equippedRune) return null;
    return availableRunes(mode, ownedRunes).some((r) => r.id === equippedRune) ? equippedRune : null;
  };
  const runeLockText = (r: RuneDef) => {
    if (r.unlock.kind === 'mission') {
      const missionId = r.unlock.missionId;
      return `Kampagne: Mission „${campaign.missions.find((m) => m.id === missionId)?.name ?? missionId}“ gewinnen`;
    }
    return r.unlock.kind === 'stars' ? `Kampagne: ${r.unlock.n} ★ sammeln` : '';
  };

  // Signed in: the server hands out the run (seed) and checks the result; guests play as before.
  const starting = useRef(false);
  const startRun = async (level: AiLevel) => {
    const deck = repairDeck(save.deck, save.unlocked, CARDS).deck;
    // No run any more: the duel starts right away with the whole deck (5 on the hand, the rest drawn).
    if (!cloud.accountMode) return setScreen({ name: 'battle', picks: handPicks(deck), level, battleId: Date.now() });
    if (cloud.phase !== 'ready' || starting.current) return;
    starting.current = true;
    const r = await startAdventure(deck, duelRune('adventure'), level);
    starting.current = false;
    if (r.kind === 'ticket') return setScreen({ name: 'battle', picks: handPicks(r.ticket.deck), level: r.ticket.level ?? level, ticket: r.ticket, battleId: Date.now() });
    setScreen({ name: 'menu' });
    cloud.notify(r.kind === 'offline'
      ? 'Keine Verbindung – zum Starten eines Spiels mit deinem Konto brauchst du kurz Internet.'
      : `Das Spiel konnte nicht gestartet werden (${r.error === 'deck' ? 'Deck ungültig – bitte im Deck-Editor prüfen' : r.error}).`);
  };
  /** "Spielen" submenu open: stays open while playing, so the game returns there. */
  const [playMenu, setPlayMenu] = useState(false);
  const toMenu = useCallback(() => {
    setScreen({ name: 'menu' });
    const pending = pendingRecords.current;
    if (pending) setTimeout(() => applyRecords(pending), 0);
  }, [applyRecords]);
  /** The menu's bottom bar under Shop and Erfolge (same tabs as in the menu). */
  const tabBar = (active: TabBarItem) => (
    <MenuTabBar active={active} questsReady={questsReady} showQuests={!!account} onTab={(t) => {
      if (t === 'shop') return setScreen({ name: 'shop' });
      if (t === 'quests') return setScreen({ name: 'quests' });
      setMenuTab(t);
      setPlayMenu(false);
      toMenu();
    }} />
  );

  const finishBattle = async (level: AiLevel, outcome: Outcome, score: { player: number; cpu: number }, ticket?: AdventureTicket, run?: AdventureLog['run'], record?: DuelRecord) => {
    const reward = computeReward(outcome, level);
    if (!ticket || !record || !cloud.uid) {
      setSave((prev) => applyReward(prev, outcome, reward));
      setScreen({ name: 'result', outcome, reward, level, score });
      return;
    }
    // Checked adventure: show the result at once, the server confirms and pays out.
    setScreen({ name: 'result', outcome, reward, level, score, status: 'checking' });
    const log: AdventureLog = { ...(run ? { run } : {}), duel: { first: record.start.turn, moves: record.moves } };
    const r = await finishAdventureRemote(ticket.id, log);
    const update = (patch: Partial<Extract<Screen, { name: 'result' }>>) => setScreen((s) => (s.name === 'result' ? { ...s, ...patch } : s));
    if (r.kind === 'paid') {
      cloud.adoptServer(r.cloud);
      update({ outcome: r.outcome, reward: r.reward, score: { player: r.score.player, cpu: r.score.cpu }, status: 'paid' });
    } else if (r.kind === 'offline') {
      writePending(cloud.uid, [...readPending(cloud.uid), { ticketId: ticket.id, log, at: new Date().toISOString() }]);
      update({ status: 'pending' });
    } else {
      if (r.cloud) cloud.adoptServer(r.cloud);
      update({ status: 'rejected' });
    }
  };

  // Results that could not be sent yet: try again when the account is ready and every minute.
  const claimed = useRef(new Set<string>());
  useEffect(() => {
    if (!cloud.uid || cloud.phase !== 'ready') return;
    const uid = cloud.uid;
    let busy = false;
    const flush = async () => {
      if (busy) return;
      busy = true;
      try {
        for (const p of readPending(uid)) {
          // The text is built after the entry is gone: a problem in the text must not keep the result in the queue.
          let message: (() => string) | null = null;
          if (p.kind === 'league') {
            const r = await finishLeagueRemote(p.ticketId, p.log);
            if (r.kind === 'offline') break;
            if (r.cloud) cloud.adoptServer(r.cloud);
            if (r.kind === 'paid' && r.won) message = () => `Rangliste nachträglich gewertet: ${r.reward.newCard ? `neue Karte „${getCard(r.reward.newCard).name}“` : `🪙 ${r.reward.coins}`}.`;
          } else if (p.kind === 'mission') {
            const r = await finishMissionRemote(p.ticketId, p.log);
            if (r.kind === 'offline') break;
            if (r.cloud) cloud.adoptServer(r.cloud);
            if (r.kind === 'paid') message = () => `Kampagnen-Duell nachträglich gewertet${r.granted.length ? ` – ${grantedText(r.granted)}` : ''}.`;
          } else {
            const r = await finishAdventureRemote(p.ticketId, p.log);
            if (r.kind === 'offline') break;
            if (r.cloud) cloud.adoptServer(r.cloud);
            if (r.kind === 'paid') message = () => `Nachträglich gutgeschrieben: 🪙 ${r.reward.coins}${r.reward.newCard ? ' und eine neue Karte' : ''}.`;
          }
          // Read the list again: a result finished offline while this one was being sent must not be dropped.
          writePending(uid, readPending(uid).filter((x) => x.ticketId !== p.ticketId));
          if (message) {
            try {
              cloud.notify(message());
            } catch {
              cloud.notify('Ein Ergebnis wurde nachträglich gewertet.');
            }
          }
        }
      } finally {
        // Never stay blocked: the next attempt follows in a minute.
        busy = false;
      }
      // Campaign rewards earned before they were paid out (once per account; the server knows what is paid).
      if (!claimed.current.has(uid)) {
        const c = await claimCampaignRewards();
        if (c !== 'offline') claimed.current.add(uid);
        if (c && c !== 'offline') {
          cloud.adoptServer(c.cloud);
          cloud.notify(`Kampagnen-Belohnungen gutgeschrieben: ${grantedText(c.granted)}.`);
        }
      }
    };
    flush();
    const t = setInterval(flush, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.uid, cloud.phase]);

  // Home screen: what the player can do next – first game, the next campaign mission, rewards ready, today's quest.
  const nextSteps: NextStep[] = [];
  {
    const next = nextMission(CAMPAIGN, campaignProgress);
    const firstTime = save.stats.wins + save.stats.draws + save.stats.losses === 0;
    if (firstTime) nextSteps.push({ icon: 'run', title: 'Dein erstes Spiel', sub: 'Einfaches Spiel auf „Leicht“ – lerne die Regeln kennen', onClick: () => void startRun('easy') });
    if (next) nextSteps.push({ icon: 'map', title: next.number === 1 && next.world.order <= 1 ? 'Kampagne beginnen' : 'Kampagne fortsetzen', sub: `${next.world.name} · ${next.mission.name}`, onClick: () => setScreen({ name: 'campaign' }) });
    if (questsReady > 0) nextSteps.push({ icon: 'gift', title: questsReady === 1 ? '1 Belohnung bereit' : `${questsReady} Belohnungen bereit`, sub: 'Erfolge – jetzt abholen', onClick: () => setScreen({ name: 'quests' }) });
    if (questDaily) nextSteps.push({ icon: 'hourglass', title: questDaily.text, sub: `Tagesquest · ${rewardText(questDaily.reward)}`, progress: questDaily.progress / questDaily.target, onClick: () => setScreen({ name: 'quests' }) });
    if (account?.kind === 'signedOut') nextSteps.push({ icon: 'user', title: 'Konto erstellen', sub: 'Für Erfolge, Online-Duelle und Speichern auf allen Geräten', onClick: () => setGuestState(false) });
  }

  return (
    <>
    <PageArt design={pageDesign} />
    <SymbolTips />
    <div className={`app ${screen.name === 'admin' ? 'app-wide' : ''} ${pageDesign ? 'has-page-art' : ''}`} style={skinStyle(getSkin(save.skins.card).colors)}>
      {account?.kind === 'recovery' && <NewPassword onDone={() => setAccount({ kind: 'signedIn', account: account.account })} />}
      {account?.kind === 'signedOut' && !guest && screen.name === 'menu' && <Welcome onGuest={() => setGuestState(true)} />}
      {screen.name === 'account' && account?.kind === 'signedIn' && (
        <AccountPage account={account.account} onBack={toMenu} onRenamed={(name) => setAccount({ kind: 'signedIn', account: { ...account.account, name } })}
          avatar={myAvatar} onAvatar={() => setScreen({ name: 'avatars' })} />
      )}
      {cloud.accountMode && cloud.phase !== 'ready' && account?.kind !== 'recovery' && (
        <CloudGate phase={cloud.phase} notice={cloud.notice} browserSave={loadSave()} onChoose={cloud.choose} onRetry={cloud.retry} />
      )}
      {screen.name === 'menu' && account?.kind !== 'recovery' && !(account?.kind === 'signedOut' && !guest) && !(cloud.accountMode && cloud.phase !== 'ready') && (
        <Menu
          sync={cloud.accountMode ? cloud.sync : null}
          notice={cloud.notice}
          onNotice={cloud.clearNotice}
          account={account?.kind === 'signedIn' ? account.account.name : account?.kind === 'signedOut' ? 'guest' : null}
          onAccount={() => {
            if (account?.kind === 'signedIn') setScreen({ name: 'account' });
            else setGuestState(false);
          }}
          save={save}
          saveOk={saveOk}
          isAdmin={admin}
          onPlay={startRun}
          playOpen={playMenu}
          onPlayOpen={setPlayMenu}
          onOnline={cloud.uid && cloud.phase === 'ready' ? () => setScreen({ name: 'online' }) : undefined}
          onDraft={() => setScreen({ name: cloud.uid && cloud.phase === 'ready' ? 'draft' : 'draftPractice' })}
          onRaid={cloud.uid && cloud.phase === 'ready' ? () => setScreen({ name: 'raid' }) : undefined}
          onQuests={account ? () => setScreen({ name: 'quests' }) : undefined}
          questsReady={questsReady}
          avatar={account?.kind === 'signedIn' ? myAvatar : null}
          tab={menuTab}
          onTab={setMenuTab}
          onAvatars={account?.kind === 'signedIn' && cloud.uid ? () => setScreen({ name: 'avatars' }) : undefined}
          nextSteps={nextSteps}
          onNavigate={(name) => setScreen(name === 'campaign' ? { name } : { name })}
          runes={runesOn}
          equippedRune={equippedRune}
          onToggleReducedMotion={() =>
            setSave((s) => ({ ...s, settings: { ...s.settings, reducedMotion: !s.settings.reducedMotion } }))
          }
        />
      )}
      {screen.name === 'collection' && <Collection save={save} onBack={toMenu} />}
      {screen.name === 'deck' && (
        <DeckEditor save={save} onSave={(deck) => setSave((s) => ({ ...s, deck }))} onBack={toMenu}
          runes={runesOn ? {
            owned: ownedRunes, equipped: equippedRune, lockText: runeLockText,
            onEquip: (id) => setSave((s) => ({ ...s, runes: { ...s.runes, equipped: id } })),
          } : null} />
      )}
      {screen.name === 'rules' && <Rules onBack={toMenu} runes={runesOn} />}
      {screen.name === 'shop' && (
        <div className="tabbed-screen">
          <Shop save={save} onChange={setSave} onBack={toMenu} server={cloud.accountMode ? { adopt: cloud.adoptServer } : null} />
          {tabBar('shop')}
        </div>
      )}
      {screen.name === 'avatars' && <Avatars onAvatar={setMyAvatar} onBack={toMenu} />}
      {screen.name === 'online' && cloud.uid && (
        <Online
          uid={cloud.uid}
          deck={repairDeck(save.deck, save.unlocked, CARDS).deck}
          rune={duelRune('league')}
          reducedMotion={reducedMotion}
          onFinished={cloud.retry}
          onExit={toMenu}
        />
      )}
      {screen.name === 'draft' && cloud.uid && (
        <Online
          uid={cloud.uid}
          mode="draft"
          skin={getSkin(save.skins.runner).colors}
          onPractice={() => setScreen({ name: 'draftPractice' })}
          deck={[]}
          rune={duelRune('league')}
          reducedMotion={reducedMotion}
          onFinished={cloud.retry}
          onExit={toMenu}
        />
      )}
      {screen.name === 'quests' && (
        <div className="tabbed-screen">
          <Quests signedIn={!!cloud.uid && cloud.phase === 'ready'} reducedMotion={reducedMotion}
            onAccount={account?.kind === 'signedOut' ? () => { setGuestState(false); toMenu(); } : undefined}
            onAdopt={cloud.adoptServer} onBack={toMenu} initialTab={screen.tab} />
          {tabBar('quests')}
        </div>
      )}
      {screen.name === 'raid' && cloud.uid && (
        <Raid unlocked={save.unlocked} deck={repairDeck(save.deck, save.unlocked, CARDS).deck} rune={duelRune('raid')} reducedMotion={reducedMotion}
          onSaveChanged={cloud.retry} onExit={toMenu} />
      )}
      {screen.name === 'raidTest' && (
        <RaidTestFight config={screen.config} phase={screen.phase} unlocked={save.unlocked} deck={repairDeck(save.deck, save.unlocked, CARDS).deck}
          rune={duelRune('raid')} reducedMotion={reducedMotion} onExit={() => setScreen({ name: 'admin' })} />
      )}
      {screen.name === 'draftPractice' && (
        <DraftPractice reducedMotion={reducedMotion} skin={getSkin(save.skins.runner).colors} rune={duelRune('league')}
          onExit={() => setScreen({ name: cloud.uid && cloud.phase === 'ready' ? 'draft' : 'menu' })} />
      )}
      {screen.name === 'league' && (
        <League
          save={save}
          reducedMotion={reducedMotion}
          skin={getSkin(save.skins.runner).colors}
          runes={runesOn ? { player: duelRune('league'), equipped: equippedRune } : null}
          onSaveDeck={(leagueDeck) => setSave((s) => ({ ...s, leagueDeck }))}
          account={cloud.uid && cloud.phase === 'ready' ? { uid: cloud.uid, adopt: cloud.adoptServer } : null}
          onExit={toMenu}
        />
      )}
      {screen.name === 'admin' && (
        <Admin
          onCatalogChange={applyRecords}
          onSettingsChange={(s: GameSettings) => {
            setGameSettings(s);
            setFeatures(s.features);
            if (lastRecords.current) pendingRecords.current = lastRecords.current;
          }}
          onDesignsChange={applyDesigns}
          onCampaignChange={applyCampaign}
          onTestCampaign={(missionId) => setScreen({ name: 'campaign', preview: true, missionId })}
          onTestRaid={(config, phase) => setScreen({ name: 'raidTest', config, phase })}
          campaign={campaign}
          onBack={toMenu}
        />
      )}
      {screen.name === 'campaign' && (
        <Campaign
          key={`${screen.preview ? 'test' : 'play'}-${screen.missionId ?? ''}`}
          content={campaign}
          progress={campaignProgress}
          onProgress={setCampaignProgress}
          deck={repairDeck(save.deck, save.unlocked, CARDS).deck}
          unlocked={save.unlocked}
          reducedMotion={reducedMotion}
          skin={getSkin(save.skins.runner).colors}
          preview={screen.preview}
          startMissionId={screen.missionId}
          playerRune={duelRune('campaign')}
          runesOn={runesOn}
          account={cloud.uid && cloud.phase === 'ready' ? { uid: cloud.uid, adopt: cloud.adoptServer } : null}
          onExit={screen.preview ? () => setScreen({ name: 'admin' }) : toMenu}
        />
      )}
      {screen.name === 'runner' && (
        <Runner
          key={screen.runId}
          deck={screen.deck}
          unlocked={save.unlocked}
          reducedMotion={reducedMotion}
          skin={getSkin(save.skins.runner).colors}
          ticket={screen.ticket}
          onFinish={(picks, inputs, skippedAt) => setScreen({ name: 'battle', picks, level: screen.level, ticket: screen.ticket, run: { inputs, skippedAt } })}
          onQuit={toMenu}
        />
      )}
      {screen.name === 'battle' && (
        <Battle
          key={screen.battleId}
          picks={screen.picks}
          unlocked={save.unlocked}
          reducedMotion={reducedMotion}
          ticket={screen.ticket}
          ai={{ level: screen.level }}
          onEnd={(outcome, score, _first, record) => finishBattle(screen.level, outcome, score, screen.ticket, screen.run, record)}
          onQuit={toMenu}
          runes={{ player: duelRune('adventure'), cpu: duelRune('adventure') ? 'random' : null }}
        />
      )}
      {screen.name === 'result' && (
        <Result outcome={screen.outcome} reward={screen.reward} score={screen.score} coins={screen.status === "checking" ? save.coins + screen.reward.coins : save.coins} status={screen.status} level={screen.level} onAgain={() => startRun(screen.level)} onMenu={toMenu} />
      )}
    </div>
    </>
  );
}
