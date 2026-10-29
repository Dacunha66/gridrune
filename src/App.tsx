import { useCallback, useEffect, useRef, useState } from 'react';
import { Outcome } from './game/battle';
import { Reward, applyReward, computeReward } from './game/rewards';
import { Pick } from './game/runner';
import { SaveData, loadSave, writeSave } from './game/storage';
import { Menu } from './screens/Menu';
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
import { getDb, isAdmin, loadArenas, loadCampaign, loadCardRecords, loadDesignState, loadDesigns, loadGameSettings, loadRunes } from './game/cardStore';
import { ACTIVE, Design, DesignState, setActiveDesigns } from './game/designs';
import { PageArt } from './components/DesignArt';
import { setArenas } from './game/arenas';
import { GameSettings, SETTINGS, released, setGameSettings } from './game/settings';
import { GameMode, RUNES, RuneDef, availableRunes, setRunes } from './game/runes';
import { Admin } from './screens/Admin';
import { League } from './screens/League';
import { Campaign } from './screens/Campaign';
import { Runes } from './screens/Runes';
import { runeUnlocked } from './game/campaignProgress';
import { setDevTools } from './game/cardStyle';
import { SymbolTips } from './components/SymbolTips';
import { CampaignContent, mergeContent, setCampaign } from './game/campaign';
import { CampaignProgress, loadProgress, writeProgress } from './game/campaignProgress';

export type Screen =
  | { name: 'menu' | 'collection' | 'deck' | 'rules' | 'shop' | 'admin' | 'league' | 'runes' }
  /** preview = admin test (drafts visible, nothing saved); missionId = start this mission directly. */
  | { name: 'campaign'; preview?: boolean; missionId?: string }
  | { name: 'runner'; runId: number; deck: string[] }
  | { name: 'battle'; picks: Pick[] }
  | { name: 'result'; outcome: Outcome; reward: Reward; score: { player: number; cpu: number } };

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

  useEffect(() => {
    setSaveOk(writeSave(save));
  }, [save]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
  }, [reducedMotion]);

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
    if (screenRef.current === 'runner' || screenRef.current === 'battle' || screenRef.current === 'league' || screenRef.current === 'campaign') {
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
    writeProgress(campaignProgress);
  }, [campaignProgress]);

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
      const [records, settings, arenas, designs, designState, savedCampaign, savedRunes] = await Promise.all([
        loadCardRecords(db), loadGameSettings(db), loadArenas(db), loadDesigns(db), loadDesignState(db), loadCampaign(db), loadRunes(db),
      ]);
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
  // Runes: everyone has the basic runes; campaign runes are unlocked by missions or stars.
  const runesOn = released(features.runes, admin);
  const ownedRunes = [...new Set([...save.runes.owned, ...RUNES.filter((r) => runeUnlocked(r, campaignProgress, campaign)).map((r) => r.id)])];
  /** Rune the player takes into a duel of this mode (null = none or not allowed there). */
  const duelRune = (mode: GameMode): string | null => {
    if (!runesOn || !save.runes.equipped) return null;
    return availableRunes(mode, ownedRunes).some((r) => r.id === save.runes.equipped) ? save.runes.equipped : null;
  };
  const runeLockText = (r: RuneDef) => {
    if (r.unlock.kind === 'mission') {
      const missionId = r.unlock.missionId;
      return `Kampagne: Mission „${campaign.missions.find((m) => m.id === missionId)?.name ?? missionId}“ gewinnen`;
    }
    return r.unlock.kind === 'stars' ? `Kampagne: ${r.unlock.n} ★ sammeln` : '';
  };

  const startRun = () => setScreen({ name: 'runner', runId: Date.now(), deck: repairDeck(save.deck, save.unlocked, CARDS).deck });
  const toMenu = useCallback(() => {
    setScreen({ name: 'menu' });
    const pending = pendingRecords.current;
    if (pending) setTimeout(() => applyRecords(pending), 0);
  }, [applyRecords]);

  const finishBattle = (picks: Pick[], outcome: Outcome, score: { player: number; cpu: number }) => {
    const reward = computeReward(outcome, picks, save.unlocked);
    setSave((prev) => applyReward(prev, outcome, reward));
    setScreen({ name: 'result', outcome, reward, score });
  };

  return (
    <>
    <PageArt design={pageDesign} />
    <SymbolTips />
    <div className={`app ${screen.name === 'admin' ? 'app-wide' : ''} ${pageDesign ? 'has-page-art' : ''}`} style={skinStyle(getSkin(save.skins.card).colors)}>
      {screen.name === 'menu' && (
        <Menu
          save={save}
          saveOk={saveOk}
          isAdmin={admin}
          onPlay={startRun}
          onNavigate={(name) => setScreen(name === 'campaign' ? { name } : { name })}
          runes={runesOn}
          onToggleReducedMotion={() =>
            setSave((s) => ({ ...s, settings: { ...s.settings, reducedMotion: !s.settings.reducedMotion } }))
          }
        />
      )}
      {screen.name === 'collection' && <Collection save={save} onBack={toMenu} />}
      {screen.name === 'deck' && (
        <DeckEditor save={save} onSave={(deck) => setSave((s) => ({ ...s, deck }))} onBack={toMenu} />
      )}
      {screen.name === 'rules' && <Rules onBack={toMenu} />}
      {screen.name === 'runes' && (
        <Runes owned={ownedRunes} equipped={save.runes.equipped} lockText={runeLockText} onBack={toMenu}
          onEquip={(id) => setSave((s) => ({ ...s, runes: { ...s.runes, equipped: id } }))} />
      )}
      {screen.name === 'shop' && <Shop save={save} onChange={setSave} onBack={toMenu} />}
      {screen.name === 'league' && (
        <League
          save={save}
          reducedMotion={reducedMotion}
          skin={getSkin(save.skins.runner).colors}
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
          onFinish={(picks) => setScreen({ name: 'battle', picks })}
          onQuit={toMenu}
        />
      )}
      {screen.name === 'battle' && (
        <Battle
          picks={screen.picks}
          unlocked={save.unlocked}
          reducedMotion={reducedMotion}
          onEnd={(outcome, score) => finishBattle(screen.picks, outcome, score)}
          onQuit={toMenu}
          runes={{ player: duelRune('adventure'), cpu: runesOn ? 'random' : null }}
        />
      )}
      {screen.name === 'result' && (
        <Result outcome={screen.outcome} reward={screen.reward} score={screen.score} coins={save.coins} onAgain={startRun} onMenu={toMenu} />
      )}
    </div>
    </>
  );
}
