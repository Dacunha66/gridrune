// Star goals of campaign missions. Only goals the duel engine can check exactly are offered:
// every goal is evaluated by replaying the recorded moves with the same rules as the duel itself
// (a later server check can run the very same function). Turn limits are not offered – every
// duel lasts exactly 15 or 16 moves, so "win within N moves" cannot be measured meaningfully.
import { BattleState, CELL_COUNT, HAND_SIZE, Move, Outcome, applyMove, cellBreakdown, outcome, score } from './battle';
import { getCard } from './cards';
import { CLASS_INFO, CLASS_TERRAIN, CardClass, EFFECTS, EffectId, Terrain, isCardClass, isEffectId } from './effects';

export type GoalType =
  | 'win' | 'min_fields' | 'min_margin' | 'min_captures' | 'play_class' | 'without_class' | 'terrain_bonus' | 'effect_active' | 'runner_clean';

export const GOAL_TYPES: GoalType[] = [
  'win', 'min_fields', 'min_margin', 'min_captures', 'play_class', 'without_class', 'terrain_bonus', 'effect_active', 'runner_clean',
];

/** Short names for the admin editor. */
export const GOAL_LABEL: Record<GoalType, string> = {
  win: 'Mission gewinnen',
  min_fields: 'Felder am Ende',
  min_margin: 'Vorsprung am Ende',
  min_captures: 'Gegnerkarten erobern',
  play_class: 'Karten einer Klasse ausspielen',
  without_class: 'Ohne Klasse gewinnen',
  terrain_bonus: 'Geländeboni auslösen',
  effect_active: 'Effekt auslösen',
  runner_clean: 'Lauf ohne Stolpern',
};

/** Which goal types need a number, a class or an effect. */
export const GOAL_NEEDS: Record<GoalType, { n?: [min: number, max: number]; cls?: boolean; effect?: boolean }> = {
  win: {},
  min_fields: { n: [1, CELL_COUNT] },
  min_margin: { n: [1, CELL_COUNT] },
  min_captures: { n: [1, 20] },
  play_class: { n: [1, HAND_SIZE], cls: true },
  without_class: { cls: true },
  terrain_bonus: { n: [1, HAND_SIZE] },
  effect_active: { n: [1, HAND_SIZE], effect: true },
  runner_clean: {},
};

export interface Goal {
  /** Stable id: earned stars are stored per id, so editing a goal never takes a star away. */
  id: string;
  type: GoalType;
  n: number;
  cls?: CardClass;
  effect?: EffectId;
}

/** What happened in one campaign duel (from the player's point of view). */
export interface DuelStats {
  outcome: Outcome;
  fields: number;
  margin: number;
  /** Enemy cards captured by the player's own moves. */
  captures: number;
  /** Cards played per class. */
  played: Partial<Record<CardClass, number>>;
  /** Own cards that got a terrain bonus (element or terrain effect) right when they were placed. */
  terrainBonus: number;
  /** How often each effect of an own card worked when it was placed. */
  effects: Partial<Record<EffectId, number>>;
  /** Stumbles in the runner before the duel (null = mission without runner). */
  stumbles: number | null;
}

/** Did the effect of the card just placed on `cell` work? (on-play: it did something; condition: its bonus is active). */
function effectWorked(after: BattleState, cell: number, effect: EffectId): boolean {
  const def = EFFECTS[effect];
  // Only the placed card's own effect creates events in a move.
  if (def.trigger === 'play') return after.lastEvents.length > 0;
  return cellBreakdown(after.board, after.terrain, cell).parts.some((p) => p.kind === 'aura' && p.source === def.name);
}

/** Replays a duel from its start position and collects everything the goals can ask for. */
export function duelStats(start: BattleState, moves: readonly Move[], stumbles: number | null = null): DuelStats {
  let state = start;
  const stats: DuelStats = { outcome: 'draw', fields: 0, margin: 0, captures: 0, played: {}, terrainBonus: 0, effects: {}, stumbles };
  for (const move of moves) {
    const side = state.turn;
    const card = state.hands[side][move.handIndex];
    const next = applyMove(state, move);
    if (side === 'player' && card) {
      const def = getCard(card.cardId);
      stats.captures += next.lastFlips.length;
      if (def.cls) stats.played[def.cls] = (stats.played[def.cls] ?? 0) + 1;
      const worked = !!def.effect && effectWorked(next, move.cell, def.effect);
      if (def.effect && worked) stats.effects[def.effect] = (stats.effects[def.effect] ?? 0) + 1;
      const element = cellBreakdown(next.board, next.terrain, move.cell).parts.some((p) => p.kind === 'element');
      if (element || (worked && def.effect && EFFECTS[def.effect].terrain)) stats.terrainBonus++;
    }
    state = next;
  }
  const s = score(state);
  stats.outcome = outcome(state);
  stats.fields = s.player;
  stats.margin = s.player - s.cpu;
  return stats;
}

/** Every goal needs a win; the other conditions come on top. */
export function goalMet(goal: Goal, st: DuelStats): boolean {
  if (st.outcome !== 'win') return false;
  switch (goal.type) {
    case 'win': return true;
    case 'min_fields': return st.fields >= goal.n;
    case 'min_margin': return st.margin >= goal.n;
    case 'min_captures': return st.captures >= goal.n;
    case 'play_class': return !!goal.cls && (st.played[goal.cls] ?? 0) >= goal.n;
    case 'without_class': return !!goal.cls && (st.played[goal.cls] ?? 0) === 0;
    case 'terrain_bonus': return st.terrainBonus >= goal.n;
    case 'effect_active': return !!goal.effect && (st.effects[goal.effect] ?? 0) >= goal.n;
    case 'runner_clean': return st.stumbles === 0;
  }
}

/** Progress shown after the mission, e.g. "7/10". Empty for yes/no goals. */
export function goalProgress(goal: Goal, st: DuelStats): string {
  switch (goal.type) {
    case 'min_fields': return `${st.fields}/${goal.n}`;
    case 'min_margin': return `${Math.max(0, st.margin)}/${goal.n}`;
    case 'min_captures': return `${st.captures}/${goal.n}`;
    case 'play_class': return goal.cls ? `${st.played[goal.cls] ?? 0}/${goal.n}` : '';
    case 'terrain_bonus': return `${st.terrainBonus}/${goal.n}`;
    case 'effect_active': return goal.effect ? `${st.effects[goal.effect] ?? 0}/${goal.n}` : '';
    default: return '';
  }
}

/** Text for players, e.g. "Gewinne mit mindestens 10 Feldern". */
export function goalText(goal: Goal): string {
  const cls = goal.cls ? `${CLASS_INFO[goal.cls].icon} ${CLASS_INFO[goal.cls].label}` : '?';
  switch (goal.type) {
    case 'win': return 'Gewinne die Mission';
    case 'min_fields': return `Gewinne mit mindestens ${goal.n} Feldern`;
    case 'min_margin': return `Gewinne mit mindestens ${goal.n} Feldern Vorsprung`;
    case 'min_captures': return `Gewinne und erobere mindestens ${goal.n} Gegnerkarten`;
    case 'play_class': return `Gewinne und spiele mindestens ${goal.n} ${cls}-Karte${goal.n === 1 ? '' : 'n'}`;
    case 'without_class': return `Gewinne ohne ${cls}-Karten`;
    case 'terrain_bonus': return `Gewinne und löse ${goal.n} Geländebonus${goal.n === 1 ? '' : 'e'} aus`;
    case 'effect_active': return `Gewinne und löse ${goal.effect ? EFFECTS[goal.effect].name : '?'} ${goal.n}× aus`;
    case 'runner_clean': return 'Gewinne nach einem Lauf ohne Stolpern';
  }
}

/** What the mission offers the goal (for the reachability check in the editor). */
export interface GoalContext {
  runner: boolean;
  terrain: readonly Terrain[];
  rocks: number;
  /** Only cards of this class may be used. */
  onlyClass?: CardClass;
}

/**
 * Why a goal cannot (or can hardly) be reached in this mission. German, for the editor.
 * errors = impossible, warnings = possible but questionable.
 */
export function goalProblems(goal: Goal, ctx: GoalContext): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cells = CELL_COUNT - ctx.rocks;
  const need = GOAL_NEEDS[goal.type];
  if (need.n && (goal.n < need.n[0] || goal.n > need.n[1])) errors.push(`Zahl muss zwischen ${need.n[0]} und ${need.n[1]} liegen.`);
  if (need.cls && !goal.cls) errors.push('Klasse fehlt.');
  if (need.effect && !goal.effect) errors.push('Effekt fehlt.');
  const terrainEffects = (Object.keys(EFFECTS) as EffectId[]).filter((e) => EFFECTS[e].terrain && ctx.terrain.includes(EFFECTS[e].terrain!));
  switch (goal.type) {
    case 'min_fields':
      if (goal.n > cells) errors.push(`Es gibt nur ${cells} Felder.`);
      else if (goal.n > cells - 3) warnings.push('Sehr schwer: Der Gegner behält fast nie so wenige Felder.');
      else if (goal.n <= Math.floor(cells / 2) + 1) warnings.push('Entspricht einem einfachen Sieg – kein eigenes Ziel.');
      break;
    case 'min_margin':
      if (goal.n > cells) errors.push(`Mehr als ${cells} Vorsprung ist unmöglich.`);
      else if (goal.n <= 2 - (cells % 2)) warnings.push('Entspricht einem einfachen Sieg – kein eigenes Ziel.');
      else if (cells % 2 === 0 && goal.n % 2 === 1) warnings.push(`Bei ${cells} Feldern ist der Vorsprung immer gerade – ${goal.n} wirkt wie ${goal.n + 1}.`);
      break;
    case 'min_captures':
      if (goal.n > 12) warnings.push('Sehr schwer: So viele Eroberungen gelingen selten.');
      break;
    case 'play_class':
      if (ctx.onlyClass && goal.cls && goal.cls !== ctx.onlyClass) errors.push(`In dieser Mission sind nur ${CLASS_INFO[ctx.onlyClass].label}-Karten erlaubt.`);
      break;
    case 'without_class':
      if (ctx.onlyClass && goal.cls === ctx.onlyClass) errors.push('Widerspruch: Die Mission erlaubt nur genau diese Klasse.');
      break;
    case 'terrain_bonus': {
      const fields = ctx.terrain.filter((t) => t !== 'normal').length;
      if (fields === 0) errors.push('Die Arena hat kein Gelände.');
      else if (ctx.onlyClass && !terrainEffects.length && !ctx.terrain.includes(CLASS_TERRAIN[ctx.onlyClass] ?? 'normal')) {
        errors.push(`${CLASS_INFO[ctx.onlyClass].label}-Karten bekommen auf diesem Gelände keinen Bonus.`);
      }
      else if (goal.n > fields) errors.push(`Die Arena hat nur ${fields} Geländefelder.`);
      break;
    }
    case 'effect_active': {
      const t = goal.effect ? EFFECTS[goal.effect].terrain : undefined;
      if (t) errors.push(`${EFFECTS[goal.effect!].name} wirkt nie zusätzlich zum Element-Bonus – nimm stattdessen „Geländeboni auslösen“.`);
      if (goal.effect && ctx.onlyClass && EFFECTS[goal.effect].cls !== ctx.onlyClass) errors.push(`Nur ${CLASS_INFO[ctx.onlyClass].label}-Karten erlaubt – dieser Effekt gehört zu einer anderen Klasse.`);
      break;
    }
    case 'runner_clean':
      if (!ctx.runner) errors.push('Nur in Missionen mit Lauf möglich.');
      break;
  }
  return { errors, warnings };
}

/** Turns an untrusted goal into a valid one, or null. */
export function parseGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id)) return null;
  if (!(GOAL_TYPES as unknown[]).includes(r.type)) return null;
  const type = r.type as GoalType;
  const need = GOAL_NEEDS[type];
  const n = typeof r.n === 'number' && Number.isFinite(r.n) ? Math.round(r.n) : need.n ? need.n[0] : 0;
  const goal: Goal = { id: r.id, type, n: need.n ? Math.min(need.n[1], Math.max(need.n[0], n)) : 0 };
  if (need.cls && isCardClass(r.cls)) goal.cls = r.cls;
  if (need.effect && isEffectId(r.effect)) goal.effect = r.effect;
  return goal;
}
