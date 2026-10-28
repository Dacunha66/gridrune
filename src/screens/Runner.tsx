import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmButton } from '../components/ConfirmButton';
import { Burst } from '../components/Effects';
import { RARITY_ORDER, Rarity, getCard } from '../game/cards';
import { createRng } from '../game/rng';
import { FINAL_GATE, GATE_COUNT, LANES, Pick, RunInput, RunnerEvent, RunnerLayout, RunnerSim, STUMBLE_PENALTY } from '../game/runner';

interface Props {
  deck: string[];
  unlocked: string[];
  reducedMotion: boolean;
  /** Runner skin colours: main, dark, light. */
  skin: [string, string, string];
  onFinish: (picks: Pick[], inputs: RunInput[]) => void;
  onQuit: () => void;
  /** League: a fixed, seed-generated track (no fast-forward, no skipping). */
  layout?: RunnerLayout;
}

interface Flying {
  key: number;
  cardId: string;
  discovery: boolean;
  mod: number;
  from: { x: number; y: number };
  slot: number;
}

const VIEW_DISTANCE = 80;
const PERSPECTIVE = 10;
const FAST = 3.5;

export function Runner({ deck, unlocked, reducedMotion, skin, onFinish, onQuit, layout }: Props) {
  const owned = useMemo(() => new Set(unlocked), [unlocked]);
  const sim = useMemo(() => (layout ? new RunnerSim(layout) : new RunnerSim(deck, createRng(), owned)), [layout, deck, owned]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [flying, setFlying] = useState<Flying[]>([]);
  const [fast, setFast] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'run' | 'done'>('ready');
  const [toast, setToast] = useState<string | null>(null);
  const [stumbled, setStumbled] = useState(false);
  const [lane, setLane] = useState(sim.lane);
  const [bursts, setBursts] = useState<{ key: number; x: number; y: number; colors: string[] }[]>([]);
  const [landed, setLanded] = useState<Set<number>>(() => new Set());
  /** Lane taken at each gate – the other two cards fade out on the canvas. */
  const pickedLanes = useRef(new Map<number, number>());
  const fastRef = useRef(false);
  const phaseRef = useRef(phase);
  const view = useRef({ laneX: 1, shake: 0, bob: 0, w: 0, h: 0 });
  fastRef.current = fast;
  phaseRef.current = phase;

  // Geometry shared by the canvas renderer and the flying-card animation.
  const project = useCallback((z: number, lane: number) => {
    const { w, h } = view.current;
    const horizon = h * 0.26;
    const bottom = h * 0.97;
    const p = PERSPECTIVE / (PERSPECTIVE + Math.max(z, -PERSPECTIVE * 0.5));
    const y = horizon + (bottom - horizon) * p;
    const half = w * 0.5 * p;
    const x = w / 2 + (lane - (LANES - 1) / 2) * (half * 2) / LANES;
    return { x, y, p, half };
  }, []);

  const handleEvents = useCallback((events: RunnerEvent[]) => {
    for (const e of events) {
      if (e.type === 'pick') {
        const at = project(1.2, e.lane);
        pickedLanes.current.set(e.gate, e.lane);
        setPicks((prev) => [...prev, { ...e.offer, gate: e.gate, mod: e.mod }]);
        const colors = e.mod < 0 ? ['#ff8a8a', '#ef4444', '#fff'] : e.offer.kind === 'discovery' ? ['#ffcc33', '#fff3b0', '#ffffff'] : ['#ffffff', '#b9d5ff', skin[0]];
        setBursts((prev) => [...prev, { key: e.gate, x: at.x, y: at.y - 60 * at.p, colors }]);
        setStumbled(false);
        setFlying((prev) => [...prev, {
          key: e.gate, cardId: e.offer.cardId, discovery: e.offer.kind === 'discovery', mod: e.mod, from: { x: at.x, y: at.y - 60 * at.p }, slot: e.gate,
        }]);
        if (e.mod < 0) setToast(`${getCard(e.offer.cardId).name} ist geschwächt (${e.mod})`);
        else if (e.offer.kind === 'discovery') setToast(`Entdeckung: ${getCard(e.offer.cardId).name}!`);
      } else if (e.type === 'bump') {
        view.current.shake = 0.35;
        setStumbled(true);
        setToast(`Stolperstein! Nächste Karte ${STUMBLE_PENALTY}`);
      } else if (e.type === 'finish') {
        setPhase('done');
      }
    }
  }, [project, skin]);

  // Start countdown.
  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => (p === 'ready' ? 'run' : p)), 1100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1100);
    return () => clearTimeout(t);
  }, [toast]);

  // Hand over to the duel once all cards are in.
  useEffect(() => {
    if (phase !== 'done') return;
    const t = setTimeout(() => onFinish(sim.picks.slice(), sim.inputs.slice()), reducedMotion ? 600 : 1400);
    return () => clearTimeout(t);
  }, [phase, sim, onFinish, reducedMotion]);

  // Main loop: simulation + drawing.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      view.current.w = rect.width;
      view.current.h = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (phaseRef.current === 'run') handleEvents(sim.update(dt, fastRef.current ? FAST : 1));
      const v = view.current;
      const k = reducedMotion ? 1 : Math.min(1, dt * 14);
      v.laneX += (sim.lane - v.laneX) * k;
      v.shake = Math.max(0, v.shake - dt);
      if (phaseRef.current === 'run' && !reducedMotion) v.bob += dt * (fastRef.current ? 22 : 12);
      draw(ctx, sim, v, project, owned, reducedMotion, skin, pickedLanes.current, !!layout);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [sim, handleEvents, project, owned, reducedMotion, skin]);

  const move = useCallback((dir: -1 | 1) => {
    if (phaseRef.current !== 'done') {
      sim.moveLane(dir);
      setLane(sim.lane);
    }
  }, [sim]);

  // Keyboard support (desktop testing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') move(-1);
      if (e.key === 'ArrowRight' || e.key === 'd') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  // Swipe detection.
  const touch = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const t = touch.current;
    if (!t || t.moved) return;
    const dx = e.clientX - t.x;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(e.clientY - t.y)) {
      move(dx < 0 ? -1 : 1);
      t.moved = true;
    }
  };
  const onPointerUp = () => {
    touch.current = null;
  };

  function skip() {
    if (phase === 'ready') setPhase('run');
    handleEvents(sim.skipToEnd());
  }

  return (
    <main className="screen runner">
      <header className="runner-hud">
        <ConfirmButton label="✕" ariaLabel="Lauf abbrechen" confirmLabel="Abbrechen?" onConfirm={onQuit} />
        <span className={`pill ${stumbled ? 'pill-warn' : ''}`}>{stumbled ? `⚠ ${STUMBLE_PENALTY}` : `Tor ${Math.min(picks.length + 1, GATE_COUNT)}/${GATE_COUNT}`}</span>
        {layout ? <span className="pill ranked-pill">Liga · Echtzeit</span> : (
          <>
            <button type="button" className={`btn btn-small ${fast ? 'active' : ''}`} onClick={() => setFast(!fast)} aria-pressed={fast}>
              ⏩ {fast ? '3×' : '1×'}
            </button>
            <button type="button" className="btn btn-small" onClick={skip} disabled={phase === 'done'}>⏭ Überspringen</button>
          </>
        )}
      </header>

      <div
        className="stage"
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="runner-canvas" aria-label="Laufstrecke mit drei Spuren" />
        {phase === 'ready' && <div className="stage-banner">Los geht’s!<small>Wische oder tippe ◀ ▶</small></div>}
        {phase === 'done' && <div className="stage-banner">8 Karten gesammelt!<small>Das Duell beginnt …</small></div>}
        {phase !== 'done' && sim.gates[picks.length] && (
          <div className="gate-preview" aria-live="polite">
            {layout
              ? <span className="gate-preview-label">Tor {picks.length + 1} · 2 aus deinem Deck + 1 neutral</span>
              : picks.length === FINAL_GATE
              ? <span className="gate-preview-label final">★ Finaltor: neue Karten – bei Sieg gehört sie dir</span>
              : <span className="gate-preview-label">Nächstes Tor {picks.length + 1} · aus deinem Deck</span>}
            <div className="gate-preview-cards">
              {sim.gates[picks.length].offers.map((o, i) => (
                <Card
                  key={`${picks.length}-${i}`}
                  id={o.cardId}
                  size="sm"
                  badge={o.kind === 'discovery' ? 'discovery' : null}
                  badgeText={layout ? 'Neutral' : owned.has(o.cardId) ? '★' : 'NEU'}
                  mod={i === lane && stumbled ? STUMBLE_PENALTY : 0}
                  className={i === lane ? 'lane-active' : ''}
                />
              ))}
            </div>
          </div>
        )}
        {toast && <div className="toast">{toast}</div>}
        {!reducedMotion && bursts.map((b) => (
          <Burst key={b.key} x={b.x} y={b.y} colors={b.colors} count={16} spread={70} onDone={() => setBursts((prev) => prev.filter((x) => x.key !== b.key))} />
        ))}
        <div className="legend" aria-hidden="true">
          <span><i className="dot silver" /> Deck</span>
          {layout ? <span><b className="legend-neutral">◆</b> Neutral</span> : <span><i className="dot gold" /> Entdeckung</span>}
          <span><i className="dot stone" /> Stein: −1</span>
        </div>
      </div>

      <div className="collected" aria-label={`Gesammelt ${picks.length} von ${GATE_COUNT}`}>
        {Array.from({ length: GATE_COUNT }, (_, i) => (
          <div key={i} className={`slot ${landed.has(i) ? 'pop' : ''} ${picks[i]?.kind === 'discovery' ? 'gold' : ''}`} ref={(el) => { slotRefs.current[i] = el; }}>
            {picks[i] && !flying.some((f) => f.slot === i) && (
              <Card id={picks[i].cardId} mod={picks[i].mod} owner="player" size="xs" badge={picks[i].kind === 'discovery' ? 'discovery' : null} />
            )}
          </div>
        ))}
      </div>

      <div className="lane-controls">
        <button type="button" className="btn btn-lane" onClick={() => move(-1)} aria-label="Nach links">◀</button>
        <button type="button" className="btn btn-lane" onClick={() => move(1)} aria-label="Nach rechts">▶</button>
      </div>

      {flying.map((f) => (
        <FlyingCard
          key={f.key}
          flying={f}
          stage={stageRef.current}
          target={slotRefs.current[f.slot]}
          reducedMotion={reducedMotion}
          onDone={() => {
            setFlying((prev) => prev.filter((x) => x.key !== f.key));
            setLanded((prev) => new Set(prev).add(f.slot));
          }}
        />
      ))}
    </main>
  );
}

function FlyingCard({ flying, stage, target, reducedMotion, onDone }: {
  flying: Flying; stage: HTMLDivElement | null; target: HTMLDivElement | null; reducedMotion: boolean; onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const el = ref.current;
    if (!el || !stage || !target || reducedMotion || typeof el.animate !== 'function') {
      done.current();
      return;
    }
    const s = stage.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const fromX = s.left + flying.from.x;
    const fromY = s.top + flying.from.y;
    const toX = t.left + t.width / 2;
    const toY = t.top + t.height / 2;
    const anim = el.animate(
      [
        { transform: `translate(${fromX}px, ${fromY}px) translate(-50%, -50%) scale(0.6) rotateY(0deg)`, opacity: 0.4 },
        { transform: `translate(${fromX}px, ${fromY - 30}px) translate(-50%, -50%) scale(1.6) rotateY(180deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${(fromX + toX) / 2}px, ${Math.min(fromY, toY) - 60}px) translate(-50%, -50%) scale(1.2) rotateY(360deg) rotate(-10deg)`, opacity: 1, offset: 0.65 },
        { transform: `translate(${toX}px, ${toY}px) translate(-50%, -50%) scale(0.6) rotateY(360deg)`, opacity: 1 },
      ],
      { duration: 850, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' },
    );
    anim.onfinish = () => done.current();
    return () => anim.cancel();
  }, [flying, stage, target, reducedMotion]);
  return (
    <div ref={ref} className="flying-card" aria-hidden="true">
      <Card id={flying.cardId} mod={flying.mod} owner="player" size="sm" badge={flying.discovery ? 'discovery' : null} />
    </div>
  );
}

// ---------- Canvas renderer ----------

type Project = (z: number, lane: number) => { x: number; y: number; p: number; half: number };

function draw(
  ctx: CanvasRenderingContext2D,
  sim: RunnerSim,
  v: { laneX: number; shake: number; bob: number; w: number; h: number },
  project: Project,
  owned: Set<string>,
  reducedMotion: boolean,
  skin: [string, string, string],
  pickedLanes: Map<number, number>,
  neutral: boolean,
) {
  const { w, h } = v;
  ctx.save();
  if (v.shake > 0 && !reducedMotion) ctx.translate((Math.random() - 0.5) * 8 * v.shake * 3, 0);

  // Sky.
  const horizon = h * 0.26;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#1b1442');
  sky.addColorStop(1, '#6a3e8f');
  ctx.fillStyle = sky;
  ctx.fillRect(-20, 0, w + 40, horizon + 1);
  // Distant mountains.
  ctx.fillStyle = '#2b1f55';
  ctx.beginPath();
  ctx.moveTo(-20, horizon);
  for (let i = 0; i <= 8; i++) ctx.lineTo((i / 8) * (w + 40) - 20, horizon - (i % 2 ? 26 : 10) - (i % 3) * 8);
  ctx.lineTo(w + 20, horizon);
  ctx.fill();
  // Moon.
  ctx.fillStyle = 'rgba(255,240,200,0.85)';
  ctx.beginPath();
  ctx.arc(w * 0.94, horizon * 0.22, 9, 0, Math.PI * 2);
  ctx.fill();

  // Ground.
  ctx.fillStyle = '#18233a';
  ctx.fillRect(-20, horizon, w + 40, h - horizon);

  // Road with moving bands.
  const step = 4;
  const offset = sim.distance % (step * 2);
  for (const layer of ['grass', 'road'] as const) {
    for (let z = VIEW_DISTANCE; z > -4; z -= step) {
      const zz = z - offset;
      const a = project(zz, 1);
      const b = project(zz - step, 1);
      const band = Math.floor((zz + sim.distance) / step) % 2 === 0;
      if (layer === 'grass') {
        ctx.fillStyle = band ? '#1f3a35' : '#1a312d';
        ctx.fillRect(-20, a.y, w + 40, b.y - a.y + 1);
        continue;
      }
      ctx.fillStyle = band ? '#3a3360' : '#332c55';
      ctx.beginPath();
      ctx.moveTo(w / 2 - a.half, a.y);
      ctx.lineTo(w / 2 + a.half, a.y);
      ctx.lineTo(w / 2 + b.half, b.y + 0.5);
      ctx.lineTo(w / 2 - b.half, b.y + 0.5);
      ctx.fill();
    }
  }
  // Lane dividers (dashed).
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  for (const edge of [-1 / 6, 1 / 6]) {
    for (let z = VIEW_DISTANCE; z > -4; z -= step * 2) {
      const zz = z - offset;
      const a = project(zz, 1);
      const b = project(zz - step, 1);
      ctx.lineWidth = Math.max(1, 3 * b.p);
      ctx.beginPath();
      ctx.moveTo(w / 2 + edge * a.half * 2, a.y);
      ctx.lineTo(w / 2 + edge * b.half * 2, b.y);
      ctx.stroke();
    }
  }

  // Objects far → near.
  type Obj = { z: number; draw: () => void };
  const objs: Obj[] = [];
  for (const o of sim.obstacles) {
    const z = o.distance - sim.distance;
    if (z < -1 || z > VIEW_DISTANCE) continue;
    objs.push({ z, draw: () => drawRock(ctx, project(z, o.lane)) });
  }
  for (const g of sim.gates) {
    if (g.index < sim.gatesTaken) {
      // The two cards you did not take sink and fade away.
      const passed = sim.distance - g.distance;
      if (reducedMotion || passed > 4) continue;
      const fade = Math.min(1, passed / 4);
      objs.push({
        z: 0,
        draw: () => g.offers.forEach((offer, lane) => {
          if (lane !== pickedLanes.get(g.index)) drawCard(ctx, project(0, lane), offer.cardId, offer.kind === 'discovery', '', fade);
        }),
      });
      continue;
    }
    const z = g.distance - sim.distance;
    if (z > VIEW_DISTANCE) continue;
    objs.push({
      z,
      draw: () => {
        const mid = project(z, 1);
        // Arch.
        const archH = mid.half * 1.25;
        ctx.strokeStyle = 'rgba(180,160,255,0.7)';
        ctx.lineWidth = Math.max(1.5, 5 * mid.p);
        ctx.beginPath();
        ctx.moveTo(w / 2 - mid.half, mid.y);
        ctx.lineTo(w / 2 - mid.half, mid.y - archH);
        ctx.lineTo(w / 2 + mid.half, mid.y - archH);
        ctx.lineTo(w / 2 + mid.half, mid.y);
        ctx.stroke();
        if (mid.p > 0.25) {
          ctx.fillStyle = 'rgba(230,220,255,0.95)';
          ctx.font = `700 ${Math.round(13 * Math.min(1.4, mid.p * 1.6))}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(g.index === FINAL_GATE ? '★ FINALE ★' : `TOR ${g.index + 1}`, w / 2, mid.y - archH - 6 * mid.p);
        }
        g.offers.forEach((offer, lane) => drawCard(ctx, project(z, lane), offer.cardId, offer.kind === 'discovery', neutral ? 'NEUTRAL' : owned.has(offer.cardId) ? '★ ENTDECKT' : '★ NEU'));
      },
    });
  }
  objs.sort((a, b) => b.z - a.z);
  for (const o of objs) o.draw();

  // Player.
  const pp = project(0.2, v.laneX);
  const bob = Math.abs(Math.sin(v.bob)) * 6;
  const py = pp.y - 8 - bob;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(pp.x, pp.y - 4, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Cloak.
  const cloak = ctx.createLinearGradient(pp.x, py - 60, pp.x, py);
  cloak.addColorStop(0, skin[0]);
  cloak.addColorStop(1, skin[1]);
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(pp.x, py - 58);
  ctx.lineTo(pp.x + 20, py);
  ctx.lineTo(pp.x - 20, py);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe2c4';
  ctx.beginPath();
  ctx.arc(pp.x, py - 58, 11, 0, Math.PI * 2);
  ctx.fill();
  // Card held above head.
  ctx.fillStyle = skin[2];
  ctx.strokeStyle = skin[1];
  ctx.lineWidth = 2;
  roundRect(ctx, pp.x - 7, py - 92, 14, 19, 3);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawRock(ctx: CanvasRenderingContext2D, at: { x: number; y: number; p: number }) {
  const r = 34 * at.p;
  ctx.fillStyle = 'rgba(239,68,68,0.35)';
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - r * 0.1, r * 1.25, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b7086';
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - r * 0.5, r, r * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9ea3ba';
  ctx.beginPath();
  ctx.ellipse(at.x - r * 0.3, at.y - r * 0.75, r * 0.4, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
}

const RARITY_FRAME: Record<Rarity, string> = {
  common: '#c7ccd6', uncommon: '#4ade80', rare: '#60a5fa', epic: '#c084fc', legendary: '#fbbf24', mythic: '#ff7ad9',
};

/** Card pictures for the canvas, loaded once; null until loaded (the emoji is drawn meanwhile). */
const pictureCache = new Map<string, HTMLImageElement | null>();
function cardImage(url: string): HTMLImageElement | null {
  if (!pictureCache.has(url)) {
    pictureCache.set(url, null);
    const img = new Image();
    img.onload = () => pictureCache.set(url, img);
    img.src = url;
  }
  return pictureCache.get(url) ?? null;
}

/** Draws a 3:4 card standing on the road. `fade` 0..1 lets passed cards sink and disappear. */
function drawCard(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number; p: number; half: number },
  cardId: string,
  discovery: boolean,
  /** Label above discovery cards. */
  label: string,
  fade = 0,
) {
  const c = getCard(cardId);
  const cw = ((at.half * 2) / LANES) * 0.74 * (1 - fade * 0.4);
  const ch = (cw * 4) / 3;
  const x = at.x - cw / 2;
  const y = at.y - ch - 6 * at.p + fade * ch * 0.6;
  const frame = RARITY_FRAME[c.rarity];
  const bw = Math.max(1.5, cw * 0.05);
  ctx.save();
  ctx.globalAlpha = 1 - fade;
  // Glow: discovery gold, otherwise by rarity (rare and up).
  if (discovery || RARITY_ORDER[c.rarity] >= RARITY_ORDER.rare) {
    ctx.shadowColor = discovery ? 'rgba(255,200,60,0.95)' : frame;
    ctx.shadowBlur = (discovery ? 20 : 6 + RARITY_ORDER[c.rarity] * 3) * at.p;
  }
  // Body + frame.
  if (c.rarity === 'mythic') {
    const rg = ctx.createLinearGradient(x, y, x + cw, y + ch);
    ['#ff5f6d', '#ffc371', '#f9f871', '#4ade80', '#60a5fa', '#c084fc'].forEach((col, i, a) => rg.addColorStop(i / (a.length - 1), col));
    ctx.fillStyle = rg;
  } else {
    ctx.fillStyle = frame;
  }
  roundRect(ctx, x, y, cw, ch, cw * 0.09);
  ctx.fill();
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(x, y, x, y + ch);
  g.addColorStop(0, `hsl(${c.hue} 40% 30%)`);
  g.addColorStop(1, `hsl(${c.hue} 45% 14%)`);
  ctx.fillStyle = g;
  roundRect(ctx, x + bw, y + bw, cw - 2 * bw, ch - 2 * bw, cw * 0.07);
  ctx.fill();
  // Picture area.
  const ax = x + cw * 0.12, ay = y + ch * 0.12, aw = cw * 0.76, ah = ch * 0.76;
  const ag = ctx.createRadialGradient(at.x, ay + ah * 0.38, 0, at.x, ay + ah * 0.38, aw * 0.75);
  ag.addColorStop(0, `hsl(${c.hue} 60% 52%)`);
  ag.addColorStop(1, `hsl(${c.hue} 55% 22%)`);
  ctx.fillStyle = ag;
  roundRect(ctx, ax, ay, aw, ah, cw * 0.06);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const picture = c.image ? cardImage(c.image) : null;
  if (picture) {
    ctx.save();
    roundRect(ctx, ax, ay, aw, ah, cw * 0.06);
    ctx.clip();
    ctx.drawImage(picture, ax, ay, aw, ah);
    ctx.restore();
  } else if (cw > 16) {
    ctx.font = `${Math.round(cw * 0.44)}px system-ui, "Apple Color Emoji", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(c.art, at.x, y + ch * 0.52);
  }
  if (cw > 28) {
    const r = Math.max(6, cw * 0.135);
    ctx.font = `900 ${Math.round(r * 1.4)}px system-ui, sans-serif`;
    const vals: [number, number, number][] = [
      [c.top, at.x, y + r + 1],
      [c.bottom, at.x, y + ch - r - 1],
      [c.left, x + r + 1, y + ch / 2],
      [c.right, x + cw - r - 1, y + ch / 2],
    ];
    for (const [v, vx, vy] of vals) {
      ctx.fillStyle = 'rgba(10,8,26,0.85)';
      ctx.beginPath();
      ctx.arc(vx, vy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(String(v), vx, vy + r * 0.06);
    }
  }
  if (discovery && cw > 24 && fade === 0) {
    const fs = Math.max(9, Math.round(cw * 0.17));
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    const lw = ctx.measureText(label).width + fs;
    ctx.fillStyle = '#ffcc33';
    roundRect(ctx, at.x - lw / 2, y - fs * 1.55, lw, fs * 1.3, fs * 0.4);
    ctx.fill();
    ctx.fillStyle = '#2a1a00';
    ctx.fillText(label, at.x, y - fs * 0.9);
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
