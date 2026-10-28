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
import { getDb, isAdmin, loadArenas, loadCardRecords, loadDesignState, loadDesigns, loadGameSettings } from './game/cardStore';
import { ACTIVE, Design, DesignState, setActiveDesigns } from './game/designs';
import { PageArt } from './components/DesignArt';
import { setArenas } from './game/arenas';
import { GameSettings, setGameSettings } from './game/settings';
import { Admin } from './screens/Admin';
import { League } from './screens/League';

export type Screen =
  | { name: 'menu' | 'collection' | 'deck' | 'rules' | 'shop' | 'admin' | 'league' }
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

  const applyRecords = useCallback((records: CardRecord[]) => {
    if (screenRef.current === 'runner' || screenRef.current === 'battle' || screenRef.current === 'league') {
      pendingRecords.current = records;
      return;
    }
    pendingRecords.current = null;
    const catalog = buildCatalog(records);
    setCardCatalog(catalog.active, catalog.known);
    setSave((s) => {
      const fixed = repairDeck(s.deck, s.unlocked, CARDS);
      return fixed.deck === s.deck && fixed.unlocked === s.unlocked ? s : { ...s, ...fixed };
    });
    setCatalogVersion((v) => v + 1);
  }, []);

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
      const [records, settings, arenas, designs, designState] = await Promise.all([
        loadCardRecords(db), loadGameSettings(db), loadArenas(db), loadDesigns(db), loadDesignState(db),
      ]);
      if (alive && designs && designState) applyDesigns(designs, designState);
      if (alive && settings) setGameSettings(settings);
      // Arenas are picked when a duel starts, so they can be applied right away.
      if (alive && arenas) setArenas(arenas);
      if (alive && records && records.length > 0) applyRecords(records);
      const ok = await isAdmin();
      if (alive) setAdmin(ok);
    })();
    return () => {
      alive = false;
    };
  }, [applyRecords, applyDesigns]);

  // Only cards that are in play right now (the database may have changed since the deck was built).
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
    <div className={`app ${screen.name === 'admin' ? 'app-wide' : ''} ${pageDesign ? 'has-page-art' : ''}`} style={skinStyle(getSkin(save.skins.card).colors)}>
      {screen.name === 'menu' && (
        <Menu
          save={save}
          saveOk={saveOk}
          isAdmin={admin}
          onPlay={startRun}
          onNavigate={(name) => setScreen({ name })}
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
        <Admin onCatalogChange={applyRecords} onSettingsChange={(s: GameSettings) => setGameSettings(s)} onDesignsChange={applyDesigns} onBack={toMenu} />
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
        />
      )}
      {screen.name === 'result' && (
        <Result outcome={screen.outcome} reward={screen.reward} score={screen.score} coins={save.coins} onAgain={startRun} onMenu={toMenu} />
      )}
    </div>
    </>
  );
}
