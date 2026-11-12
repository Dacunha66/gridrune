// Tutorial: the guided first duel (see game/tutorial.ts), then the end: with an account the server checks the duel
// and puts 7 Abenteurer-Packs and 1 Helden-Pack into the Postfach (once per account); a guest's duel waits on this
// device and is sent after signing in. "Überspringen" ends it at any time (it can be played again under "Mehr").
import { useRef, useState } from 'react';
import { Battle, BattleSetup } from './Battle';
import { GameIcon } from '../components/GameIcon';
import type { Arena } from '../game/arenas';
import { NORMAL_TERRAIN, Outcome, toHand } from '../game/battle';
import { createRng } from '../game/rng';
import { handPicks } from '../game/verify';
import { tutorialFinishRemote } from '../game/adventureApi';
import {
  TUTORIAL_AI, TUTORIAL_FIRST, TUTORIAL_PLAYER, TUTORIAL_REWARD_TEXT, setPendingTutorialLog, setTutorialState, tutorialAiRng, tutorialBubble, tutorialCpu,
} from '../game/tutorial';

const ARENA: Arena = { id: 'tutorial', name: 'Übungsplatz', cells: [...NORMAL_TERRAIN], status: 'active', ranked: false, updatedAt: '' };

type End = { outcome: Outcome; reward: 'sending' | 'paid' | 'already' | 'guest' | 'offline' | 'rejected' };

export function Tutorial({ signedIn, unlocked, reducedMotion, onMenu, onInbox, onAccount }: {
  signedIn: boolean;
  unlocked: string[];
  reducedMotion: boolean;
  onMenu: () => void;
  onInbox: () => void;
  onAccount: () => void;
}) {
  const [end, setEnd] = useState<End | null>(null);
  // One setup per visit: fixed decks, no shuffle, the computer's moves from the tutorial seed.
  const setup = useRef<BattleSetup>({
    cpuHand: toHand(tutorialCpu()), first: TUTORIAL_FIRST, rocks: [], arena: ARENA, label: 'Tutorial', tossRng: createRng(1),
    rng: tutorialAiRng(), finishLabel: 'Weiter', ai: TUTORIAL_AI, fixedOrder: true,
  }).current;
  const picks = useRef(handPicks(TUTORIAL_PLAYER)).current;

  async function finished(outcome: Outcome, log: { first: typeof TUTORIAL_FIRST; moves: unknown[] }) {
    setTutorialState('done');
    if (!signedIn) {
      setPendingTutorialLog(log as never);
      return setEnd({ outcome, reward: 'guest' });
    }
    setEnd({ outcome, reward: 'sending' });
    const r = await tutorialFinishRemote(log as never);
    if (r === 'offline') setPendingTutorialLog(log as never);
    setEnd({ outcome, reward: r });
  }

  function skip() {
    setTutorialState('skipped');
    onMenu();
  }

  if (!end) {
    return (
      <Battle
        picks={picks}
        unlocked={unlocked}
        reducedMotion={reducedMotion}
        setup={setup}
        guide={{ bubble: tutorialBubble, onSkip: skip }}
        onQuit={skip}
        onEnd={(outcome, _score, first, record) => finished(outcome, { first: first as typeof TUTORIAL_FIRST, moves: record.moves })}
      />
    );
  }

  const title = end.outcome === 'win' ? 'Gewonnen!' : end.outcome === 'draw' ? 'Unentschieden!' : 'Verloren – macht nichts!';
  return (
    <main className="screen tutorial-end">
      <div className="tutorial-card">
        <GameIcon name={end.outcome === 'win' ? 'crown' : end.outcome === 'draw' ? 'handshake' : 'book'} />
        <h1>{title}</h1>
        <p>Du hast das Tutorial geschafft. Jetzt kennst du das Wichtigste: abwechselnd legen, mit höheren Zahlen erobern, schwache Seiten an den Rand.</p>
        <p className="muted small">Effekte, Gelände und Runen lernst du unterwegs kennen – alles steht unter Mehr → Regeln.</p>
        <div className="tutorial-reward" aria-live="polite">
          <GameIcon name="gift" />
          {end.reward === 'sending' && <span>Belohnung wird geprüft …</span>}
          {end.reward === 'paid' && <span><b>{TUTORIAL_REWARD_TEXT}</b> liegen jetzt in deinem Postfach!</span>}
          {end.reward === 'already' && <span>Die Belohnung für das Tutorial hast du schon bekommen.</span>}
          {end.reward === 'guest' && <span>Mit einem Konto bekommst du dafür <b>{TUTORIAL_REWARD_TEXT}</b>. Nach der Anmeldung landen sie automatisch in deinem Postfach.</span>}
          {end.reward === 'offline' && <span>Keine Verbindung – die Belohnung wird nachgeholt, sobald du wieder online bist.</span>}
          {end.reward === 'rejected' && <span>Die Belohnung konnte nicht vergeben werden. Spiel das Tutorial unter Mehr bitte noch einmal.</span>}
        </div>
        <div className="tutorial-actions">
          {end.reward === 'paid' && <button type="button" className="btn btn-primary" onClick={onInbox}><GameIcon name="mail" /> Zum Postfach</button>}
          {end.reward === 'guest' && <button type="button" className="btn btn-primary" onClick={onAccount}><GameIcon name="user" /> Konto erstellen</button>}
          <button type="button" className={`btn ${end.reward === 'paid' || end.reward === 'guest' ? '' : 'btn-primary'}`} onClick={onMenu}>Zum Hauptmenü</button>
        </div>
      </div>
    </main>
  );
}

/** Offer for new players on the start screen: play the tutorial or skip it. */
export function TutorialOffer({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div className="modal tutorial-offer">
        <h2>Neu bei GridRune?</h2>
        <p>Im Tutorial lernst du in wenigen Minuten, wie ein Duell funktioniert – Schritt für Schritt auf dem echten Spielfeld.</p>
        <p className="tutorial-reward"><GameIcon name="gift" /> <span>Belohnung: <b>{TUTORIAL_REWARD_TEXT}</b> (mit Konto)</span></p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onStart}>Tutorial starten</button>
          <button type="button" className="btn" onClick={onSkip}>Überspringen</button>
        </div>
        <p className="muted small center">Du findest das Tutorial jederzeit unter Mehr.</p>
      </div>
    </div>
  );
}
