// Draft League screens: building a deck of 20 from the shared pool of 30, and the practice mode against the
// computer (same pool rules, same fair track, no rewards). The online draft uses the deck builder from here.
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { Confetti } from '../components/Effects';
import { Header } from './Header';
import { Battle, BattleSetup } from './Battle';
import { Runner } from './Runner';
import { leagueArena } from '../game/arenas';
import { Outcome } from '../game/battle';
import { RARITY_LABEL, Rarity, cardPower, getCard } from '../game/cards';
import { CLASS_INFO, isCardClass } from '../game/effects';
import { DRAFT_DECK_SIZE, DRAFT_POOL_PLAN, completeDraftDeck, computerDraftHand, draftLayout, draftPool } from '../game/draft';
import { newMatchSeed, roundRock } from '../game/league';
import { createRng } from '../game/rng';
import { Pick } from '../game/runner';

/** Seconds left until an ISO time (updates every half second). */
export function useSecondsLeft(deadline: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000)) : null;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Choose 20 of the 30 pool cards. With a deadline, the deck is completed and sent when the time is up. */
export function DraftDeckBuilder({ pool, deadline, busy, title, onBack, onDone }: {
  pool: string[]; deadline: string | null; busy?: boolean; title: string; onBack: () => void; onDone: (deck: string[]) => void;
}) {
  const [deck, setDeck] = useState<string[]>([]);
  const [sort, setSort] = useState<'rarity' | 'power' | 'class'>('rarity');
  const left = useSecondsLeft(deadline);
  const [sent, setSent] = useState(false);
  const send = (d: string[]) => {
    if (sent) return;
    setSent(true);
    onDone(d);
  };
  useEffect(() => {
    if (left === 0 && !sent) send(completeDraftDeck(pool, deck));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  const sorted = useMemo(() => {
    const order: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5 };
    return [...pool].sort((a, b) => {
      const ca = getCard(a);
      const cb = getCard(b);
      if (sort === 'power') return cardPower(cb) - cardPower(ca) || a.localeCompare(b);
      if (sort === 'class') return (ca.cls ?? '').localeCompare(cb.cls ?? '') || cardPower(cb) - cardPower(ca);
      return order[cb.rarity] - order[ca.rarity] || cardPower(cb) - cardPower(ca);
    });
  }, [pool, sort]);
  const toggle = (id: string) => {
    if (deck.includes(id)) setDeck(deck.filter((d) => d !== id));
    else if (deck.length < DRAFT_DECK_SIZE) setDeck([...deck, id]);
  };
  const classes = deck.reduce<Record<string, number>>((m, id) => {
    const c = getCard(id).cls ?? 'none';
    m[c] = (m[c] ?? 0) + 1;
    return m;
  }, {});
  return (
    <main className="screen draft-build">
      <Header title={title} onBack={onBack} right={left !== null ? <span className={`pill ${left <= 30 ? 'urgent-pill' : ''}`}>⏱ {fmt(left)}</span> : undefined} />
      <p className="hint">
        Wähle <b>{DRAFT_DECK_SIZE}</b> der {pool.length} Karten. Beide haben denselben Pool – dein Deck sieht der Gegner nicht.
        Legendäre Karten in deinem Deck kommen im Lauf sicher vorbei.
      </p>
      <div className="draft-bar">
        <span className={`draft-count ${deck.length === DRAFT_DECK_SIZE ? 'full' : ''}`}>{deck.length}/{DRAFT_DECK_SIZE}</span>
        <span className="draft-classes">{Object.entries(classes).map(([c, n]) => <span key={c}>{isCardClass(c) ? CLASS_INFO[c].icon : '◇'} {n}</span>)}</span>
        <select className="admin-input draft-sort" value={sort} aria-label="Sortieren" onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="rarity">Seltenheit</option>
          <option value="power">Stärke</option>
          <option value="class">Klasse</option>
        </select>
      </div>
      <div className="scroll">
        <div className="card-grid draft-grid">
          {sorted.map((id) => {
            const picked = deck.includes(id);
            return (
              <div key={id} className={`draft-pick ${picked ? 'picked' : ''}`}>
                <Card id={id} size="sm" onClick={() => toggle(id)} ariaLabel={`${getCard(id).name}, ${RARITY_LABEL[getCard(id).rarity]}${picked ? ', im Deck' : ''}`} />
                {picked && <span className="draft-tag">✓ Im Deck</span>}
              </div>
            );
          })}
        </div>
      </div>
      <div className="row-buttons draft-actions">
        <button type="button" className="btn" disabled={busy || sent} onClick={() => setDeck(completeDraftDeck(pool, deck))}>Auffüllen</button>
        <button type="button" className="btn btn-primary" disabled={busy || sent || deck.length !== DRAFT_DECK_SIZE} onClick={() => send(deck)}>
          {sent ? '☁️ …' : 'Deck fertig ▶'}
        </button>
      </div>
    </main>
  );
}

/** The pool plan in words, e.g. "11 gewöhnliche · 8 ungewöhnliche · …". */
export const poolPlanText = () => Object.entries(DRAFT_POOL_PLAN).map(([r, n]) => `${n} ${RARITY_LABEL[r as Rarity].toLowerCase()}`).join(' · ');

/** Practice against the computer: pool → deck → run → duel. Nothing is saved, no rewards. */
export function DraftPractice({ reducedMotion, skin, rune, onExit }: {
  reducedMotion: boolean; skin: [string, string, string]; rune: string | null; onExit: () => void;
}) {
  const [seed, setSeed] = useState(() => newMatchSeed());
  const pool = useMemo(() => draftPool(seed), [seed]);
  const [stage, setStage] = useState<{ k: 'deck' } | { k: 'run'; deck: string[] } | { k: 'duel'; picks: Pick[] } | { k: 'done'; outcome: Outcome; score: { player: number; cpu: number } }>({ k: 'deck' });
  const restart = () => {
    setSeed(newMatchSeed());
    setStage({ k: 'deck' });
  };
  if (stage.k === 'deck') {
    return <DraftDeckBuilder pool={pool} deadline={null} title="Draft-Übung" onBack={onExit} onDone={(deck) => setStage({ k: 'run', deck })} />;
  }
  if (stage.k === 'run') {
    const layout = draftLayout(seed, 'a', stage.deck);
    return (
      <Runner key={seed} deck={stage.deck} unlocked={[]} reducedMotion={reducedMotion} skin={skin} layout={layout}
        onFinish={(picks) => setStage({ k: 'duel', picks })} onQuit={onExit} />
    );
  }
  if (stage.k === 'duel') return <PracticeDuel seed={seed} pool={pool} picks={stage.picks} rune={rune} reducedMotion={reducedMotion} onEnd={(outcome, score) => setStage({ k: 'done', outcome, score })} onQuit={onExit} />;
  const title = stage.outcome === 'win' ? 'Sieg!' : stage.outcome === 'draw' ? 'Unentschieden' : 'Niederlage';
  return (
    <main className={`screen result result-${stage.outcome}`}>
      {stage.outcome === 'win' && !reducedMotion && <Confetti count={50} />}
      <div className="scroll result-body">
        <div className="result-icon" aria-hidden="true">{stage.outcome === 'win' ? '🏆' : stage.outcome === 'draw' ? '🤝' : '💀'}</div>
        <h1>{title}</h1>
        <p className="muted">Draft-Übung gegen die KI</p>
        <p className="result-score"><span className="blue">{stage.score.player}</span> : <span className="red">{stage.score.cpu}</span></p>
        <p className="muted small">Übung – keine Belohnung. Online gegen echte Spieler gibt es 🪙 für einen Sieg.</p>
      </div>
      <div className="menu-buttons">
        <button type="button" className="btn btn-primary btn-big" onClick={restart}>🃏 Neuer Pool</button>
        <button type="button" className="btn" onClick={onExit}>Zurück</button>
      </div>
    </main>
  );
}

function PracticeDuel({ seed, pool, picks, rune, reducedMotion, onEnd, onQuit }: {
  seed: string; pool: string[]; picks: Pick[]; rune: string | null; reducedMotion: boolean;
  onEnd: (o: Outcome, s: { player: number; cpu: number }) => void; onQuit: () => void;
}) {
  const [setup] = useState<BattleSetup>(() => {
    const arena = leagueArena(seed, 0);
    // The computer builds its deck from the same pool and takes the strongest card at every gate of its own track.
    const cpuHand = computerDraftHand(draftLayout(seed, 'b', completeDraftDeck(pool)));
    return {
      cpuHand, first: null, rocks: [roundRock(seed, 0, arena.cells)], arena, label: '🃏 Draft-Übung', tossRng: createRng(),
      finishLabel: 'Ergebnis', ai: { level: 'medium' }, runes: { player: rune, cpu: null },
    };
  });
  return <Battle picks={picks} unlocked={[]} reducedMotion={reducedMotion} setup={setup} onEnd={(o, s) => onEnd(o, s)} onQuit={onQuit} />;
}
