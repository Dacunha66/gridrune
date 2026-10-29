import { describe, expect, it } from 'vitest';
import { CARDS, RARITIES, RARITY_POWER, STARTER_DECK, STARTING_UNLOCKED, cardPower, getCard } from '../src/game/cards';
import { createRng } from '../src/game/rng';
import { BASE_SPEED, FINAL_GATE, FINISH_DISTANCE, GATE_COUNT, LANES, RunnerSim, STUMBLE_PENALTY, generateGates, generateObstacles } from '../src/game/runner';

/** Lane that avoids every stone in the next row ahead (rows can block two lanes). */
function freeLane(sim: RunnerSim): number {
  const next = sim.obstacles.filter((o) => o.distance > sim.distance).sort((a, b) => a.distance - b.distance)[0];
  if (!next) return sim.lane;
  const blocked = new Set(sim.obstacles.filter((o) => o.distance === next.distance).map((o) => o.lane));
  return [0, 1, 2].find((l) => !blocked.has(l))!;
}

describe('Runner', () => {
  it('Tor 1–7: drei verschiedene Deckkarten · Tor 8: drei neue Karten, die der Spieler noch nicht hat', () => {
    const owned = new Set(STARTING_UNLOCKED);
    for (let seed = 1; seed <= 30; seed++) {
      const gates = generateGates(STARTER_DECK, createRng(seed), owned);
      expect(gates).toHaveLength(8);
      for (const g of gates.slice(0, 7)) {
        expect(g.offers.every((o) => o.kind === 'deck')).toBe(true);
        expect(new Set(g.offers.map((o) => o.cardId)).size).toBe(3);
        for (const o of g.offers) expect(STARTER_DECK).toContain(o.cardId);
      }
      const final = gates[FINAL_GATE].offers;
      expect(final.every((o) => o.kind === 'discovery')).toBe(true);
      expect(new Set(final.map((o) => o.cardId)).size).toBe(3);
      for (const o of final) expect(owned.has(o.cardId)).toBe(false);
    }
  });

  it('sammelt bei normalem Lauf genau 8 Karten, egal wie gelenkt wird', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seed);
      const sim = new RunnerSim(STARTER_DECK, rng);
      let finishes = 0;
      let t = 0;
      while (!sim.finished && t < 120) {
        if (rng() < 0.1) sim.moveLane(rng() < 0.5 ? -1 : 1);
        for (const e of sim.update(1 / 60, seed % 3 === 0 ? 4 : 1)) if (e.type === 'finish') finishes++;
        t += 1 / 60;
      }
      expect(sim.finished).toBe(true);
      expect(finishes).toBe(1);
      expect(sim.picks).toHaveLength(GATE_COUNT);
      expect(sim.picks.map((p) => p.gate)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      // No more picks after the end.
      sim.update(10);
      expect(sim.picks).toHaveLength(GATE_COUNT);
    }
  });

  it('nimmt die Karte der aktuellen Spur', () => {
    const sim = new RunnerSim(STARTER_DECK, createRng(5));
    // A lane next to the middle that avoids the first stone.
    const lane = sim.obstacles[0].lane === 2 ? 0 : 2;
    sim.setLane(lane);
    const events = sim.update(sim.gates[0].distance / BASE_SPEED + 0.01);
    const pick = events.find((e) => e.type === 'pick');
    expect(pick).toEqual({ type: 'pick', gate: 0, lane, offer: sim.gates[0].offers[lane], mod: 0 });
  });

  it('Stolperstein schwächt genau die nächste Karte um 1', () => {
    const sim = new RunnerSim(STARTER_DECK, createRng(7));
    const first = sim.obstacles[0];
    expect(first.distance).toBeLessThan(sim.gates[0].distance);
    // Hit the first stone, avoid all others.
    sim.setLane(first.lane);
    expect(sim.update((first.distance + 0.05) / BASE_SPEED).some((e) => e.type === 'bump')).toBe(true);
    let t = 0;
    while (!sim.finished && t < 120) {
      sim.setLane(freeLane(sim));
      sim.update(1 / 60);
      t += 1 / 60;
    }
    expect(sim.picks).toHaveLength(8);
    expect(sim.picks[0].mod).toBe(STUMBLE_PENALTY);
    expect(sim.picks.slice(1).every((p) => p.mod === 0)).toBe(true);
  });

  it('wer den Steinen ausweicht, bekommt keine Schwächung – es bleibt immer eine Spur frei', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new RunnerSim(STARTER_DECK, createRng(seed));
      let t = 0;
      while (!sim.finished && t < 120) {
        sim.setLane(freeLane(sim));
        sim.update(1 / 60);
        t += 1 / 60;
      }
      expect(sim.picks).toHaveLength(8);
      expect(sim.picks.every((p) => p.mod === 0)).toBe(true);
    }
  });

  it('mehr Hindernisse: ein Stein vor Tor 1, danach zwei Reihen zwischen je zwei Toren', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const obs = generateObstacles(createRng(seed));
      expect(obs.length).toBeGreaterThanOrEqual(15);
      const rows = new Map<number, number>();
      for (const o of obs) rows.set(o.distance, (rows.get(o.distance) ?? 0) + 1);
      for (const n of rows.values()) expect(n).toBeLessThanOrEqual(2);
      expect(rows.size).toBe(15);
    }
  });

  it('immer in die Steine laufen: trotzdem 8 Karten, höchstens −1 pro Karte', () => {
    const sim = new RunnerSim(STARTER_DECK, createRng(3));
    let t = 0;
    while (!sim.finished && t < 120) {
      const next = sim.obstacles.find((o) => o.distance > sim.distance);
      if (next) sim.setLane(next.lane);
      sim.update(1 / 60);
      t += 1 / 60;
    }
    expect(sim.picks).toHaveLength(8);
    // There are stones before every gate, so every card is weakened – but never below −1.
    expect(sim.picks.every((p) => p.mod === STUMBLE_PENALTY)).toBe(true);
  });

  it('auch ein großer Zeitsprung liefert genau 8 Karten', () => {
    const sim = new RunnerSim(STARTER_DECK, createRng(2));
    sim.update(1000);
    expect(sim.picks).toHaveLength(8);
    expect(sim.finished).toBe(true);
  });

  it('Überspringen liefert genau 8 Karten', () => {
    const sim = new RunnerSim(STARTER_DECK, createRng(4));
    sim.update(5);
    sim.skipToEnd();
    sim.skipToEnd();
    expect(sim.picks).toHaveLength(8);
  });

  it('kürzerer Lauf: bei normaler Geschwindigkeit etwa 30 Sekunden (25–35)', () => {
    const seconds = FINISH_DISTANCE / BASE_SPEED;
    expect(seconds).toBeGreaterThanOrEqual(25);
    expect(seconds).toBeLessThanOrEqual(35);
  });

  it('Kartenpool: 100 eindeutige Karten, Werte 1–10, Stärke passt zur Seltenheit', () => {
    expect(CARDS).toHaveLength(100);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(100);
    expect(new Set(CARDS.map((c) => c.name)).size).toBe(100);
    for (const c of CARDS) {
      for (const v of [c.top, c.right, c.bottom, c.left]) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(10);
      }
      const [min, max] = RARITY_POWER[c.rarity];
      expect(cardPower(c), c.name).toBeGreaterThanOrEqual(min);
      expect(cardPower(c), c.name).toBeLessThanOrEqual(max);
    }
    const count = (r: string) => CARDS.filter((c) => c.rarity === r).length;
    expect([count('common'), count('uncommon'), count('rare'), count('epic'), count('legendary'), count('mythic')]).toEqual([30, 24, 20, 14, 8, 4]);
  });

  it('jede höhere Seltenheit ist im Schnitt stärker', () => {
    const avg = (r: string) => {
      const cs = CARDS.filter((c) => c.rarity === r);
      return cs.reduce((s, c) => s + cardPower(c), 0) / cs.length;
    };
    const order = RARITIES.map(avg);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it('mystische Karten sind im Finaltor sehr selten (Standard: etwa 1 % je neuer Karte)', () => {
    let mythic = 0;
    let total = 0;
    for (let seed = 1; seed <= 3000; seed++) {
      for (const o of generateGates(STARTER_DECK, createRng(seed), new Set(STARTING_UNLOCKED))[FINAL_GATE].offers) {
        total++;
        if (getCard(o.cardId).rarity === 'mythic') mythic++;
      }
    }
    expect(mythic / total).toBeGreaterThan(0.004);
    expect(mythic / total).toBeLessThan(0.025);
  });
});

describe('Jede Karte nur einmal pro Lauf', () => {
  const deck20 = STARTER_DECK;
  it('die Tore 1–7 zeigen erst alle 20 Deckkarten, bevor sich eine wiederholt', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const gates = generateGates(deck20, createRng(seed));
      const ids = gates.slice(0, FINAL_GATE).flatMap((g) => g.offers.map((o) => o.cardId));
      // 21 places, 20 different cards: only one card comes up twice.
      expect(ids).toHaveLength(21);
      expect(new Set(ids).size).toBe(20);
      for (const g of gates) expect(new Set(g.offers.map((o) => o.cardId)).size).toBe(g.offers.length);
    }
  });
  it('egal welche Spur man nimmt: keine Karte wird zweimal genommen', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rng = createRng(seed * 7);
      const sim = new RunnerSim(deck20, createRng(seed));
      while (sim.gatesTaken < GATE_COUNT) {
        sim.lane = Math.floor(rng() * LANES);
        sim.advanceTo(sim.gates[sim.gatesTaken].distance);
      }
      const ids = sim.picks.map((p) => p.cardId);
      expect(new Set(ids).size, `Seed ${seed}: ${ids.join(',')}`).toBe(ids.length);
      // Offers still never repeat inside one gate.
      for (const g of sim.gates) expect(new Set(g.offers.map((o) => o.cardId)).size).toBe(g.offers.length);
    }
  });
  it('Liga-Strecken (feste Bahn) bleiben unverändert', () => {
    const layout = { gates: generateGates(deck20, createRng(9)), obstacles: [] };
    const before = JSON.stringify(layout.gates);
    const sim = new RunnerSim(layout);
    sim.skipToEnd();
    expect(JSON.stringify(sim.gates)).toBe(before);
  });
});
