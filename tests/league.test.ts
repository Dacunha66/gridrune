import { afterEach, describe, expect, it } from 'vitest';
import { BUILTIN_CARDS, CARDS, STARTING_UNLOCKED, getCard, setCardCatalog } from '../src/game/cards';
import { buildCatalog, builtinRecords } from '../src/game/catalog';
import { applyMove, createBattle, isGameOver, legalMoves, randomRock, score, toHand, totalMoves } from '../src/game/battle';
import { chooseCpuMove } from '../src/game/ai';
import { createRng, shuffle } from '../src/game/rng';
import { ADVENTURE_RULES, COLLECTION_LEAGUE_RULES, autoDeck, validateDeck } from '../src/game/rules';
import { emptyMatch, nextStep, recordRound } from '../src/game/match';
import {
  NEUTRAL_POWER, deckPairs, hashString, leagueLayout, matchCode, neutralDiscoveries, roundRock, seedFingerprint,
} from '../src/game/league';
import { FINISH_DISTANCE, MIN_INPUT_GAP, RunnerSim, replayRun, validateRunInputs } from '../src/game/runner';

afterEach(() => setCardCatalog(BUILTIN_CARDS));

const owned2 = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 2]));
const ALL = BUILTIN_CARDS.map((c) => c.id);
const byRarity = (r: string) => BUILTIN_CARDS.filter((c) => c.rarity === r).map((c) => c.id);

describe('Collection League: Deckregeln', () => {
  const rules = COLLECTION_LEAGUE_RULES.deck;
  const commons = byRarity('common');

  it('gültiges Deck: 20 Karten, höchstens 2 gleiche', () => {
    const deck = [...commons.slice(0, 10), ...commons.slice(0, 10)];
    expect(validateDeck(deck, rules, owned2(ALL))).toEqual([]);
  });

  it('3 gleiche Karten sind verboten', () => {
    const deck = [commons[0], commons[0], commons[0], ...commons.slice(1, 18)];
    expect(validateDeck(deck, rules, owned2(ALL)).join()).toMatch(/höchstens 2/);
  });

  it('höchstens 1 legendäre, 1 mystische und 4 epische Karten', () => {
    const base = commons.slice(0, 13);
    expect(validateDeck([...base, ...byRarity('legendary').slice(0, 2), ...byRarity('epic').slice(0, 4), byRarity('mythic')[0]], rules, owned2(ALL)).join())
      .toMatch(/1 legendäre Karte/);
    expect(validateDeck([...base, byRarity('legendary')[0], ...byRarity('epic').slice(0, 4), ...byRarity('mythic').slice(0, 2)], rules, owned2(ALL)).join())
      .toMatch(/1 mystische Karte/);
    expect(validateDeck([...commons.slice(0, 14), ...byRarity('epic').slice(0, 5), byRarity('legendary')[0]], rules, owned2(ALL)).join())
      .toMatch(/4 epische Karten/);
    // A legendary card twice is also over the limit of 1.
    expect(validateDeck([...commons.slice(0, 18), byRarity('legendary')[0], byRarity('legendary')[0]], rules, owned2(ALL)).join()).toMatch(/legendäre/);
  });

  it('nur Karten, die man besitzt (und so oft man sie besitzt)', () => {
    const deck = [...commons.slice(0, 10), ...commons.slice(0, 10)];
    expect(validateDeck(deck, rules, Object.fromEntries(commons.map((id) => [id, 1]))).join()).toMatch(/nicht 2×/);
  });

  it('automatisches Deck hält alle Regeln ein', () => {
    for (const owned of [owned2(ALL), owned2(STARTING_UNLOCKED)]) {
      const deck = autoDeck(rules, owned);
      expect(deck).toHaveLength(20);
      expect(validateDeck(deck, rules, owned)).toEqual([]);
    }
  });

  it('Abenteuer-Regeln bleiben unverändert (20 verschiedene, keine Seltenheitsgrenzen)', () => {
    expect(ADVENTURE_RULES.deck).toEqual({ size: 20, maxCopies: 1, rarityLimits: {} });
    expect(ADVENTURE_RULES.rock).toBe(false);
  });
});

describe('Felsfeld', () => {
  it('15 Züge, Fels ist nie spielbar, kein Unentschieden möglich', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const rng = createRng(seed);
      const pool = shuffle(rng, ALL);
      const rock = randomRock(rng);
      let s = createBattle(toHand(pool.slice(0, 8)), toHand(pool.slice(8, 16)), seed % 2 ? 'player' : 'cpu', [rock]);
      expect(totalMoves(s)).toBe(15);
      while (!isGameOver(s)) {
        expect(legalMoves(s).some((m) => m.cell === rock)).toBe(false);
        s = applyMove(s, chooseCpuMove(s, rng));
      }
      expect(s.board[rock]).toBeNull();
      const sc = score(s);
      expect(sc.player + sc.cpu).toBe(15);
      expect(sc.player).not.toBe(sc.cpu);
    }
  });

  it('ohne Fels bleibt alles wie bisher (16 Züge)', () => {
    expect(totalMoves(createBattle(toHand(ALL.slice(0, 8)), toHand(ALL.slice(8, 16))))).toBe(16);
  });

  it('Fairness: mit Fels gewinnt der Startspieler 40–60 % (ohne Fels nur ca. 20 %)', () => {
    let firstWins = 0;
    let firstWinsNoRock = 0;
    const N = 3000;
    for (let seed = 1; seed <= N; seed++) {
      const rng = createRng(seed * 13);
      const pool = shuffle(rng, ALL);
      for (const withRock of [true, false]) {
        let s = createBattle(toHand(pool.slice(0, 8)), toHand(pool.slice(8, 16)), 'player', withRock ? [randomRock(rng)] : []);
        while (!isGameOver(s)) s = applyMove(s, chooseCpuMove(s, rng));
        const sc = score(s);
        if (sc.player > sc.cpu) { if (withRock) firstWins++; else firstWinsNoRock++; }
      }
    }
    expect(firstWins / N).toBeGreaterThan(0.4);
    expect(firstWins / N).toBeLessThan(0.6);
    expect(firstWinsNoRock / N).toBeLessThan(0.3);
  });
});

describe('Match-Format: 2 Runden, bei 1:1 Entscheidungsduell', () => {
  it('Runde 1 per Münzwurf, Runde 2 mit getauschtem Start', () => {
    let m = emptyMatch();
    expect(nextStep(m)).toEqual({ kind: 'round', round: 1, first: null, decider: false });
    m = recordRound(m, 'cpu', 'player');
    expect(nextStep(m)).toEqual({ kind: 'round', round: 2, first: 'player', decider: false });
  });

  it('2:0 beendet das Match', () => {
    const m = recordRound(recordRound(emptyMatch(), 'player', 'cpu'), 'cpu', 'cpu');
    expect(nextStep(m)).toEqual({ kind: 'done', winner: 'cpu' });
  });

  it('1:1 führt zum Entscheidungsduell (mit neuem Münzwurf), danach steht ein Sieger fest', () => {
    let m = recordRound(recordRound(emptyMatch(), 'player', 'player'), 'cpu', 'cpu');
    expect(nextStep(m)).toEqual({ kind: 'round', round: 3, first: null, decider: true });
    m = recordRound(m, 'cpu', 'player');
    expect(nextStep(m)).toEqual({ kind: 'done', winner: 'player' });
  });

  it('Entscheidungsduell ist fair: der Startspieler des Entscheidungsduells gewinnt 40–60 %', () => {
    let deciders = 0;
    let deciderStarterWins = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      const rng = createRng(seed * 31 + 7);
      const pool = shuffle(rng, ALL);
      const a = pool.slice(0, 8);
      const b = pool.slice(8, 16);
      let m = emptyMatch();
      for (;;) {
        const step = nextStep(m);
        if (step.kind === 'done') break;
        const first = step.first ?? (rng() < 0.5 ? 'player' : 'cpu');
        let s = createBattle(toHand(a), toHand(b), first, [randomRock(rng)]);
        while (!isGameOver(s)) s = applyMove(s, chooseCpuMove(s, rng));
        const sc = score(s);
        const winner = sc.player > sc.cpu ? 'player' : 'cpu';
        if (step.decider) {
          deciders++;
          if (winner === first) deciderStarterWins++;
        }
        m = recordRound(m, first, winner);
      }
    }
    expect(deciders).toBeGreaterThan(300);
    expect(deciderStarterWins / deciders).toBeGreaterThan(0.4);
    expect(deciderStarterWins / deciders).toBeLessThan(0.6);
  });
});

describe('Faire Runner-Angebote mit Match-Code', () => {
  const deck = autoDeck(COLLECTION_LEAGUE_RULES.deck, owned2(ALL));

  it('gleicher Seed = gleiche Angebote (nachrechenbar); anderer Seed = andere', () => {
    expect(leagueLayout('abc123', 'p1', deck)).toEqual(leagueLayout('abc123', 'p1', deck));
    expect(leagueLayout('abc123', 'p1', deck)).not.toEqual(leagueLayout('abc124', 'p1', deck));
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(matchCode('7f3a91c2ffff')).toBe('7F3A-91C2');
  });

  it('jedes Tor: 2 Deckkarten + 1 neutrale Entdeckung; 16 verschiedene Deck-Ziehungen ohne Zurücklegen', () => {
    for (let s = 0; s < 50; s++) {
      const seed = `seed${s}`;
      const layout = leagueLayout(seed, 'p1', deck);
      expect(layout.gates).toHaveLength(8);
      const drawn: string[] = [];
      for (const g of layout.gates) {
        expect(g.offers.filter((o) => o.kind === 'deck')).toHaveLength(2);
        expect(g.offers.filter((o) => o.kind === 'discovery')).toHaveLength(1);
        drawn.push(...g.offers.filter((o) => o.kind === 'deck').map((o) => o.cardId));
      }
      // Never more copies drawn than the deck holds.
      for (const id of new Set(drawn)) expect(drawn.filter((x) => x === id).length).toBeLessThanOrEqual(deck.filter((x) => x === id).length);
      expect(drawn).toHaveLength(16);
    }
  });

  it('beide Spieler sehen dieselben neutralen Entdeckungen und dieselben Steine', () => {
    const other = autoDeck(COLLECTION_LEAGUE_RULES.deck, owned2(STARTING_UNLOCKED));
    const a = leagueLayout('match42', 'alice', deck);
    const b = leagueLayout('match42', 'bob', other);
    const disc = (l: typeof a) => l.gates.map((g) => g.offers.find((o) => o.kind === 'discovery')!.cardId);
    expect(disc(a)).toEqual(disc(b));
    expect(a.obstacles).toEqual(b.obstacles);
  });

  it('neutrale Entdeckungen haben mittlere Stärke und sind nie legendär oder mystisch', () => {
    for (let s = 0; s < 100; s++) {
      for (const id of neutralDiscoveries(`n${s}`)) {
        const c = getCard(id);
        const sum = c.top + c.right + c.bottom + c.left;
        expect(['common', 'uncommon', 'rare']).toContain(c.rarity);
        expect(sum).toBeGreaterThanOrEqual(NEUTRAL_POWER[0]);
        expect(sum).toBeLessThanOrEqual(NEUTRAL_POWER[1]);
      }
    }
  });

  it('zwei Kopien derselben Karte kommen nie am selben Tor', () => {
    const dupDeck = [...byRarity('common').slice(0, 10), ...byRarity('common').slice(0, 10)];
    for (let s = 1; s <= 200; s++) for (const [x, y] of deckPairs(dupDeck, createRng(s))) expect(x).not.toBe(y);
  });

  it('Fels-Feld je Runde ist aus dem Seed nachrechenbar', () => {
    expect(roundRock('m1', 1)).toBe(roundRock('m1', 1));
    expect(roundRock('m1', 1)).toBeGreaterThanOrEqual(0);
    expect(roundRock('m1', 1)).toBeLessThan(16);
  });

  it('Fingerabdruck (SHA-256) des Seeds', async () => {
    expect(await seedFingerprint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('nur aktive, für den Lauf erlaubte Karten werden neutrale Entdeckungen', () => {
    const records = builtinRecords('t');
    const banned = records.filter((r) => r.rarity === 'uncommon').map((r) => r.id);
    for (const r of records) if (banned.includes(r.id)) r.inRunner = false;
    const cat = buildCatalog(records);
    setCardCatalog(cat.active, cat.known);
    for (let s = 0; s < 50; s++) for (const id of neutralDiscoveries(`b${s}`)) expect(banned).not.toContain(id);
    expect(CARDS.length).toBe(100);
  });
});

describe('Lauf nachspielen (Grundlage für die Server-Prüfung der Stolpersteine)', () => {
  const deck = autoDeck(COLLECTION_LEAGUE_RULES.deck, owned2(ALL));

  it('aufgezeichnete Spurwechsel ergeben beim Nachspielen exakt dieselben Karten und Strafen', () => {
    for (let s = 1; s <= 40; s++) {
      const layout = leagueLayout(`replay${s}`, 'p', deck);
      const live = new RunnerSim(layout);
      const rng = createRng(s);
      let t = 0;
      while (!live.finished && t < 120) {
        if (rng() < 0.05) live.moveLane(rng() < 0.5 ? -1 : 1);
        live.update(1 / 60);
        t += 1 / 60;
      }
      const replay = replayRun(layout, live.inputs);
      expect(replay.error).toBeNull();
      expect(replay.picks).toEqual(live.picks);
    }
  });

  it('gefälschte Eingaben werden erkannt', () => {
    expect(validateRunInputs([{ d: 5, lane: 0 }, { d: 5 + MIN_INPUT_GAP / 2, lane: 1 }])).toMatch(/zu schnell/);
    expect(validateRunInputs([{ d: 5, lane: 1 }])).toMatch(/Unmöglich/); // no change
    expect(validateRunInputs([{ d: 5, lane: 0 }, { d: 9, lane: 2 }])).toMatch(/Unmöglich/); // jump over a lane
    expect(validateRunInputs([{ d: 9, lane: 0 }, { d: 5, lane: 1 }])).toMatch(/Reihenfolge/);
    expect(validateRunInputs([{ d: FINISH_DISTANCE + 1, lane: 0 }])).toMatch(/außerhalb/);
  });

  it('wer behauptet, keinen Stein getroffen zu haben, wird beim Nachspielen widerlegt', () => {
    const layout = leagueLayout('cheat', 'p', deck);
    const replay = replayRun(layout, []); // stays in the middle lane the whole run
    const honest = new RunnerSim(layout);
    honest.advanceTo(FINISH_DISTANCE);
    expect(replay.picks).toEqual(honest.picks);
    const hitAny = layout.obstacles.some((o) => o.lane === 1);
    if (hitAny) expect(replay.picks.some((p) => p.mod < 0)).toBe(true);
  });
});
