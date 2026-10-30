import { useCallback, useEffect, useRef, useState } from 'react';
import { Outcome } from './game/battle';
import { Reward, applyReward, computeReward } from './game/rewards';
import { Pick } from './game/runner';
import { SaveData, loadSave, writeSave } from './game/storage';
import { Menu } from './screens/Menu';
import { Online } from './screens/Online';
import { Collection } from './screens/Collection';
import { DeckEditor } from './screens/DeckEditor';
import { Rules } from './screens/Rules';
import { Runner } from './screens/Runner';
import { Battle } from './screens/Battle';
import { Result } from './screens/Result';
import { Shop, skinStyle } from './screens/Shop';
import { getSkin } from './game/skins';
import { CARDS, setCardCatalog } from './game/cards';
import { CardRecord, buildCatalog, repairDeck } from './game/catalog';
import { getDb, isAdmin, loadArenas, loadCampaign, loadCardRecords, loadDesignState, loadDesigns, loadGameSettings, loadRunes, loadShopLooks } from './game/cardStore';
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
import { CampaignContent, mergeContent, setCampaign } from './game/campaign';
import { CampaignProgress, loadProgress, writeProgress } from './game/campaignProgress';
import { AccountState, isGuest, watchAccount } from './game/account';
import { AccountPage, CloudGate, NewPassword, Welcome } from './screens/Account';
import { useCloudSync } from './game/useCloudSync';
import {
  claimCampaignRewards, finishAdventureRemote, finishMissionRemote, readPending, startAdventure, writePending,
} from './game/adventureApi';
import { grantedText } from './game/campaignRewards';
import { AdventureLog, AdventureTicket } from './game/verify';
import type { DuelRecord } from './screens/Battle';

export type Screen =
  | { name: 'menu' | 'collection' | 'deck' | 'rules' | 'shop' | 'admin' | 'league' | 'account' | 'online' }
  /** preview = admin test (drafts visible, nothing saved); missionId = start this mission directly. */
  | { name: 'campaign'; preview?: boolean; missionId?: string }
  | { name: 'runner'; runId: number; deck: string[]; ticket?: AdventureTicket }
  | { name: 'battle'; picks: Pick[]; ticket?: AdventureTicket; run?: AdventureLog['run'] }
  | { name: 'result'; outcome: Outcome; reward: Reward; score: { player: number; cpu: number }; status?: 'checking' | 'paid' | 'pending' | 'rejected' };

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
    if (screenRef.current === 'runner' || screenRef.current === 'battle' || screenRef.current === 'league' || screenRef.current === 'campaign' || screenRef.current === 'online') {
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
      const [records, settings, arenas, designs, designState, savedCampaign, savedRunes, shopLooks] = await Promise.all([
        loadCardRecords(db), loadGameSettings(db), loadArenas(db), loadDesigns(db), loadDesignState(db), loadCampaign(db), loadRunes(db),
        loadShopLooks(db),
      ]);
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
  const startRun = async () => {
    const deck = repairDeck(save.deck, save.unlocked, CARDS).deck;
    if (!cloud.accountMode) return setScreen({ name: 'runner', runId: Date.now(), deck });
    if (cloud.phase !== 'ready' || starting.current) return;
    starting.current = true;
    const r = await startAdventure(deck, duelRune('adventure'));
    starting.current = false;
    if (r.kind === 'ticket') return setScreen({ name: 'runner', runId: Date.now(), deck: r.ticket.deck, ticket: r.ticket });
    setScreen({ name: 'menu' });
    cloud.notify(r.kind === 'offline'
      ? 'Keine Verbindung – zum Starten eines Spiels mit deinem Konto brauchst du kurz Internet.'
      : `Das Spiel konnte nicht gestartet werden (${r.error === 'deck' ? 'Deck ungültig – bitte im Deck-Editor prüfen' : r.error}).`);
  };
  const toMenu = useCallback(() => {
    setScreen({ name: 'menu' });
    const pending = pendingRecords.current;
    if (pending) setTimeout(() => applyRecords(pending), 0);
  }, [applyRecords]);

  const finishBattle = async (picks: Pick[], outcome: Outcome, score: { player: number; cpu: number }, ticket?: AdventureTicket, run?: AdventureLog['run'], record?: DuelRecord) => {
    const reward = computeReward(outcome, picks, save.unlocked);
    if (!ticket || !run || !record || !cloud.uid) {
      setSave((prev) => applyReward(prev, outcome, reward));
      setScreen({ name: 'result', outcome, reward, score });
      return;
    }
    // Checked adventure: show the result at once, the server confirms and pays out.
    setScreen({ name: 'result', outcome, reward, score, status: 'checking' });
    const log: AdventureLog = { run, duel: { first: record.start.turn, moves: record.moves } };
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
      let list = readPending(uid);
      for (const p of list) {
        if (p.kind === 'mission') {
          const r = await finishMissionRemote(p.ticketId, p.log);
          if (r.kind === 'offline') break;
          if (r.cloud) cloud.adoptServer(r.cloud);
          if (r.kind === 'paid') cloud.notify(`Kampagnen-Duell nachträglich gewertet${r.granted.length ? ` – ${grantedText(r.granted)}` : ''}.`);
        } else {
          const r = await finishAdventureRemote(p.ticketId, p.log);
          if (r.kind === 'offline') break;
          if (r.cloud) cloud.adoptServer(r.cloud);
          if (r.kind === 'paid') cloud.notify(`Nachträglich gutgeschrieben: 🪙 ${r.reward.coins}${r.reward.newCard ? ' und eine neue Karte' : ''}.`);
        }
        list = list.filter((x) => x.ticketId !== p.ticketId);
        writePending(uid, list);
      }
      busy = false;
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

  return (
    <>
    <PageArt design={pageDesign} />
    <SymbolTips />
    <div className={`app ${screen.name === 'admin' ? 'app-wide' : ''} ${pageDesign ? 'has-page-art' : ''}`} style={skinStyle(getSkin(save.skins.card).colors)}>
      {account?.kind === 'recovery' && <NewPassword onDone={() => setAccount({ kind: 'signedIn', account: account.account })} />}
      {account?.kind === 'signedOut' && !guest && screen.name === 'menu' && <Welcome onGuest={() => setGuestState(true)} />}
      {screen.name === 'account' && account?.kind === 'signedIn' && (
        <AccountPage account={account.account} onBack={toMenu} onRenamed={(name) => setAccount({ kind: 'signedIn', account: { ...account.account, name } })} />
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
          onOnline={cloud.uid && cloud.phase === 'ready' ? () => setScreen({ name: 'online' }) : undefined}
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
      {screen.name === 'shop' && <Shop save={save} onChange={setSave} onBack={toMenu} server={cloud.accountMode ? { adopt: cloud.adoptServer } : null} />}
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
      {screen.name === 'league' && (
        <League
          save={save}
          reducedMotion={reducedMotion}
          skin={getSkin(save.skins.runner).colors}
          runes={runesOn ? { player: duelRune('league'), equipped: equippedRune } : null}
          onSaveDeck={(leagueDeck) => setSave((s) => ({ ...s, leagueDeck }))}
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
          onFinish={(picks, inputs, skippedAt) => setScreen({ name: 'battle', picks, ticket: screen.ticket, run: { inputs, skippedAt } })}
          onQuit={toMenu}
        />
      )}
      {screen.name === 'battle' && (
        <Battle
          picks={screen.picks}
          unlocked={save.unlocked}
          reducedMotion={reducedMotion}
          ticket={screen.ticket}
          onEnd={(outcome, score, _first, record) => finishBattle(screen.picks, outcome, score, screen.ticket, screen.run, record)}
          onQuit={toMenu}
          runes={{ player: duelRune('adventure'), cpu: duelRune('adventure') ? 'random' : null }}
        />
      )}
      {screen.name === 'result' && (
        <Result outcome={screen.outcome} reward={screen.reward} score={screen.score} coins={screen.status === "checking" ? save.coins + screen.reward.coins : save.coins} status={screen.status} onAgain={startRun} onMenu={toMenu} />
      )}
    </div>
    </>
  );
}
