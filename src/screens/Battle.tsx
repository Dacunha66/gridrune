import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmButton } from '../components/ConfirmButton';
import { Burst } from '../components/Effects';
import {
  BOARD_SIZE, BattleState, Breakdown, HandCard, Move, Outcome, Side, applyMove, blickTargets, cellBreakdown, coinToss, cpuChoosesFirst, createBattle, isGameOver,
  other, outcome, score, totalMoves,
} from '../game/battle';
import { Arena, pickArena } from '../game/arenas';
import { CLASS_INFO, CLASS_TERRAIN, EFFECTS, TERRAIN_INFO, Terrain } from '../game/effects';
import { getCard } from '../game/cards';
import { CardInspect } from '../components/CardInspect';
import { BoardArt } from '../components/DesignArt';
import { isSymbolTipOpen } from '../components/SymbolTips';
import { ACTIVE, layoutVars } from '../game/designs';
import { AiOptions, chooseCpuMove, drawCpuHand } from '../game/ai';
import { Rng, createRng } from '../game/rng';
import { Pick } from '../game/runner';
import { Action, BUILTIN_RUNES } from '../game/runes';
import { CARD_STYLE_LABEL, cycleCardStyle, useCardStyle, useDevTools } from '../game/cardStyle';

interface Props {
  picks: Pick[];
  unlocked: string[];
  reducedMotion: boolean;
  /** `first` = who actually started (after the coin toss); `record` = start position and every move (campaign goals). */
  onEnd: (outcome: Outcome, score: { player: number; cpu: number }, first: Side, record: DuelRecord) => void;
  onQuit: () => void;
  /** League round: fixed opponent hand, rock cells, given or tossed start. Without it: adventure duel. */
  setup?: BattleSetup;
  /** Equipped runes (null = none). 'random' = a random basic rune for the computer. */
  runes?: { player: string | null; cpu: string | null | 'random' };
}

export interface BattleSetup {
  cpuHand: HandCard[];
  /** null = coin toss with choice (round 1 and deciders). */
  first: Side | null;
  rocks: number[];
  /** Arena of this round (the same for both players). */
  arena: Arena;
  /** Shown above the board, e.g. "Runde 2 · Stand 1:0". */
  label: string;
  tossRng: Rng;
  finishLabel: string;
  /** Computer strength (campaign); default = the classic opponent. */
  ai?: AiOptions;
  /** Marker on discovery cards in the hand (default "Neutral"). */
  badgeText?: string;
  /** Runes of both sides for this duel. */
  runes?: { player: string | null; cpu: string | null };
}

/** A finished duel that can be replayed exactly: start position (after the toss) and all moves. */
export interface DuelRecord {
  start: BattleState;
  moves: Action[];
}

/** True while the card gets a terrain bonus – its element or a terrain effect (soft green glow on the card). */
function terrainBonus(cardId: string, info: Breakdown): boolean {
  const effect = getCard(cardId).effect;
  const terrainEffect = effect && EFFECTS[effect].terrain ? EFFECTS[effect].name : null;
  return info.parts.some((p) => p.kind === 'element' || (p.kind === 'aura' && p.source === terrainEffect));
}

/** Full effect text under the large preview (the card itself shows at most three lines). */
function previewText(cardId: string) {
  const def = getCard(cardId);
  const effect = def.effect ? EFFECTS[def.effect] : null;
  const cls = def.cls ? CLASS_INFO[def.cls].label : '';
  return effect ? <><b>{effect.name}:</b> {effect.text}</> : `${cls}${cls ? ' · ' : ''}kein Spezialeffekt`;
}

/** Centre of a board cell in % of the board (the board padding is small enough to ignore). */
function cellCenter(cell: number): { x: number; y: number } {
  return { x: ((cell % BOARD_SIZE) + 0.5) * (100 / BOARD_SIZE), y: (Math.floor(cell / BOARD_SIZE) + 0.5) * (100 / BOARD_SIZE) };
}

export function Battle({ picks, unlocked, reducedMotion, onEnd, onQuit, setup, runes }: Props) {
  const rng = useMemo(() => createRng(), []);
  // Adventure duels take a random active arena; league rounds bring their own.
  const arena = useMemo(() => setup?.arena ?? pickArena(rng), [setup, rng]);
  // Board picture and grid layout chosen in the board designer (only looks – the 16 cells stay the same).
  const [boardDesign] = useState(() => ACTIVE.board);
  const [initial] = useState<BattleState>(() => {
    const r = setup?.runes ?? runes;
    const basic = BUILTIN_RUNES.map((x) => x.id);
    const cpuRune = r?.cpu === 'random' ? basic[Math.floor(rng() * basic.length)] : r?.cpu ?? null;
    return createBattle(
      picks.map((p) => ({ cardId: p.cardId, mod: p.mod })), setup?.cpuHand ?? drawCpuHand(rng), setup?.first ?? 'player', setup?.rocks ?? [], arena.cells,
      { player: r?.player ?? null, cpu: cpuRune },
    );
  });
  const [state, setState] = useState<BattleState>(initial);
  const record = useRef<DuelRecord>({ start: initial, moves: [] });
  /** Hand card shown large while it is held. */
  const [preview, setPreview] = useState<{ id: string; mod: number } | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True after a long press, so the click that follows does not select the card. */
  const pressedLong = useRef(false);
  const longPress = (show: () => void) => {
    const end = () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = null;
      setPreview(null);
    };
    return {
      onPointerDown: () => {
        pressedLong.current = false;
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = setTimeout(() => {
          pressedLong.current = true;
          // Holding a symbol shows its explanation instead of the large card.
          if (!isSymbolTipOpen()) show();
        }, 420);
      },
      onPointerUp: end,
      onPointerLeave: end,
      onPointerCancel: end,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    };
  };
  /** Board card whose details are open. */
  const [inspect, setInspect] = useState<number | null>(null);
  /** "Schwächender Blick" waiting for its target: chosen cell and possible targets. */
  const [targeting, setTargeting] = useState<{ cell: number; targets: number[] } | null>(null);
  const terrainsUsed = useMemo(() => [...new Set(arena.cells)].filter((t): t is Exclude<Terrain, 'normal'> => t !== 'normal'), [arena]);
  const [phase, setPhase] = useState<'toss' | 'play'>(setup?.first ? 'play' : 'toss');
  const [selected, setSelected] = useState<number | null>(null);
  const [banner, setBanner] = useState<string | null>(setup?.first ? (setup.first === 'player' ? 'Du beginnst!' : 'Der Gegner beginnt!') : null);
  /** Captured cells still showing their old colour until the flip animation starts. */
  const [pendingFlips, setPendingFlips] = useState<number[]>([]);
  const [showClashes, setShowClashes] = useState(false);
  const ended = useRef(false);
  const starter = useRef<Side>(setup?.first ?? 'player');
  const over = isGameOver(state);
  const sc = score(state);
  const discoveryIndexes = useMemo(() => new Set(picks.flatMap((p, i) => (p.kind === 'discovery' ? [i] : []))), [picks]);
  // Map current hand positions back to the original pick (to keep the "NEU" marker).
  const [handOrigin, setHandOrigin] = useState<number[]>(() => picks.map((_, i) => i));
  const animating = pendingFlips.length > 0;
  const fxTime = reducedMotion ? 0 : 1;
  // Admin test of the card designs: switch the look mid-duel (nothing in the game changes).
  const devTools = useDevTools();
  const cardStyle = useCardStyle();
  const [styleToast, setStyleToast] = useState<string | null>(null);
  useEffect(() => {
    if (!styleToast) return;
    const t = setTimeout(() => setStyleToast(null), 1400);
    return () => clearTimeout(t);
  }, [styleToast]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1300);
    return () => clearTimeout(t);
  }, [banner]);

  // After every move: show the comparisons, then flip captured cards.
  useEffect(() => {
    if (state.lastPlaced === null) return;
    setPendingFlips(state.lastFlips);
    setShowClashes(state.lastClashes.length > 0 || state.lastEvents.length > 0);
    const flip = setTimeout(() => setPendingFlips([]), 550 * fxTime);
    const hide = setTimeout(() => setShowClashes(false), 1300 * fxTime + 300);
    return () => {
      clearTimeout(flip);
      clearTimeout(hide);
    };
  }, [state, fxTime]);

  // Computer turn.
  useEffect(() => {
    if (phase !== 'play' || over || state.turn !== 'cpu') return;
    const delay = reducedMotion ? 450 : state.lastClashes.length > 0 || state.lastEvents.length > 0 ? 1250 : 800;
    const t = setTimeout(() => {
      const move = chooseCpuMove(state, rng, setup?.ai);
      record.current.moves.push(move);
      setState(applyMove(state, move));
    }, delay);
    return () => clearTimeout(t);
  }, [state, over, rng, reducedMotion, phase, setup?.ai]);

  const start = useCallback((first: Side) => {
    starter.current = first;
    record.current = { start: { ...initial, turn: first }, moves: [] };
    setState((s) => ({ ...s, turn: first }));
    setPhase('play');
    setBanner(first === 'player' ? 'Du beginnst!' : 'Der Gegner beginnt!');
  }, [initial]);

  function play(handIndex: number, cell: number, target?: number) {
    const move: Move = target === undefined ? { handIndex, cell } : { handIndex, cell, target };
    record.current.moves.push(move);
    setState(applyMove(state, move));
    setHandOrigin(handOrigin.filter((_, i) => i !== handIndex));
    setSelected(null);
    setTargeting(null);
  }

  function tapCell(cell: number) {
    if (targeting) {
      if (targeting.targets.includes(cell) && selected !== null) play(selected, targeting.cell, cell);
      else setTargeting(null);
      return;
    }
    if (state.board[cell]) {
      setInspect(cell);
      return;
    }
    if (phase !== 'play' || over || animating || state.turn !== 'player' || selected === null) return;
    // With several enemies next to the cell, "Schwächender Blick" asks for its target first.
    const targets = blickTargets(state.board, cell, state.hands.player[selected], 'player');
    if (targets.length > 1) setTargeting({ cell, targets });
    else play(selected, cell);
  }

  function finish() {
    if (ended.current) return;
    ended.current = true;
    onEnd(outcome(state), sc, starter.current, record.current);
  }

  const result = over && !animating ? outcome(state) : null;
  const winner: Side | null = result === 'win' ? 'player' : result === 'loss' ? 'cpu' : null;
  const selectedDef = selected !== null && state.hands.player[selected] ? getCard(state.hands.player[selected].cardId) : null;
  const selectedEffect = selectedDef?.effect ? EFFECTS[selectedDef.effect] : null;
  /** Terrain of the selected card's element, if this arena has it. */
  const selectedElement = selectedDef?.cls && CLASS_TERRAIN[selectedDef.cls] && state.terrain.includes(CLASS_TERRAIN[selectedDef.cls]!) ? CLASS_TERRAIN[selectedDef.cls]! : null;
  const hint = phase === 'toss'
    ? 'Ein Münzwurf entscheidet, wer wählen darf.'
    : over
      ? ''
      : targeting
        ? '👁 Ziel für −1 antippen · anderes Feld = zurück'
        : state.turn === 'cpu'
          ? 'Der Gegner überlegt …'
          : selected === null
            ? 'Karte wählen · Feldkarte antippen = Details'
            : selectedEffect
              ? `${selectedEffect.cls ? CLASS_INFO[selectedEffect.cls].icon : '✦'} ${selectedEffect.name}: ${selectedEffect.short}`
              : selectedElement
                ? `${CLASS_INFO[selectedDef!.cls!].icon} ${CLASS_INFO[selectedDef!.cls!].label}: auf ${TERRAIN_INFO[selectedElement].icon} ${TERRAIN_INFO[selectedElement].label} +1 auf alle Werte`
                : 'Tippe auf ein freies Feld.';
  const placedAt = state.lastPlaced !== null ? cellCenter(state.lastPlaced) : null;

  return (
    <main className="screen battle">
      {/* One compact bar: give up, score, move counter, whose turn – leaves the height for board and hand. */}
      <header className="battle-top">
        <ConfirmButton label="✕" ariaLabel="Duell abbrechen (keine Belohnung)" confirmLabel="Aufgeben?" onConfirm={onQuit} skipConfirm={over} />
        <div className="scorebar" aria-live="polite">
          <span key={`p${sc.player}`} className="score blue pop">Du {sc.player}</span>
          <span className="moves" aria-label={`Zug ${Math.min(state.moveCount + 1, totalMoves(state))} von ${totalMoves(state)}, Gegner hat noch ${state.hands.cpu.length} Karten`}>
            Zug {Math.min(state.moveCount + 1, totalMoves(state))}/{totalMoves(state)}
          </span>
          <span key={`c${sc.cpu}`} className="score red pop">{sc.cpu} Gegner</span>
        </div>
        {devTools && (
          <button type="button" className="btn btn-small style-btn" aria-label={`Kartendesign wechseln, jetzt ${CARD_STYLE_LABEL[cardStyle]}`} onClick={() => setStyleToast(CARD_STYLE_LABEL[cycleCardStyle()])}>🎨</button>
        )}
        <div className={`turn-pill ${phase === 'play' ? state.turn : ''}`}>
          {phase === 'toss' ? 'Münzwurf' : over ? 'Ende' : state.turn === 'player' ? 'Dein Zug' : 'Gegner'}
        </div>
      </header>

      {setup && <p className="round-label">{setup.label}</p>}
      {terrainsUsed.length > 0 && (
        <p className="arena-label">
          {arena.name}: {terrainsUsed.map((t) => <span key={t} className={`terrain-chip terrain-${t}`}>{TERRAIN_INFO[t].icon} {TERRAIN_INFO[t].label}</span>)}
        </p>
      )}
      <div className="play-area">
        <div
          className={`board ${boardDesign ? 'has-art' : ''} ${boardDesign?.layout.cellBorders ? 'cell-borders' : ''} ${result ? `ended ${result}` : ''}`}
          style={boardDesign ? (layoutVars(boardDesign.layout) as CSSProperties) : undefined}
          role="grid"
          aria-label="Spielfeld 4 mal 4"
        >
          <BoardArt design={boardDesign} />
          {state.board.map((cell, i) => {
            if (state.rocks.includes(i)) {
              return <div key={i} role="gridcell" className="cell rock" aria-label="Fels – hier kann niemand legen">🪨</div>;
            }
            const pending = pendingFlips.includes(i);
            const owner = cell ? (pending ? other(cell.owner) : cell.owner) : null;
            const flipped = !pending && state.lastFlips.includes(i);
            const placed = state.lastPlaced === i;
            const canDrop = phase === 'play' && !cell && selected !== null && state.turn === 'player' && !over && !animating && !targeting;
            const terrain = state.terrain[i];
            const info = cell ? cellBreakdown(state.board, state.terrain, i) : null;
            const isTarget = targeting?.targets.includes(i);
            // The selected card would get its element bonus here.
            const elementHere = canDrop && selectedDef?.cls && CLASS_TERRAIN[selectedDef.cls] === terrain;
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                className={`cell terrain-${terrain} ${canDrop ? 'droppable' : ''} ${elementHere ? 'element-here' : ''} ${isTarget ? 'targetable' : ''} ${targeting?.cell === i ? 'pending' : ''}`}
                onClick={() => tapCell(i)}
                disabled={!cell && (over || phase !== 'play')}
                aria-label={cell ? undefined : `Feld ${Math.floor(i / 4) + 1}-${(i % 4) + 1} frei${terrain !== 'normal' ? `, ${TERRAIN_INFO[terrain].label}` : ''}`}
              >
                {!cell && terrain !== 'normal' && <span className="terrain-icon" aria-hidden="true">{TERRAIN_INFO[terrain].icon}</span>}
                {cell && owner && (
                  <Card
                    key={`${cell.cardId}-${owner}`}
                    id={cell.cardId}
                    mod={cell.mod}
                    values={info!.values}
                    shield={info!.barrier}
                    terrainGlow={terrainBonus(cell.cardId, info!)}
                    owner={owner}
                    size="sm"
                    className={[
                      flipped ? 'anim-flip' : placed ? 'anim-drop' : '',
                      pending ? 'under-attack' : '',
                      winner && owner === winner ? 'winner-glow' : '',
                    ].join(' ')}
                  />
                )}
              </button>
            );
          })}

          {showClashes && placedAt && state.lastClashes.map((c) => {
            const t = cellCenter(c.cell);
            const x = `${(placedAt.x + t.x) / 2}%`;
            const y = `${(placedAt.y + t.y) / 2}%`;
            return (
              <div key={`${state.moveCount}-${c.cell}`}>
                <div className={`clash ${c.captured ? 'won' : 'held'}`} style={{ left: x, top: y }}>
                  {c.attack} {c.captured ? '>' : c.attack === c.defense ? '=' : '<'} {c.defense}
                </div>
                {c.captured && !reducedMotion && (
                  <Burst x={x} y={y} colors={state.board[c.cell]?.owner === 'player' ? ['#fff', '#9cc3ff', '#ffcc33'] : ['#fff', '#ffb0b0', '#ffcc33']} count={12} spread={34} />
                )}
              </div>
            );
          })}

          {showClashes && state.lastEvents.map((e, k) => {
            const p = cellCenter(e.cell);
            return (
              <div key={`${state.moveCount}-fx-${k}`} className={`fx-pop ${e.kind}`} style={{ left: `${p.x}%`, top: `${p.y - 12}%` }}>{e.text}</div>
            );
          })}

          {phase === 'toss' && <CoinToss reducedMotion={reducedMotion} rng={setup?.tossRng ?? rng} onDecide={start} />}
          {banner && <div className="board-banner">{banner}</div>}
          {result && (
            <div className={`board-banner end ${result}`}>
              <p>{result === 'win' ? '🏆 Sieg!' : result === 'draw' ? '🤝 Unentschieden' : '💀 Niederlage'}</p>
              <button type="button" className="btn btn-primary" onClick={finish}>{setup?.finishLabel ?? 'Weiter zur Belohnung'}</button>
            </div>
          )}
        </div>

        <p className="hint" aria-live="polite">{hint}</p>

        {/* Hand: one row to swipe through; tap = select, hold = large preview. */}
        <div className="hand" aria-label="Deine Hand">
          {state.hands.player.map(({ cardId: id, mod }, i) => (
            <div key={handOrigin[i]} className="hand-slot" {...longPress(() => setPreview({ id, mod }))}>
              <Card
                id={id}
                mod={mod}
                size="sm"
                badge={discoveryIndexes.has(handOrigin[i]) ? 'discovery' : null}
                badgeText={setup ? setup.badgeText ?? 'Neutral' : unlocked.includes(id) ? '★' : 'NEU'}
                selected={selected === i}
                onClick={() => {
                  if (pressedLong.current) return;
                  if (phase !== 'play' || state.turn !== 'player' || over) return;
                  setTargeting(null);
                  setSelected(selected === i ? null : i);
                }}
              />
            </div>
          ))}
        </div>
      </div>
      {preview && (
        <div className="card-preview" aria-live="polite">
          <Card id={preview.id} mod={preview.mod} size="lg" detail />
          <p className="preview-text">{previewText(preview.id)}</p>
        </div>
      )}
      {styleToast && <div className="style-toast" role="status">🎨 {styleToast}</div>}
      {inspect !== null && state.board[inspect] && (
        <CardInspect board={state.board} terrain={state.terrain} cell={inspect} onClose={() => setInspect(null)} />
      )}
    </main>
  );
}

function CoinToss({ reducedMotion, rng, onDecide }: { reducedMotion: boolean; rng: () => number; onDecide: (first: Side) => void }) {
  const [stage, setStage] = useState<'ready' | 'spinning' | 'result'>('ready');
  const [winner, setWinner] = useState<Side | null>(null);

  function toss() {
    const w = coinToss(rng);
    setWinner(w);
    setStage('spinning');
    setTimeout(() => setStage('result'), reducedMotion ? 150 : 1700);
  }

  // The computer decides on its own after a short pause.
  useEffect(() => {
    if (stage !== 'result' || winner !== 'cpu') return;
    const t = setTimeout(() => onDecide(cpuChoosesFirst()), reducedMotion ? 900 : 2000);
    return () => clearTimeout(t);
  }, [stage, winner, onDecide, reducedMotion]);

  return (
    <div className="toss" role="dialog" aria-label="Münzwurf">
      <div className={`coin-wrap ${stage === 'spinning' ? 'tossing' : ''}`}>
        <div className={`coin ${stage === 'ready' ? 'idle' : `flip-${winner}`}`}>
          <div className="coin-face front"><span>DU</span></div>
          <div className="coin-face back"><span>GEGNER</span></div>
        </div>
      </div>
      {stage === 'ready' && (
        <>
          <p className="toss-title">Wer beginnt?</p>
          <button type="button" className="btn btn-primary" onClick={toss}>🪙 Münze werfen</button>
        </>
      )}
      {stage === 'spinning' && <p className="toss-title">…</p>}
      {stage === 'result' && winner === 'player' && (
        <>
          <p className="toss-title">Du gewinnst den Münzwurf!</p>
          <div className="toss-actions">
            <button type="button" className="btn btn-primary" onClick={() => onDecide('player')}>Ich beginne</button>
            <button type="button" className="btn" onClick={() => onDecide('cpu')}>Gegner beginnt</button>
          </div>
        </>
      )}
      {stage === 'result' && winner === 'cpu' && (
        <p className="toss-title">Der Gegner gewinnt den Münzwurf<br /><small>und lässt dich beginnen.</small></p>
      )}
    </div>
  );
}
