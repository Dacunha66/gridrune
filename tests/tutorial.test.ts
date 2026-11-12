import { beforeAll, describe, expect, it } from 'vitest';
import { BUILTIN_CARDS, CardDef, Rarity, setCardCatalog } from '../src/game/cards';

// The tutorial cards as they are in the admin's catalog (no effects; values as stored there).
const LIVE: [string, string, Rarity, number[], string][] = [
  ['c02', 'Funkenwicht', 'common', [6, 5, 1, 4], 'feuer'], ['c08', 'Windhase', 'common', [3, 6, 1, 5], 'natur'],
  ['c104', 'Assasine', 'common', [5, 5, 4, 2], 'krieger'], ['c105', 'Goldsöldner', 'common', [4, 5, 5, 2], 'krieger'],
  ['c107', 'Schildknappe', 'common', [5, 4, 2, 5], 'krieger'], ['c108', 'Aschenspeerträger', 'common', [2, 4, 5, 5], 'krieger'],
  ['c16', 'Felsbock', 'common', [6, 4, 1, 4], 'krieger'], ['c167', 'Infernojäger', 'common', [4, 5, 5, 2], 'feuer'],
  ['c25', 'Muschelwächter', 'common', [4, 6, 3, 3], 'frost'], ['c29', 'Pfützengeist', 'common', [3, 5, 5, 3], 'frost'],
  ['u01', 'Dachsritter', 'uncommon', [5, 5, 5, 4], 'krieger'], ['u03', 'Flamingoseherin', 'uncommon', [7, 3, 5, 4], 'magier'],
  ['u05', 'Marlow Falkenauge', 'uncommon', [4, 6, 5, 4], 'krieger'], ['u16', 'Scherenkrebs', 'uncommon', [5, 4, 3, 7], 'krieger'],
  ['u17', 'Kugelfisch', 'uncommon', [4, 5, 6, 4], 'frost'], ['u20', 'Lehmgolem', 'uncommon', [5, 7, 3, 4], 'krieger'],
];
beforeAll(() => {
  const live: CardDef[] = LIVE.map(([id, name, rarity, [top, right, bottom, left], cls]) => ({ id, name, rarity, top, right, bottom, left, art: '?', hue: 0, cls } as CardDef));
  setCardCatalog([...BUILTIN_CARDS.filter((c) => !LIVE.some((l) => l[0] === c.id)), ...live]);
});
import { TUTORIAL_AI, TUTORIAL_FIRST, checkTutorial, tutorialAiRng, tutorialBubble, tutorialStart } from '../src/game/tutorial';
import { applyMove, isGameOver, legalMoves, outcome, score } from '../src/game/battle';
import { chooseCpuMove, chooseCpuRune } from '../src/game/ai';
import { Action, applyAction } from '../src/game/runes';
import { createRng } from '../src/game/rng';

/** Plays the tutorial like a player who follows the bubbles, then (from `free`) moves chosen by `me`. */
function playTutorial(me = createRng(1)) {
  const ai = tutorialAiRng();
  const seen = new Set<string>();
  let state = tutorialStart();
  const moves: Action[] = [];
  const bubbles: string[] = [];
  for (let guard = 0; guard < 60 && !isGameOver(state); guard++) {
    if (state.turn === 'cpu') {
      const a: Action = chooseCpuRune(state, ai, TUTORIAL_AI) ?? chooseCpuMove(state, ai, TUTORIAL_AI);
      moves.push(a);
      state = applyAction(state, a);
      continue;
    }
    const b = tutorialBubble(state, seen);
    if (b?.info) {
      bubbles.push(b.key);
      seen.add(b.key);
      continue;
    }
    if (b) bubbles.push(b.key);
    const legal = legalMoves(state);
    const m = b && b.hand !== undefined ? legal.find((x) => x.handIndex === b.hand && x.cell === b.cell)! : legal[Math.floor(me() * legal.length)];
    moves.push(m);
    state = applyMove(state, m);
  }
  return { state, moves, bubbles };
}

describe('Tutorial', () => {
  it('führt Schritt für Schritt: Ziel, Zahlen, ein echtes Erobern, dann Rand, Nachziehen, allein weiter', () => {
    const { state, bubbles } = playTutorial();
    expect(bubbles.slice(0, 3)).toEqual(['goal', 'values', 'capture']);
    expect(bubbles).toEqual(expect.arrayContaining(['captured', 'edges', 'draw', 'alone']));
    expect(isGameOver(state)).toBe(true);
  });
  it('der Server erkennt ein zu Ende gespieltes Tutorial an – mit jedem Ergebnis', () => {
    const results = new Set<string>();
    for (let s = 1; s <= 8; s++) {
      const { state, moves } = playTutorial(createRng(s));
      results.add(outcome(state));
      expect(checkTutorial({ first: TUTORIAL_FIRST, moves }), `seed ${s}`).toEqual({ ok: true });
    }
    expect(results.size).toBeGreaterThan(0);
  });
  it('halbe, fremde oder falsche Duelle zählen nicht', () => {
    const { moves } = playTutorial();
    expect(checkTutorial({ first: TUTORIAL_FIRST, moves: moves.slice(0, 6) }).ok).toBe(false);
    expect(checkTutorial({ first: 'player', moves }).ok).toBe(false);
    expect(checkTutorial(null).ok).toBe(false);
    const changed = [...moves];
    changed[2] = { handIndex: 0, cell: 15 };
    expect(checkTutorial({ first: TUTORIAL_FIRST, moves: changed }).ok).toBe(false);
  });
  it('wer den Blasen folgt, steht nach dem Erobern vorn', () => {
    const ai = tutorialAiRng();
    let state = tutorialStart();
    const seen = new Set(['goal', 'values']);
    for (let k = 0; k < 2; k++) {
      if (state.turn === 'cpu') state = applyAction(state, chooseCpuMove(state, ai, TUTORIAL_AI));
      else {
        const b = tutorialBubble(state, seen)!;
        state = applyMove(state, { handIndex: b.hand!, cell: b.cell! });
      }
    }
    expect(score(state).player).toBeGreaterThan(score(state).cpu);
  });
});
