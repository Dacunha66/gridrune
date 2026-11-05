// Which special effects worked in the most recent action – for the title cards shown over the board.
import { BattleState, Side } from './battle';
import { getCard } from './cards';
import { EFFECTS, EffectId } from './effects';

/** An effect that worked in the most recent action – shown as a title card over the board. */
export interface Activation {
  effect: EffectId;
  by: Side;
  detail: string;
}

/**
 * Effects that worked in the most recent action: the placed card's own effect first, then reactions of other cards
 * (Frostpanzer, Schattenmantel, Standhaft, Wurzelkraft growth). Dominanz and Standhaft show as a tie decided by them.
 */
export function activations(state: BattleState): Activation[] {
  const out: Activation[] = [];
  const add = (effect: EffectId, by: Side, detail = EFFECTS[effect].short) => {
    if (!out.some((a) => a.effect === effect && a.by === by)) out.push({ effect, by, detail });
  };
  const placed = state.lastRune === null && state.lastPlaced !== null ? state.board[state.lastPlaced] : null;
  const own = placed ? getCard(placed.cardId).effect : undefined;
  if (placed && own) {
    if (own === 'kettenuebernahme') {
      const tries = state.lastChainClashes ?? [];
      if (tries.length > 0) add(own, placed.placedBy, state.lastChain.length > 0 ? `Kette ×${state.lastChain.length} – greift mit −1 an` : 'Kette greift mit −1 an – keine weitere Übernahme');
    } else if (own === 'dominanz') {
      if (state.lastClashes.some((c) => c.captured && c.attack === c.defense)) add(own, placed.placedBy, 'Gleichstand – trotzdem erobert');
    } else if (state.lastEvents.some((e) => e.effect === own && e.by === placed.placedBy)) {
      add(own, placed.placedBy);
    }
  }
  if (placed && own === 'dominanz') {
    for (const c of state.lastClashes) {
      const d = state.board[c.cell];
      if (!c.captured && c.attack === c.defense && d && getCard(d.cardId).effect === 'standhaft') add('standhaft', d.owner, 'Hält dem Gleichstand stand');
    }
  }
  for (const e of state.lastEvents) if (e.effect && e.by && e.effect !== own) add(e.effect, e.by);
  return out.slice(0, 3);
}
