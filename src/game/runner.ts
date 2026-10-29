// Runner logic, independent of rendering: 3 lanes, 8 card gates, stumbling stones.
// Gates 1–7 offer cards from the player's deck; the final gate offers 3 new cards.
import { CARDS, CardDef, pickByRarity } from './cards';
import { Rng, randInt, shuffle } from './rng';
import { SETTINGS } from './settings';

export const LANES = 3;
export const GATE_COUNT = 8;
export const FIRST_GATE = 24;
export const GATE_SPACING = 34;
export const BASE_SPEED = 9; // units per second → ~30 s for a full run
/** Value penalty for the next card after hitting a stumbling stone. */
export const STUMBLE_PENALTY = -1;
export const FINISH_DISTANCE = FIRST_GATE + GATE_SPACING * (GATE_COUNT - 1) + 8;
/** Index of the final gate, the only one with new cards. */
export const FINAL_GATE = GATE_COUNT - 1;

export type OfferKind = 'deck' | 'discovery';

export interface Offer {
  cardId: string;
  kind: OfferKind;
}

export interface Gate {
  index: number;
  distance: number;
  /** One offer per lane (0 = left, 1 = middle, 2 = right). */
  offers: Offer[];
}

export interface Obstacle {
  distance: number;
  lane: number;
}

export interface Pick extends Offer {
  gate: number;
  /** Added to all four values in the duel (0 or STUMBLE_PENALTY). */
  mod: number;
}

export type RunnerEvent =
  | { type: 'pick'; gate: number; lane: number; offer: Offer; mod: number }
  | { type: 'bump'; lane: number }
  | { type: 'finish' };

/** Cards that may be offered as new cards in the runner. */
export function runnerPool(exclude: ReadonlySet<string>): CardDef[] {
  return CARDS.filter((c) => c.inRunner !== false && !exclude.has(c.id));
}

/** Three different new cards for the final gate, preferring cards the player does not own yet. */
function pickDiscoveries(deck: string[], owned: ReadonlySet<string>, rng: Rng): string[] {
  const inDeck = new Set(deck);
  const fresh = runnerPool(new Set([...inDeck, ...owned]));
  const known = runnerPool(inDeck).filter((c) => owned.has(c.id));
  const out: string[] = [];
  for (const pool of [fresh, known]) {
    const left = [...pool];
    while (out.length < LANES && left.length > 0) {
      const card = pickByRarity(rng, left, SETTINGS.discoveryShares) ?? left[randInt(rng, left.length)];
      left.splice(left.indexOf(card), 1);
      out.push(card.id);
    }
  }
  return out;
}

/**
 * Gates 1–7: three different cards from the deck, dealt from the shuffled deck so every deck card
 * comes up once before any card repeats. Gate 8 (final): three new cards – the one you take is
 * yours if you win the duel.
 */
export function generateGates(deck: string[], rng: Rng, owned: ReadonlySet<string> = new Set()): Gate[] {
  if (deck.length < LANES) throw new Error(`Deck needs at least ${LANES} cards`);
  const gates: Gate[] = [];
  let queue = shuffle(rng, deck);
  for (let i = 0; i < GATE_COUNT; i++) {
    let offers: Offer[];
    if (i === FINAL_GATE) {
      const found = pickDiscoveries(deck, owned, rng);
      offers = found.map((cardId) => ({ cardId, kind: 'discovery' as const }));
      // Not enough cards allowed in the runner: fill up from the deck.
      for (const id of shuffle(rng, deck)) {
        if (offers.length >= LANES) break;
        offers.push({ cardId: id, kind: 'deck' });
      }
    } else {
      const ids: string[] = [];
      while (ids.length < LANES) {
        if (queue.length === 0) queue = shuffle(rng, deck);
        const id = queue.shift()!;
        if (!ids.includes(id)) ids.push(id);
      }
      offers = ids.map((cardId) => ({ cardId, kind: 'deck' as const }));
    }
    gates.push({ index: i, distance: FIRST_GATE + i * GATE_SPACING, offers: shuffle(rng, offers) });
  }
  return gates;
}

/**
 * Stumbling stones: one before the first gate, then two rows between every pair of gates –
 * the second row sometimes blocks two lanes. One lane is always free, and stones never block a pick.
 */
export function generateObstacles(rng: Rng): Obstacle[] {
  const obstacles: Obstacle[] = [{ distance: FIRST_GATE / 2, lane: randInt(rng, LANES) }];
  for (let i = 1; i < GATE_COUNT; i++) {
    const start = FIRST_GATE + (i - 1) * GATE_SPACING;
    obstacles.push({ distance: start + GATE_SPACING * 0.33, lane: randInt(rng, LANES) });
    const lanes = shuffle(rng, [0, 1, 2]).slice(0, rng() < 0.5 ? 2 : 1);
    for (const lane of lanes) obstacles.push({ distance: start + GATE_SPACING * 0.68, lane });
  }
  return obstacles;
}

/** A complete track: the gates with their offers and all stones. */
export interface RunnerLayout {
  gates: Gate[];
  obstacles: Obstacle[];
}

/** One lane change, recorded at the track distance where it happened. */
export interface RunInput {
  d: number;
  lane: number;
}

/** Minimum track distance between two lane changes in ranked replays (≈ 55 ms at normal speed). */
export const MIN_INPUT_GAP = 0.5;

export class RunnerSim {
  distance = 0;
  lane = 1;
  readonly picks: Pick[] = [];
  readonly gates: Gate[];
  readonly obstacles: Obstacle[];
  /** Every lane change in order – enough to replay the run exactly (see `replayRun`). */
  readonly inputs: RunInput[] = [];
  finished = false;
  /** True after hitting a stone until the next card is taken. */
  stumbled = false;
  private nextGate = 0;
  private nextObstacle = 0;
  /** Adventure runs: every card can be taken only once (league tracks may hold two copies on purpose). */
  private readonly unique: boolean;
  /** Deck cards in the order they may replace an already taken card. */
  private readonly reserve: string[] = [];

  constructor(deckOrLayout: string[] | RunnerLayout, rng?: Rng, owned: ReadonlySet<string> = new Set()) {
    this.unique = Array.isArray(deckOrLayout);
    if (Array.isArray(deckOrLayout)) {
      if (!rng) throw new Error('rng required');
      this.gates = generateGates(deckOrLayout, rng, owned);
      this.obstacles = generateObstacles(rng);
      // Replacement order: as the cards come up on the track, then the rest of the deck.
      for (const id of [...this.gates.flatMap((g) => g.offers.map((o) => o.cardId)), ...deckOrLayout]) {
        if (deckOrLayout.includes(id) && !this.reserve.includes(id)) this.reserve.push(id);
      }
    } else {
      this.gates = deckOrLayout.gates;
      this.obstacles = [...deckOrLayout.obstacles].sort((a, b) => a.distance - b.distance);
    }
  }

  moveLane(dir: -1 | 1): void {
    this.setLane(this.lane + dir);
  }

  setLane(lane: number): void {
    if (this.finished) return;
    const next = Math.max(0, Math.min(LANES - 1, Math.round(lane)));
    if (next === this.lane) return;
    // Ignore a second change within a few milliseconds (accidental double swipe): keeps every
    // recorded run valid for the server check.
    const last = this.inputs[this.inputs.length - 1];
    if (last && this.distance - last.d < MIN_INPUT_GAP) return;
    this.lane = next;
    this.inputs.push({ d: this.distance, lane: next });
  }

  /** Advance by dt seconds. Returns the events that happened. */
  update(dt: number, speedMultiplier = 1): RunnerEvent[] {
    if (this.finished) return [];
    return this.advanceTo(this.distance + Math.max(0, dt) * BASE_SPEED * speedMultiplier);
  }

  /** Advance to an absolute track distance, handling stones and gates in track order. */
  advanceTo(distance: number): RunnerEvent[] {
    if (this.finished) return [];
    const events: RunnerEvent[] = [];
    this.distance = Math.max(this.distance, distance);
    for (;;) {
      const o = this.obstacles[this.nextObstacle];
      const g = this.gates[this.nextGate];
      const oDue = o !== undefined && this.distance >= o.distance;
      const gDue = g !== undefined && this.distance >= g.distance;
      if (oDue && (!gDue || o.distance < g.distance)) {
        this.nextObstacle++;
        if (o.lane === this.lane) {
          this.stumbled = true;
          events.push({ type: 'bump', lane: o.lane });
        }
      } else if (gDue) {
        this.nextGate++;
        events.push(this.takeGate(g));
      } else {
        break;
      }
    }
    if (this.nextGate >= this.gates.length && this.distance >= FINISH_DISTANCE) {
      this.finished = true;
      events.push({ type: 'finish' });
    }
    return events;
  }
  /** Test/impatience shortcut: take the current-lane card of every remaining gate. */
  skipToEnd(): RunnerEvent[] {
    const events: RunnerEvent[] = [];
    while (this.nextGate < this.gates.length) events.push(this.takeGate(this.gates[this.nextGate++]));
    this.distance = Math.max(this.distance, FINISH_DISTANCE);
    this.nextObstacle = this.obstacles.length;
    if (!this.finished) {
      this.finished = true;
      events.push({ type: 'finish' });
    }
    return events;
  }

  get gatesTaken(): number {
    return this.nextGate;
  }

  private takeGate(gate: Gate): RunnerEvent {
    const offer = gate.offers[this.lane];
    const mod = this.stumbled ? STUMBLE_PENALTY : 0;
    this.stumbled = false;
    this.picks.push({ ...offer, gate: gate.index, mod });
    if (this.unique) this.replaceTaken(offer.cardId);
    return { type: 'pick', gate: gate.index, lane: this.lane, offer, mod };
  }

  /** A taken card is not offered again: later gates get an untaken deck card instead (if there is one left). */
  private replaceTaken(cardId: string): void {
    const taken = new Set(this.picks.map((p) => p.cardId));
    for (const gate of this.gates.slice(this.nextGate)) {
      gate.offers = gate.offers.map((o) => {
        if (o.cardId !== cardId) return o;
        const inGate = new Set(gate.offers.map((x) => x.cardId));
        const other = this.reserve.find((id) => !taken.has(id) && !inGate.has(id) && !this.upcoming(id));
        const fallback = other ?? this.reserve.find((id) => !taken.has(id) && !inGate.has(id));
        return fallback ? { cardId: fallback, kind: 'deck' } : o;
      });
    }
  }

  /** True if the card is already offered in a gate that is still ahead. */
  private upcoming(cardId: string): boolean {
    return this.gates.slice(this.nextGate).some((g) => g.offers.some((o) => o.cardId === cardId));
  }
}

/** Checks that recorded inputs could come from a person (one lane per input, sane timing). */
export function validateRunInputs(inputs: readonly RunInput[]): string | null {
  let lane = 1;
  let last = -Infinity;
  for (const inp of inputs) {
    if (!Number.isFinite(inp.d) || inp.d < 0 || inp.d > FINISH_DISTANCE) return 'Eingabe außerhalb der Strecke';
    if (inp.d < last) return 'Eingaben nicht in zeitlicher Reihenfolge';
    if (inp.d - last < MIN_INPUT_GAP) return 'Spurwechsel zu schnell hintereinander';
    if (!Number.isInteger(inp.lane) || inp.lane < 0 || inp.lane >= LANES || Math.abs(inp.lane - lane) !== 1) return 'Unmöglicher Spurwechsel';
    lane = inp.lane;
    last = inp.d;
  }
  return null;
}

/**
 * Replays a run from its track and recorded lane changes – exactly what the server will do to
 * check the picks and stone penalties a player reports.
 */
export function replayRun(layout: RunnerLayout, inputs: readonly RunInput[]): { picks: Pick[]; error: string | null } {
  const error = validateRunInputs(inputs);
  if (error) return { picks: [], error };
  const sim = new RunnerSim(layout);
  for (const inp of inputs) {
    sim.advanceTo(inp.d);
    sim.setLane(inp.lane);
  }
  sim.advanceTo(FINISH_DISTANCE);
  return { picks: sim.picks, error: null };
}
