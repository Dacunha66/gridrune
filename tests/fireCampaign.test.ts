import { describe, expect, it } from 'vitest';
import { CAMPAIGN, missionProblems, worldMissions } from '../src/game/campaign';
import { RUNES } from '../src/game/runes';
import { emptyProgress, missionProgress, runeUnlocked, worldUnlocked } from '../src/game/campaignProgress';

describe('Zweite Kampagne: Glutgebirge', () => {
  it('10 Level ohne Fehler, freigeschaltet nach dem Wald-Boss', () => {
    const ms = worldMissions(CAMPAIGN, 'w02');
    expect(ms.map((m) => m.id)).toEqual(['m011', 'm012', 'm013', 'm014', 'm015', 'm016', 'm017', 'm018', 'm019', 'm020']);
    for (const m of ms) expect(missionProblems(m, CAMPAIGN).filter((p) => p.level === 'error'), m.id).toEqual([]);
    const w2 = CAMPAIGN.worlds.find((w) => w.id === 'w02')!;
    const p = emptyProgress();
    expect(worldUnlocked(CAMPAIGN, p, w2)).toBe(false);
    for (const m of worldMissions(CAMPAIGN, 'w01')) p.missions[m.id] = { ...missionProgress(p, m.id), wins: 1 };
    expect(worldUnlocked(CAMPAIGN, p, w2)).toBe(true);
  });
  it('Runen nur bei Level 5 und 10: Wald 5 Wald, 10 Nachhall; Feuer 5 Glut, 10 Fluch; Verdrehung ab Start', () => {
    const at = (id: string) => RUNES.find((r) => r.id === id)!.unlock;
    expect(at('rn01')).toEqual({ kind: 'start' });
    expect(at('rn05')).toEqual({ kind: 'mission', missionId: 'm005' });
    expect(at('rn02')).toEqual({ kind: 'mission', missionId: 'm010' });
    expect(at('rn03')).toEqual({ kind: 'mission', missionId: 'm015' });
    expect(at('rn04')).toEqual({ kind: 'mission', missionId: 'm020' });
    const p = emptyProgress();
    p.missions.m004 = { ...missionProgress(p, 'm004'), wins: 1 };
    expect(runeUnlocked(RUNES.find((r) => r.id === 'rn03')!, p, CAMPAIGN)).toBe(false);
  });
});
