// Campaign progress of this player. For now it is stored on this device only (separate key, the
// normal save stays untouched); with player accounts it moves to the server, which then also pays
// out rewards. Earned stars are never taken away – not by edits of a mission, not by a worse result.
import { CampaignContent, Mission, STARS_PER_MISSION, World, maxWorldStars, worldMissions } from './campaign';
import { DuelStats, goalMet } from './campaignGoals';
import { KeyValueStore } from './storage';
import type { RuneDef } from './runes';

export const CAMPAIGN_KEY = 'gridrune/campaign-v1';

export interface MissionProgress {
  wins: number;
  draws: number;
  losses: number;
  /** One flag per star slot – once true, it stays true. */
  stars: boolean[];
  /** Ids of goals ever met (kept even if the admin changes the goals). */
  goalsMet: string[];
  firstWinAt: string | null;
  lastPlayedAt: string | null;
}

export interface CampaignProgress {
  version: 1;
  missions: Record<string, MissionProgress>;
  updatedAt: string;
}

export function emptyProgress(): CampaignProgress {
  return { version: 1, missions: {}, updatedAt: '' };
}

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const text = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : null);

export function sanitizeProgress(raw: unknown): CampaignProgress {
  const out = emptyProgress();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const missions = r.missions && typeof r.missions === 'object' ? (r.missions as Record<string, unknown>) : {};
  for (const [id, m] of Object.entries(missions)) {
    if (!/^m\d{3,5}$/.test(id) || !m || typeof m !== 'object') continue;
    const p = m as Record<string, unknown>;
    out.missions[id] = {
      wins: count(p.wins),
      draws: count(p.draws),
      losses: count(p.losses),
      stars: Array.from({ length: STARS_PER_MISSION }, (_, i) => Array.isArray(p.stars) && p.stars[i] === true),
      goalsMet: Array.isArray(p.goalsMet) ? [...new Set(p.goalsMet.filter((g): g is string => typeof g === 'string' && g.length <= 60))].slice(0, 50) : [],
      firstWinAt: text(p.firstWinAt),
      lastPlayedAt: text(p.lastPlayedAt),
    };
  }
  out.updatedAt = text(r.updatedAt) ?? '';
  return out;
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadProgress(store: KeyValueStore | null = browserStore()): CampaignProgress {
  try {
    const t = store?.getItem(CAMPAIGN_KEY);
    return t ? sanitizeProgress(JSON.parse(t)) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export function writeProgress(p: CampaignProgress, store: KeyValueStore | null = browserStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(CAMPAIGN_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

function blank(): MissionProgress {
  return { wins: 0, draws: 0, losses: 0, stars: Array(STARS_PER_MISSION).fill(false), goalsMet: [], firstWinAt: null, lastPlayedAt: null };
}

export function missionProgress(p: CampaignProgress, id: string): MissionProgress {
  return p.missions[id] ?? blank();
}

/** Stars of a mission: a slot counts if it was ever earned or its current goal was ever met. */
export function starSlots(p: CampaignProgress, m: Mission): boolean[] {
  const mp = missionProgress(p, m.id);
  return Array.from({ length: STARS_PER_MISSION }, (_, i) => mp.stars[i] || (!!m.goals[i] && mp.goalsMet.includes(m.goals[i].id)));
}

export const missionStars = (p: CampaignProgress, m: Mission) => starSlots(p, m).filter(Boolean).length;

export interface MissionResult {
  progress: CampaignProgress;
  /** Per goal: met in this duel. */
  met: boolean[];
  /** Star slots earned for the first time now. */
  newStars: number[];
  firstWin: boolean;
}

/** Stores the result of a duel. Nothing already earned is ever removed. */
export function recordResult(p: CampaignProgress, m: Mission, stats: DuelStats, now = new Date().toISOString()): MissionResult {
  const before = starSlots(p, m);
  const old = missionProgress(p, m.id);
  const met = m.goals.map((g) => goalMet(g, stats));
  const win = stats.outcome === 'win';
  const stars = before.map((had, i) => had || !!met[i]);
  const next: MissionProgress = {
    wins: old.wins + (win ? 1 : 0),
    draws: old.draws + (stats.outcome === 'draw' ? 1 : 0),
    losses: old.losses + (stats.outcome === 'loss' ? 1 : 0),
    stars,
    goalsMet: [...new Set([...old.goalsMet, ...m.goals.filter((_, i) => met[i]).map((g) => g.id)])],
    firstWinAt: old.firstWinAt ?? (win ? now : null),
    lastPlayedAt: now,
  };
  return {
    progress: { ...p, missions: { ...p.missions, [m.id]: next }, updatedAt: now },
    met,
    newStars: stars.flatMap((s, i) => (s && !before[i] ? [i] : [])),
    firstWin: win && old.wins === 0,
  };
}

export const missionDone = (p: CampaignProgress, id: string) => missionProgress(p, id).wins > 0;

export function worldStars(content: CampaignContent, p: CampaignProgress, worldId: string, preview = false): number {
  return worldMissions(content, worldId, preview).reduce((n, m) => n + missionStars(p, m), 0);
}

export function totalStars(content: CampaignContent, p: CampaignProgress): number {
  return content.worlds.reduce((n, w) => n + worldStars(content, p, w.id), 0);
}

/** Share of finished missions in %. */
export function worldPercent(content: CampaignContent, p: CampaignProgress, worldId: string, preview = false): number {
  const ms = worldMissions(content, worldId, preview);
  return ms.length === 0 ? 0 : Math.round((ms.filter((m) => missionDone(p, m.id)).length / ms.length) * 100);
}

export function worldDone(content: CampaignContent, p: CampaignProgress, worldId: string): boolean {
  const ms = worldMissions(content, worldId);
  return ms.length > 0 && ms.every((m) => missionDone(p, m.id));
}

export function worldUnlocked(content: CampaignContent, p: CampaignProgress, w: World): boolean {
  if (w.unlock.afterWorld && !worldDone(content, p, w.unlock.afterWorld)) return false;
  if (w.unlock.minStars && totalStars(content, p) < w.unlock.minStars) return false;
  return true;
}

/** Why a world is locked, for players. */
export function worldLockText(content: CampaignContent, w: World): string {
  const parts: string[] = [];
  const prev = w.unlock.afterWorld ? content.worlds.find((x) => x.id === w.unlock.afterWorld) : null;
  if (prev) parts.push(`Schließe „${prev.name}“ ab`);
  if (w.unlock.minStars) parts.push(`sammle ${w.unlock.minStars} ★`);
  return parts.join(' und ');
}

/** Missions open one after the other: the previous one must be won (and any star condition met). */
export function missionUnlocked(content: CampaignContent, p: CampaignProgress, m: Mission, preview = false): boolean {
  const list = worldMissions(content, m.worldId, preview);
  const i = list.findIndex((x) => x.id === m.id);
  if (i > 0 && !missionDone(p, list[i - 1].id)) return false;
  if (m.minWorldStars && worldStars(content, p, m.worldId, preview) < m.minWorldStars) return false;
  return true;
}

/** Next milestone not reached yet (null = all reached). */
export function nextMilestone(w: World, stars: number) {
  return w.milestones.find((ms) => ms.stars > stars) ?? null;
}

export { maxWorldStars };

/** Is a rune unlocked for this player (basic runes always; campaign runes by mission or stars)? */
export function runeUnlocked(r: RuneDef, p: CampaignProgress, content: CampaignContent): boolean {
  if (r.unlock.kind === 'start') return true;
  if (r.unlock.kind === 'mission') return missionDone(p, r.unlock.missionId);
  return totalStars(content, p) >= r.unlock.n;
}
