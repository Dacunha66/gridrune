// Admin: campaign editor – worlds, missions, opponents, checks and test start. Everything is saved as data
// (built-in content can be changed; a saved document replaces it). Missions are never deleted, only
// deactivated, so player progress always stays valid. Rewards can be planned but are not paid out yet.
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmButton } from '../components/ConfirmButton';
import { CampaignImage, TerrainMini } from './Campaign';
import { Slider, usePanZoom } from './AdminDesigns';
import { AI_LEVELS, AiLevel } from '../game/ai';
import { ARENAS, Arena } from '../game/arenas';
import { HAND_SIZE } from '../game/battle';
import { CARDS, RARITY_LABEL, cardPower, getCard, isCardId } from '../game/cards';
import { Assets, Db, describeError, prepareCoverImage, saveMission, saveOpponent, saveWorld } from '../game/cardStore';
import {
  BUILTIN_MISSIONS, BUILTIN_OPPONENTS, BUILTIN_WORLDS, CONTENT_STATUSES, CampaignContent, ContentStatus, GOALS_PER_MISSION, IMAGE_SPECS, ImageKind,
  ImageRef, KIND_LABEL, LEVEL_LABEL, MISSIONS_COLLECTION, MISSION_KINDS, MODE_LABEL, Milestone, Mission, MissionKind, MissionMode, NAME_MAX,
  OPPONENTS_COLLECTION, Opponent, OpponentRank, Problem, RANK_LABEL, REWARD_ICON, REWARD_LABEL, REWARD_TYPES, Reward, RewardType, STATUS_LABEL,
  TEXT_MAX, WORLDS_COLLECTION, World, maxWorldStars, mergeContent, missionProblems, newGoalId, nextMissionId, nextOpponentId, nextWorldId,
  opponentProblems, parseMission, parseOpponent, parseWorld, worldProblems,
} from '../game/campaign';
import { GOAL_LABEL, GOAL_NEEDS, GOAL_TYPES, Goal, GoalType, goalProblems, goalText } from '../game/campaignGoals';
import { DEFAULT_FIT, ImageFit, UPLOAD_MAX_BYTES, ZOOM_MAX, ZOOM_MIN, clampFit } from '../game/designs';
import { RUNES } from '../game/runes';
import { CLASSES, CLASS_INFO, CardClass, EFFECTS, EffectId } from '../game/effects';

type Sub = 'worlds' | 'missions' | 'opponents' | 'check';
const SUB_LABEL: Record<Sub, string> = { worlds: 'Welten', missions: 'Missionen', opponents: 'Gegner', check: 'Prüfen' };

interface Props {
  db: Db;
  assets: Assets | null;
  onToast: (m: string) => void;
  onCampaignChange: (content: CampaignContent) => void;
  /** Test in the game (drafts visible, nothing saved); with a mission id it starts that mission. */
  onTest: (missionId?: string) => void;
}

type Editing = { kind: 'world'; item: World } | { kind: 'mission'; item: Mission } | { kind: 'opponent'; item: Opponent } | null;

export function CampaignView({ db, assets, onToast, onCampaignChange, onTest }: Props) {
  const [saved, setSaved] = useState<{ worlds: World[] | null; missions: Mission[] | null; opponents: Opponent[] | null }>({ worlds: null, missions: null, opponents: null });
  const [sub, setSub] = useState<Sub>('worlds');
  const [editing, setEditing] = useState<Editing>(null);
  const [worldFilter, setWorldFilter] = useState<string>('w01');

  useEffect(() => {
    const listen = <T,>(name: string, parse: (id: string, raw: unknown) => T | null, key: 'worlds' | 'missions' | 'opponents') =>
      db.collection(name).onSnapshot(
        (snap) => {
          const list = snap.docs.flatMap((d) => {
            const x = d.exists ? parse(d.id, d.data()) : null;
            return x ? [x] : [];
          });
          setSaved((s) => ({ ...s, [key]: list }));
        },
        (e) => onToast(describeError(e)),
      );
    const offs = [listen(WORLDS_COLLECTION, parseWorld, 'worlds'), listen(MISSIONS_COLLECTION, parseMission, 'missions'), listen(OPPONENTS_COLLECTION, parseOpponent, 'opponents')];
    return () => offs.forEach((off) => off());
  }, [db, onToast]);

  const loaded = saved.worlds !== null && saved.missions !== null && saved.opponents !== null;
  const content = useMemo(
    () => mergeContent({ worlds: saved.worlds ?? [], missions: saved.missions ?? [], opponents: saved.opponents ?? [] }),
    [saved],
  );
  useEffect(() => {
    if (loaded) onCampaignChange(content);
  }, [loaded, content, onCampaignChange]);

  if (!loaded) return <p className="muted center">Kampagne wird geladen …</p>;

  const done = (message: string) => {
    onToast(message);
    setEditing(null);
  };
  if (editing?.kind === 'world') {
    return <WorldEditor key={editing.item.id} db={db} assets={assets} initial={editing.item} content={content} onToast={onToast} onDone={done} onClose={() => setEditing(null)} onTest={onTest} />;
  }
  if (editing?.kind === 'mission') {
    return <MissionEditor key={editing.item.id} db={db} assets={assets} initial={editing.item} content={content} onToast={onToast} onDone={done} onClose={() => setEditing(null)} onTest={onTest} />;
  }
  if (editing?.kind === 'opponent') {
    return <OpponentEditor key={editing.item.id} db={db} assets={assets} initial={editing.item} content={content} onToast={onToast} onDone={done} onClose={() => setEditing(null)} />;
  }

  /** Swaps the order of two items and saves both. */
  async function move<T extends World | Mission>(list: T[], i: number, dir: -1 | 1, saveFn: (x: T) => Promise<void>) {
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    const now = new Date().toISOString();
    // Equal orders would not change anything – use the positions instead.
    const ao = a.order === b.order ? i : a.order;
    const bo = a.order === b.order ? i + dir : b.order;
    try {
      await Promise.all([saveFn({ ...a, order: bo, updatedAt: now }), saveFn({ ...b, order: ao, updatedAt: now })]);
    } catch (e) {
      onToast(describeError(e));
    }
  }

  const missionsOf = content.missions.filter((m) => m.worldId === worldFilter);
  const allProblems = content.worlds.flatMap((w) => worldProblems(w, content));
  const errorCount = allProblems.filter((p) => p.level === 'error').length;

  return (
    <div className="scroll campaign-admin">
      <div className="segmented sub-tabs" role="tablist">
        {(Object.keys(SUB_LABEL) as Sub[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={sub === k} className={`seg ${sub === k ? 'active' : ''}`} onClick={() => setSub(k)}>
            {SUB_LABEL[k]}{k === 'check' && errorCount > 0 && <span className="err-dot">{errorCount}</span>}
          </button>
        ))}
      </div>
      <p className="muted small">🎁 Belohnungen kannst du schon planen – ausgezahlt werden sie erst mit Spielerkonten. Spieler-Fortschritt bleibt bei jeder Änderung erhalten.</p>

      {sub === 'worlds' && (
        <>
          <div className="admin-toolbar">
            <button type="button" className="btn" onClick={() => onTest()}>🧪 Kampagne testen</button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: 'world', item: newWorld(content) })}>＋ Neue Welt</button>
          </div>
          <ul className="admin-list">
            {content.worlds.map((w, i) => {
              const probs = worldProblems(w, content);
              return (
                <li key={w.id} className="row-with-order">
                  <button type="button" className="admin-row" onClick={() => setEditing({ kind: 'world', item: clone(w) })}>
                    <span className="admin-thumb wide">{w.tile ? <CampaignImage img={w.tile} /> : '🌲'}</span>
                    <span className="admin-row-main">
                      <strong>{w.name}</strong>
                      <span className="admin-row-meta">
                        <span className="mono">{w.id}</span> · {content.missions.filter((m) => m.worldId === w.id && m.status === 'active').length} Missionen · max. {maxWorldStars(content, w.id)} ★
                        <ProblemBadge problems={probs} />
                      </span>
                    </span>
                    <span className={`status-pill status-${w.status}`}>{STATUS_LABEL[w.status]}</span>
                  </button>
                  <OrderButtons onUp={i > 0 ? () => move(content.worlds, i, -1, (x) => saveWorld(db, x)) : undefined} onDown={i < content.worlds.length - 1 ? () => move(content.worlds, i, 1, (x) => saveWorld(db, x)) : undefined} />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sub === 'missions' && (
        <>
          <div className="admin-toolbar">
            <select className="admin-input" value={worldFilter} onChange={(e) => setWorldFilter(e.target.value)} aria-label="Welt">
              {content.worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: 'mission', item: newMission(content, worldFilter) })}>＋ Mission</button>
          </div>
          <ul className="admin-list">
            {missionsOf.map((m, i) => {
              const probs = missionProblems(m, content);
              const o = content.opponents.find((x) => x.id === m.opponentId);
              return (
                <li key={m.id} className="row-with-order">
                  <button type="button" className="admin-row" onClick={() => setEditing({ kind: 'mission', item: clone(m) })}>
                    <span className="admin-thumb round">{m.icon ? <CampaignImage img={m.icon} /> : <span>{i + 1}</span>}</span>
                    <span className="admin-row-main">
                      <strong>{m.name}</strong>
                      <span className="admin-row-meta">
                        {KIND_LABEL[m.kind]} · {MODE_LABEL[m.mode]} · {o ? `${o.emoji} ${o.name}` : 'kein Gegner'}
                        <ProblemBadge problems={probs} />
                      </span>
                    </span>
                    <span className={`status-pill status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
                  </button>
                  <OrderButtons onUp={i > 0 ? () => move(missionsOf, i, -1, (x) => saveMission(db, x)) : undefined} onDown={i < missionsOf.length - 1 ? () => move(missionsOf, i, 1, (x) => saveMission(db, x)) : undefined} />
                </li>
              );
            })}
          </ul>
          {missionsOf.length === 0 && <p className="muted center">Diese Welt hat noch keine Missionen.</p>}
        </>
      )}

      {sub === 'opponents' && (
        <>
          <div className="admin-toolbar">
            <span className="muted small grow">Gegner spielen mit genau 8 bestehenden Karten nach denselben Regeln wie du.</span>
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ kind: 'opponent', item: newOpponent(content) })}>＋ Gegner</button>
          </div>
          <ul className="admin-list">
            {content.opponents.map((o) => {
              const used = content.missions.filter((m) => m.opponentId === o.id).length;
              return (
                <li key={o.id}>
                  <button type="button" className="admin-row" onClick={() => setEditing({ kind: 'opponent', item: clone(o) })}>
                    <span className={`admin-thumb round rank-${o.rank}`}>{o.avatar ? <CampaignImage img={o.avatar} /> : o.emoji}</span>
                    <span className="admin-row-main">
                      <strong>{o.name}</strong>
                      <span className="admin-row-meta">
                        {RANK_LABEL[o.rank]} · KI {LEVEL_LABEL[o.level]} · in {used} Mission{used === 1 ? '' : 'en'}
                        <ProblemBadge problems={opponentProblems(o)} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {sub === 'check' && (
        <div className="check-view">
          {content.worlds.map((w) => {
            const probs = worldProblems(w, content);
            return (
              <section key={w.id} className="check-world">
                <h3>{w.name} <span className={`status-pill status-${w.status}`}>{STATUS_LABEL[w.status]}</span></h3>
                {probs.length === 0 ? <p className="ok-text">✓ Alles vollständig – Missionen, Gegner, Decks, Ziele und Belohnungen sind in Ordnung.</p> : <ProblemList problems={probs} />}
                <MissingCards world={w} content={content} />
                <button type="button" className="btn btn-small" onClick={() => onTest()}>🧪 Welt testen</button>
              </section>
            );
          })}
          <p className="muted small">Prüft: fehlende Gegner/Arenen, Decks mit genau 8 aktiven Karten, erreichbare Sterne-Ziele, erfüllbare Freischalt-Bedingungen (keine Kreise, genug Sterne), Meilensteine und Belohnungskarten.</p>
        </div>
      )}
    </div>
  );
}

// ---------- Shared parts ----------

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function newWorld(content: CampaignContent): World {
  return {
    id: nextWorldId(content.worlds.map((w) => w.id)), name: '', description: '', order: Math.max(0, ...content.worlds.map((w) => w.order)) + 1, status: 'draft',
    tile: null, map: null, unlock: content.worlds.length ? { afterWorld: content.worlds[content.worlds.length - 1].id } : {}, milestones: [], updatedAt: '',
  };
}

function newMission(content: CampaignContent, worldId: string): Mission {
  const id = nextMissionId(content.missions.map((m) => m.id));
  const inWorld = content.missions.filter((m) => m.worldId === worldId);
  return {
    id, worldId, order: Math.max(0, ...inWorld.map((m) => m.order)) + 1, name: '', description: '', kind: 'normal', mode: 'duel', arenaId: 'a01',
    opponentId: content.opponents[0]?.id ?? '', goals: [{ id: newGoalId(id), type: 'win', n: 0 }, { id: newGoalId(id), type: 'min_fields', n: 10 }, { id: newGoalId(id), type: 'min_captures', n: 5 }],
    goalRewards: [null, null, null], firstReward: null, tips: [], pos: { x: 0.5, y: 0.5 }, icon: null, status: 'draft', updatedAt: '',
  };
}

function newOpponent(content: CampaignContent): Opponent {
  return {
    id: nextOpponentId(content.opponents.map((o) => o.id)), name: '', description: '', emoji: '👤', avatar: null, level: 'medium', deck: [], prefer: [], rank: 'normal',
    intro: '', winText: '', loseText: '', portrait: null, background: null, updatedAt: '',
  };
}

function OrderButtons({ onUp, onDown }: { onUp?: () => void; onDown?: () => void }) {
  return (
    <span className="order-buttons">
      <button type="button" className="btn btn-small" disabled={!onUp} onClick={onUp} aria-label="Nach oben">▲</button>
      <button type="button" className="btn btn-small" disabled={!onDown} onClick={onDown} aria-label="Nach unten">▼</button>
    </span>
  );
}

function ProblemBadge({ problems }: { problems: Problem[] }) {
  const e = problems.filter((p) => p.level === 'error').length;
  const w = problems.length - e;
  if (!problems.length) return <span className="ok-text"> · ✓</span>;
  return <> · {e > 0 && <span className="field-error">⛔ {e}</span>} {w > 0 && <span className="field-warn">⚠️ {w}</span>}</>;
}

function ProblemList({ problems }: { problems: Problem[] }) {
  if (!problems.length) return <p className="ok-text">✓ Keine Probleme gefunden.</p>;
  return (
    <ul className="problem-list">
      {problems.map((p, i) => (
        <li key={i} className={p.level === 'error' ? 'field-error' : 'field-warn'}>
          {p.level === 'error' ? '⛔' : '⚠️'} <b>{p.where}:</b> {p.text}
        </li>
      ))}
    </ul>
  );
}

/** Cards a world refers to that are not in the game (missing or not active). */
function MissingCards({ world, content }: { world: World; content: CampaignContent }) {
  const active = new Set(CARDS.map((c) => c.id));
  const missions = content.missions.filter((m) => m.worldId === world.id);
  const ids = new Set<string>();
  for (const m of missions) for (const id of content.opponents.find((o) => o.id === m.opponentId)?.deck ?? []) ids.add(id);
  for (const ms of world.milestones) if (ms.reward.cardId) ids.add(ms.reward.cardId);
  const missing = [...ids].filter((id) => !active.has(id));
  if (!missing.length) return null;
  return <p className="field-error">Fehlende Karten: {missing.map((id) => (isCardId(id) ? `${getCard(id).name} (${id})` : id)).join(', ')}</p>;
}

export function StatusSeg({ value, onChange }: { value: ContentStatus; onChange: (s: ContentStatus) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Status">
      {CONTENT_STATUSES.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} className={`seg status-seg-${s} ${value === s ? 'active' : ''}`} onClick={() => onChange(s)}>
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

function EditorHead({ title, dirty, status, onClose }: { title: string; dirty: boolean; status: ContentStatus; onClose: () => void }) {
  return (
    <div className="arena-editor-head">
      <ConfirmButton label={`◀ ${title}`} ariaLabel="Zurück zur Liste" confirmLabel="Ungespeichert verwerfen?" onConfirm={onClose} skipConfirm={!dirty} />
      <span className={`status-pill status-${status}`}>{STATUS_LABEL[status]}</span>
    </div>
  );
}

export function TextField({ label, value, max, onChange, multiline, placeholder }: { label: string; value: string; max: number; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline
        ? <textarea className="admin-input" rows={3} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        : <input className="admin-input" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function NumberField({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="admin-input" type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Math.round(Number(e.target.value) || 0))))} />
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** Planned reward (type, coins, card, cosmetic name). */
function RewardEditor({ value, onChange, allowNone = true }: { value: Reward | null; onChange: (r: Reward | null) => void; allowNone?: boolean }) {
  const type = value?.type ?? '';
  return (
    <div className="reward-editor">
      <select className="admin-input" value={type} onChange={(e) => {
        const t = e.target.value as RewardType | '';
        if (!t) return onChange(null);
        onChange(t === 'coins' ? { type: t, amount: 100 } : t === 'pack' ? { type: t, amount: 1 } : t === 'card' || t === 'alt_art' ? { type: t, cardId: value?.cardId ?? 'c01' } : { type: t, label: value?.label ?? '' });
      }} aria-label="Belohnungsart">
        {allowNone && <option value="">– keine –</option>}
        {REWARD_TYPES.map((t) => <option key={t} value={t}>{REWARD_ICON[t]} {REWARD_LABEL[t]}</option>)}
      </select>
      {value && (value.type === 'coins' || value.type === 'pack') && (
        <input className="admin-input num" type="number" inputMode="numeric" min={1} max={value.type === 'pack' ? 10 : 100000} value={value.amount ?? 1}
          onChange={(e) => onChange({ ...value, amount: Math.max(1, Math.round(Number(e.target.value) || 1)) })} aria-label="Menge" />
      )}
      {value && (value.type === 'card' || value.type === 'alt_art') && (
        <select className="admin-input" value={value.cardId ?? ''} onChange={(e) => onChange({ ...value, cardId: e.target.value })} aria-label="Karte">
          {CARDS.map((c) => <option key={c.id} value={c.id}>{c.name} ({RARITY_LABEL[c.rarity]})</option>)}
        </select>
      )}
      {value && value.type !== 'coins' && value.type !== 'pack' && value.type !== 'card' && (
        <input className="admin-input" value={value.label ?? ''} maxLength={60} placeholder={value.type === 'alt_art' ? 'Name der Illustration' : 'Name'} onChange={(e) => onChange({ ...value, label: e.target.value })} aria-label="Bezeichnung" />
      )}
      {value?.type === 'card' && <small className="field-warn">Spielbare Karten als Belohnung: Liga-Fairness beachten – kosmetische Belohnungen sind bevorzugt.</small>}
    </div>
  );
}

/** Upload with recommended size and the pan/zoom frame from the board designer. */
export function ImageField({ kind, value, onChange, assets, onToast }: { kind: ImageKind; value: ImageRef | null; onChange: (v: ImageRef | null) => void; assets: Assets | null; onToast: (m: string) => void }) {
  const spec = IMAGE_SPECS[kind];
  const [busy, setBusy] = useState(false);
  const setFit = (fit: ImageFit) => value && onChange({ ...value, fit: clampFit(fit) });
  const gestures = usePanZoom(value?.fit ?? DEFAULT_FIT, setFit, 1, value ? { imageW: value.w, imageH: value.h } : null);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !assets) return;
    if (!file.type.startsWith('image/')) return onToast('Bitte eine Bilddatei wählen (JPEG, PNG oder WebP).');
    if (file.size > UPLOAD_MAX_BYTES) return onToast('Das Bild ist größer als 15 MB. Bitte eine kleinere Datei wählen.');
    setBusy(true);
    try {
      const copy = await prepareCoverImage(file, { w: spec.w, h: spec.h });
      const up = await assets.upload(copy.blob, { type: copy.type });
      onChange({ id: up.id, w: copy.w, h: copy.h, fit: { ...DEFAULT_FIT } });
      onToast('Bild hochgeladen ✓ – Ausschnitt mit dem Finger wählen, dann speichern');
    } catch (err) {
      onToast((err as Error)?.message === 'image_decode' ? 'Dieses Bild konnte nicht gelesen werden.' : describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const small = value && (value.w < spec.w * 0.6 || value.h < spec.h * 0.6);
  return (
    <div className="field image-field">
      <span>{spec.label}</span>
      <details className="upload-info">
        <summary>Empfohlen: {spec.w} × {spec.h} px · {spec.ratio}</summary>
        <dl>
          <dt>Breite × Höhe</dt><dd>{spec.w} × {spec.h} Pixel</dd>
          <dt>Seitenverhältnis</dt><dd>{spec.ratio}</dd>
          <dt>Dateiformat</dt><dd>JPEG oder WebP (PNG nur bei Transparenz)</dd>
          <dt>Dateigröße</dt><dd>am besten unter 2 MB (höchstens 15 MB)</dd>
        </dl>
        <p className="muted">Andere Maße gehen auch: Das Bild füllt den Rahmen ohne Verzerrung, den Ausschnitt wählst du mit dem Finger (1 Finger verschieben, 2 Finger zoomen). Im Spiel wird eine passend verkleinerte Kopie geladen.</p>
      </details>
      <div className={`image-frame kind-${kind}`} style={{ aspectRatio: String(spec.aspect) }} {...gestures}>
        {value ? <CampaignImage img={value} /> : <span className="muted">Kein Bild</span>}
      </div>
      {value && (
        <>
          <Slider label="Zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={value.fit.zoom} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setFit({ ...value.fit, zoom: v })} />
          <small className="muted">Dein Bild: {value.w} × {value.h} px{small ? ' – recht klein, kann unscharf wirken.' : ''}</small>
        </>
      )}
      <div className="row-buttons">
        <label className={`btn btn-small ${!assets || busy ? 'disabled' : ''}`}>
          {busy ? 'Lädt hoch …' : value ? '🖼️ Anderes Bild' : '🖼️ Bild hochladen'}
          <input type="file" accept="image/*" hidden disabled={!assets || busy} onChange={upload} />
        </label>
        {value && <button type="button" className="btn btn-small" onClick={() => onChange(null)}>Bild entfernen</button>}
      </div>
      {!assets && <small className="muted">Bild-Upload ist in dieser Ansicht nicht verfügbar.</small>}
    </div>
  );
}

function useSave<T extends { updatedAt: string }>(initial: T) {
  const [draft, setDraft] = useState<T>(initial);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const [busy, setBusy] = useState(false);
  return { draft, setDraft, dirty, busy, setBusy };
}

// ---------- World editor ----------

function WorldEditor({ db, assets, initial, content, onToast, onDone, onClose, onTest }: {
  db: Db; assets: Assets | null; initial: World; content: CampaignContent; onToast: (m: string) => void; onDone: (m: string) => void; onClose: () => void; onTest: () => void;
}) {
  const { draft, setDraft, dirty, busy, setBusy } = useSave(initial);
  const set = (patch: Partial<World>) => setDraft((d) => ({ ...d, ...patch }));
  const preview = { ...content, worlds: content.worlds.map((w) => (w.id === draft.id ? draft : w)).concat(content.worlds.some((w) => w.id === draft.id) ? [] : [draft]) };
  const problems = worldProblems(draft, preview).filter((p) => p.where.startsWith('Welt'));
  const max = maxWorldStars(content, draft.id);
  const isBuiltin = BUILTIN_WORLDS.some((w) => w.id === draft.id);
  const setMilestone = (i: number, ms: Milestone | null) => set({ milestones: ms ? draft.milestones.map((x, k) => (k === i ? ms : x)) : draft.milestones.filter((_, k) => k !== i) });

  async function save() {
    if (!draft.name.trim()) return onToast('Bitte einen Namen eingeben.');
    setBusy(true);
    try {
      await saveWorld(db, { ...draft, name: draft.name.trim(), milestones: [...draft.milestones].sort((a, b) => a.stars - b.stars), updatedAt: new Date().toISOString() });
      onDone(draft.status === 'active' ? 'Welt gespeichert und veröffentlicht ✓' : 'Welt gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="scroll campaign-editor">
      <EditorHead title="Welten" dirty={dirty} status={draft.status} onClose={onClose} />
      <TextField label="Name" value={draft.name} max={NAME_MAX} onChange={(name) => set({ name })} placeholder="z. B. Flüsterwald" />
      <TextField label="Beschreibung" value={draft.description} max={TEXT_MAX} multiline onChange={(description) => set({ description })} />
      <div className="field"><span>Status</span><StatusSeg value={draft.status} onChange={(status) => set({ status })} />
        <small className="muted">Entwurf: nur im Testmodus sichtbar. Veröffentlicht: für alle Spieler. Deaktiviert: ausgeblendet, Fortschritt bleibt gespeichert.</small>
      </div>
      <div className="field">
        <span>Freischaltung</span>
        <select className="admin-input" value={draft.unlock.afterWorld ?? ''} onChange={(e) => set({ unlock: { ...draft.unlock, afterWorld: e.target.value || undefined } })} aria-label="Vorher abschließen">
          <option value="">Sofort offen</option>
          {content.worlds.filter((w) => w.id !== draft.id).map((w) => <option key={w.id} value={w.id}>Nach „{w.name}“</option>)}
        </select>
        <NumberField label="Und mindestens Sterne insgesamt" value={draft.unlock.minStars ?? 0} min={0} max={999} onChange={(n) => set({ unlock: { ...draft.unlock, minStars: n || undefined } })} />
      </div>
      <ImageField kind="worldTile" value={draft.tile} onChange={(tile) => set({ tile })} assets={assets} onToast={onToast} />
      <ImageField kind="worldMap" value={draft.map} onChange={(map) => set({ map })} assets={assets} onToast={onToast} />
      <div className="field">
        <span>Sterne-Meilensteine <small className="muted">(höchstens {max} ★ in dieser Welt)</small></span>
        {draft.milestones.map((ms, i) => (
          <div key={i} className="milestone-row">
            <input className="admin-input num" type="number" inputMode="numeric" min={1} max={999} value={ms.stars} onChange={(e) => setMilestone(i, { ...ms, stars: Math.max(1, Math.round(Number(e.target.value) || 1)) })} aria-label="Sterne" />
            <span>★</span>
            <RewardEditor value={ms.reward} allowNone={false} onChange={(r) => r && setMilestone(i, { ...ms, reward: r })} />
            <button type="button" className="btn btn-small" onClick={() => setMilestone(i, null)} aria-label="Meilenstein entfernen">✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-small" disabled={draft.milestones.length >= 12} onClick={() => set({ milestones: [...draft.milestones, { stars: Math.min(max || 5, (draft.milestones[draft.milestones.length - 1]?.stars ?? 0) + 5), reward: { type: 'coins', amount: 100 } }] })}>＋ Meilenstein</button>
      </div>
      <ProblemList problems={problems} />
      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
        <button type="button" className="btn" disabled={dirty} onClick={() => onTest()}>🧪 Testen</button>
      </div>
      {isBuiltin && <small className="muted">Eingebaute Welt: Deine Änderungen ersetzen die Vorlage.</small>}
    </div>
  );
}

// ---------- Mission editor ----------

function MissionEditor({ db, assets, initial, content, onToast, onDone, onClose, onTest }: {
  db: Db; assets: Assets | null; initial: Mission; content: CampaignContent; onToast: (m: string) => void; onDone: (m: string) => void; onClose: () => void; onTest: (missionId?: string) => void;
}) {
  const { draft, setDraft, dirty, busy, setBusy } = useSave(initial);
  const set = (patch: Partial<Mission>) => setDraft((d) => ({ ...d, ...patch }));
  const arenas: Arena[] = ARENAS.filter((a) => a.status !== 'disabled' || a.id === draft.arenaId);
  const arena = ARENAS.find((a) => a.id === draft.arenaId);
  const problems = missionProblems(draft, content);
  const siblings = content.missions.filter((m) => m.worldId === draft.worldId && m.id !== draft.id);
  const savedGoals = new Map(initial.goals.map((g) => [g.id, g]));

  /** Changing a goal gives it a new id – players keep stars they earned with the old goal. */
  function setGoal(i: number, patch: Partial<Goal>) {
    const goals = draft.goals.map((g, k) => {
      if (k !== i) return g;
      const next = { ...g, ...patch };
      const old = savedGoals.get(g.id);
      const changed = old && (old.type !== next.type || old.n !== next.n || old.cls !== next.cls || old.effect !== next.effect);
      return changed ? { ...next, id: newGoalId(draft.id) } : next;
    });
    set({ goals });
  }

  async function save(statusOverride?: ContentStatus) {
    if (!draft.name.trim()) return onToast('Bitte einen Namen eingeben.');
    const m = { ...draft, name: draft.name.trim(), status: statusOverride ?? draft.status, updatedAt: new Date().toISOString() };
    if (m.status === 'active' && missionProblems(m, content).some((p) => p.level === 'error')) return onToast('Veröffentlichen geht erst ohne Fehler (⛔). Als Entwurf kannst du speichern.');
    setBusy(true);
    try {
      await saveMission(db, m);
      onDone(m.status === 'active' ? 'Mission gespeichert und veröffentlicht ✓' : 'Mission gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  async function duplicate() {
    const id = nextMissionId(content.missions.map((m) => m.id));
    const copy: Mission = {
      ...clone(draft), id, name: `${draft.name} (Kopie)`.slice(0, NAME_MAX), status: 'draft', order: Math.max(0, ...content.missions.filter((m) => m.worldId === draft.worldId).map((m) => m.order)) + 1,
      goals: draft.goals.map((g) => ({ ...g, id: newGoalId(id) })), updatedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      await saveMission(db, copy);
      onDone('Kopie als Entwurf angelegt ✓');
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="scroll campaign-editor">
      <EditorHead title="Missionen" dirty={dirty} status={draft.status} onClose={onClose} />
      <TextField label="Name" value={draft.name} max={NAME_MAX} onChange={(name) => set({ name })} />
      <TextField label="Beschreibung" value={draft.description} max={TEXT_MAX} multiline onChange={(description) => set({ description })} />
      <div className="field-row wrap">
        <label className="field grow"><span>Welt</span>
          <select className="admin-input" value={draft.worldId} onChange={(e) => set({ worldId: e.target.value })}>
            {content.worlds.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>
        <label className="field grow"><span>Typ</span>
          <select className="admin-input" value={draft.kind} onChange={(e) => set({ kind: e.target.value as MissionKind })}>
            {MISSION_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <label className="field grow"><span>Ablauf</span>
          <select className="admin-input" value={draft.mode} onChange={(e) => set({ mode: e.target.value as MissionMode })}>
            {(Object.keys(MODE_LABEL) as MissionMode[]).map((k) => <option key={k} value={k}>{MODE_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <div className="field-row wrap">
        <label className="field grow"><span>Gegner</span>
          <select className="admin-input" value={draft.opponentId} onChange={(e) => set({ opponentId: e.target.value })}>
            {content.opponents.map((o) => <option key={o.id} value={o.id}>{o.emoji} {o.name} ({LEVEL_LABEL[o.level]})</option>)}
          </select>
        </label>
        <label className="field grow"><span>Arena</span>
          <select className="admin-input" value={draft.arenaId} onChange={(e) => set({ arenaId: e.target.value })}>
            {arenas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      </div>
      {arena && <p className="arena-preview-line"><TerrainMini cells={arena.cells} /> <span className="muted small">Neue Arenen legst du im Reiter „Arenen“ an (Status „Nur Kampagne“).</span></p>}
      <div className="field-row wrap">
        <label className="field grow"><span>Kartenregel</span>
          <select className="admin-input" value={draft.onlyClass ?? ''} onChange={(e) => set({ onlyClass: (e.target.value || undefined) as CardClass | undefined })}>
            <option value="">Alle Karten aus dem Deck</option>
            {CLASSES.map((c) => <option key={c} value={c}>Nur {CLASS_INFO[c].icon} {CLASS_INFO[c].label} (fehlende = gewöhnliche Leihkarten)</option>)}
          </select>
        </label>
        <NumberField label="Zusätzlich nötige Sterne in der Welt" value={draft.minWorldStars ?? 0} min={0} max={999} onChange={(n) => set({ minWorldStars: n || undefined })} hint="0 = nur die vorherige Mission gewinnen" />
      </div>

      <div className="field">
        <span>Sterne-Ziele</span>
        {draft.goals.map((g, i) => (
          <GoalEditor key={i} index={i} goal={g} reward={draft.goalRewards[i] ?? null} ctx={{ runner: draft.mode === 'runner', terrain: arena?.cells ?? [], rocks: 0, onlyClass: draft.onlyClass }}
            onGoal={(patch) => setGoal(i, patch)}
            onReward={(r) => set({ goalRewards: draft.goals.map((_, k) => (k === i ? r : draft.goalRewards[k] ?? null)) })}
            onRemove={i > 0 && draft.goals.length > 1 ? () => set({ goals: draft.goals.filter((_, k) => k !== i), goalRewards: draft.goalRewards.filter((_, k) => k !== i) }) : undefined} />
        ))}
        {draft.goals.length < GOALS_PER_MISSION && (
          <button type="button" className="btn btn-small" onClick={() => set({ goals: [...draft.goals, { id: newGoalId(draft.id), type: 'min_fields', n: 10 }], goalRewards: [...draft.goalRewards, null] })}>＋ Ziel</button>
        )}
        <small className="muted">Alle Ziele brauchen einen Sieg. Erreichte Sterne behalten Spieler auch, wenn du ein Ziel später änderst. „In N Zügen gewinnen“ gibt es nicht – jedes Duell dauert immer gleich lang.</small>
      </div>
      <div className="field"><span>Belohnung beim ersten Sieg</span><RewardEditor value={draft.firstReward} onChange={(firstReward) => set({ firstReward })} /></div>
      <TextField label="Tipps vor dem Duell (eine Zeile pro Tipp)" value={draft.tips.join('\n')} max={900} multiline onChange={(t) => set({ tips: t.split('\n').map((x) => x.slice(0, 160)).slice(0, 6) })} />
      <ImageField kind="missionIcon" value={draft.icon} onChange={(icon) => set({ icon })} assets={assets} onToast={onToast} />
      <div className="field">
        <span>Position auf der Weltkarte</span>
        <MapPicker world={content.worlds.find((w) => w.id === draft.worldId) ?? null} missions={siblings} self={draft} onPick={(pos) => set({ pos })} />
        <small className="muted">Tippe auf die Karte, um die Station zu setzen.</small>
      </div>
      <div className="field"><span>Status</span><StatusSeg value={draft.status} onChange={(status) => set({ status })} /></div>
      <ProblemList problems={problems} />
      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => save()}>{busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
        <button type="button" className="btn" disabled={dirty} onClick={() => onTest(draft.id)} title={dirty ? 'Erst speichern' : ''}>🧪 Mission testen</button>
        <button type="button" className="btn" disabled={busy || dirty} onClick={duplicate}>⧉ Duplizieren</button>
      </div>
      {dirty && <small className="muted">Zum Testen zuerst speichern (als Entwurf sehen Spieler nichts).</small>}
      {BUILTIN_MISSIONS.some((m) => m.id === draft.id) && <small className="muted">Eingebaute Mission: Deine Änderungen ersetzen die Vorlage.</small>}
    </div>
  );
}

function GoalEditor({ index, goal, reward, ctx, onGoal, onReward, onRemove }: {
  index: number; goal: Goal; reward: Reward | null; ctx: Parameters<typeof goalProblems>[1];
  onGoal: (patch: Partial<Goal>) => void; onReward: (r: Reward | null) => void; onRemove?: () => void;
}) {
  const need = GOAL_NEEDS[goal.type];
  const { errors, warnings } = goalProblems(goal, ctx);
  return (
    <div className="goal-editor">
      <div className="goal-head">
        <b>★ Stern {index + 1}</b>
        {onRemove && <button type="button" className="btn btn-small" onClick={onRemove} aria-label="Ziel entfernen">✕</button>}
      </div>
      {index === 0 ? <p className="small">{goalText(goal)} <span className="muted">(immer das erste Ziel)</span></p> : (
        <>
          <select className="admin-input" value={goal.type} onChange={(e) => {
            const type = e.target.value as GoalType;
            const n = GOAL_NEEDS[type].n;
            onGoal({ type, n: n ? Math.min(n[1], Math.max(n[0], goal.n || n[0])) : 0, cls: GOAL_NEEDS[type].cls ? goal.cls ?? 'natur' : undefined, effect: GOAL_NEEDS[type].effect ? goal.effect ?? 'naturbund' : undefined });
          }} aria-label="Zieltyp">
            {GOAL_TYPES.filter((t) => t !== 'win').map((t) => <option key={t} value={t}>{GOAL_LABEL[t]}</option>)}
          </select>
          <div className="field-row">
            {need.n && <input className="admin-input num" type="number" inputMode="numeric" min={need.n[0]} max={need.n[1]} value={goal.n} onChange={(e) => onGoal({ n: Math.round(Number(e.target.value) || need.n![0]) })} aria-label="Anzahl" />}
            {need.cls && (
              <select className="admin-input" value={goal.cls ?? ''} onChange={(e) => onGoal({ cls: e.target.value as CardClass })} aria-label="Klasse">
                {CLASSES.map((c) => <option key={c} value={c}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</option>)}
              </select>
            )}
            {need.effect && (
              <select className="admin-input" value={goal.effect ?? ''} onChange={(e) => onGoal({ effect: e.target.value as EffectId })} aria-label="Effekt">
                {(Object.keys(EFFECTS) as EffectId[]).map((id) => <option key={id} value={id}>{EFFECTS[id].name}</option>)}
              </select>
            )}
          </div>
          <p className="small">„{goalText(goal)}“</p>
        </>
      )}
      {errors.map((t, i) => <p key={`e${i}`} className="field-error small">⛔ {t}</p>)}
      {warnings.map((t, i) => <p key={`w${i}`} className="field-warn small">⚠️ {t}</p>)}
      <div className="goal-reward"><small className="muted">Belohnung:</small><RewardEditor value={reward} onChange={onReward} /></div>
    </div>
  );
}

function MapPicker({ world, missions, self, onPick }: { world: World | null; missions: Mission[]; self: Mission; onPick: (pos: { x: number; y: number }) => void }) {
  return (
    <div
      className="map-picker"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onPick({ x: Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width)), y: Math.min(0.97, Math.max(0.03, (e.clientY - r.top) / r.height)) });
      }}
      role="button"
      aria-label="Position wählen"
    >
      {world?.map && <CampaignImage img={world.map} />}
      {missions.map((m) => <span key={m.id} className="pick-dot" style={{ left: `${m.pos.x * 100}%`, top: `${m.pos.y * 100}%` }} title={m.name} />)}
      <span className="pick-dot self" style={{ left: `${self.pos.x * 100}%`, top: `${self.pos.y * 100}%` }} />
    </div>
  );
}

// ---------- Opponent editor ----------

function OpponentEditor({ db, assets, initial, content, onToast, onDone, onClose }: {
  db: Db; assets: Assets | null; initial: Opponent; content: CampaignContent; onToast: (m: string) => void; onDone: (m: string) => void; onClose: () => void;
}) {
  const { draft, setDraft, dirty, busy, setBusy } = useSave(initial);
  const set = (patch: Partial<Opponent>) => setDraft((d) => ({ ...d, ...patch }));
  const problems = opponentProblems(draft);
  const [filter, setFilter] = useState<CardClass | ''>('');
  const pool = CARDS.filter((c) => !filter || c.cls === filter);
  const power = draft.deck.filter(isCardId).reduce((n, id) => n + cardPower(getCard(id)), 0);
  const toggle = (id: string) => set({ deck: draft.deck.includes(id) ? draft.deck.filter((x) => x !== id) : draft.deck.length < HAND_SIZE ? [...draft.deck, id] : draft.deck });
  const used = content.missions.filter((m) => m.opponentId === draft.id);

  async function save() {
    if (!draft.name.trim()) return onToast('Bitte einen Namen eingeben.');
    if (used.some((m) => m.status === 'active') && problems.some((p) => p.level === 'error')) return onToast('Dieser Gegner ist in veröffentlichten Missionen – das Deck braucht genau 8 aktive Karten.');
    setBusy(true);
    try {
      await saveOpponent(db, { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() });
      onDone('Gegner gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="scroll campaign-editor">
      <div className="arena-editor-head">
        <ConfirmButton label="◀ Gegner" ariaLabel="Zurück zur Liste" confirmLabel="Ungespeichert verwerfen?" onConfirm={onClose} skipConfirm={!dirty} />
        <span className={`status-pill rank-pill rank-${draft.rank}`}>{RANK_LABEL[draft.rank]}</span>
      </div>
      <div className="field-row">
        <TextField label="Name" value={draft.name} max={NAME_MAX} onChange={(name) => set({ name })} />
        <label className="field emoji-field"><span>Symbol</span><input className="admin-input" value={draft.emoji} maxLength={8} onChange={(e) => set({ emoji: e.target.value })} /></label>
      </div>
      <TextField label="Beschreibung" value={draft.description} max={TEXT_MAX} multiline onChange={(description) => set({ description })} />
      <div className="field"><span>Art</span>
        <div className="segmented">{(['normal', 'elite', 'boss'] as OpponentRank[]).map((r) => (
          <button key={r} type="button" className={`seg ${draft.rank === r ? 'active' : ''}`} aria-pressed={draft.rank === r} onClick={() => set({ rank: r })}>{RANK_LABEL[r]}</button>
        ))}</div>
      </div>
      <div className="field"><span>KI-Stärke</span>
        <div className="segmented">{AI_LEVELS.map((l: AiLevel) => (
          <button key={l} type="button" className={`seg ${draft.level === l ? 'active' : ''}`} aria-pressed={draft.level === l} onClick={() => set({ level: l })}>{LEVEL_LABEL[l]}</button>
        ))}</div>
        <small className="muted">Leicht: oft zufällig, nimmt manchmal einfache Eroberungen. Mittel: Werte, Nachbarn, Effekte, Gelände. Schwer: denkt zusätzlich deine Antwort voraus und rechnet die letzten Züge durch. Keine Stufe verändert Werte oder Regeln.</small>
      </div>
      <div className="field"><span>Rune des Gegners</span>
        <select className="admin-input" value={draft.rune ?? ''} onChange={(e) => set({ rune: e.target.value || undefined })}>
          <option value="">Keine Rune</option>
          {RUNES.filter((r) => !r.variantOf).map((r) => <option key={r.id} value={r.id}>{r.glyph} {r.name}</option>)}
        </select>
        <small className="muted">Nur aktiv, solange Runen für den Spieler freigegeben sind. Der Gegner setzt sie nach denselben Regeln ein wie du.</small>
      </div>
      <div className="field"><span>Bevorzugte Klassen (höchstens 3)</span>
        <div className="segmented class-seg">{CLASSES.map((c) => (
          <button key={c} type="button" className={`seg ${draft.prefer.includes(c) ? 'active' : ''}`} aria-pressed={draft.prefer.includes(c)}
            onClick={() => set({ prefer: draft.prefer.includes(c) ? draft.prefer.filter((x) => x !== c) : [...draft.prefer, c].slice(-3) })}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</button>
        ))}</div>
      </div>
      <div className="field">
        <span>Deck <small className="muted">{draft.deck.length}/{HAND_SIZE} · Wertesumme {power}</small></span>
        <div className="hand-grid">
          {draft.deck.map((id) => (
            <div key={id} className="hand-pick">{isCardId(id) ? <Card id={id} size="sm" onClick={() => toggle(id)} ariaLabel={`${getCard(id).name} entfernen`} /> : <span className="field-error">{id} fehlt</span>}</div>
          ))}
        </div>
        <select className="admin-input" value={filter} onChange={(e) => setFilter(e.target.value as CardClass | '')} aria-label="Klasse filtern">
          <option value="">Alle Klassen</option>
          {CLASSES.map((c) => <option key={c} value={c}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</option>)}
        </select>
        <div className="hand-grid pool deck-pool">
          {pool.map((c) => (
            <div key={c.id} className="hand-pick">
              <Card id={c.id} size="sm" selected={draft.deck.includes(c.id)} onClick={() => toggle(c.id)} ariaLabel={`${c.name}, ${RARITY_LABEL[c.rarity]}${draft.deck.includes(c.id) ? ', im Deck' : ''}`} />
            </div>
          ))}
        </div>
        <small className="muted">Nur bestehende, aktive Karten. Gegner bekommen keine Extra-Werte.</small>
      </div>
      <ImageField kind="avatar" value={draft.avatar} onChange={(avatar) => set({ avatar })} assets={assets} onToast={onToast} />
      {draft.rank !== 'normal' && (
        <>
          <TextField label="Intro-Text (vor dem Kampf)" value={draft.intro} max={TEXT_MAX} multiline onChange={(intro) => set({ intro })} />
          <TextField label="Text bei deinem Sieg" value={draft.winText} max={TEXT_MAX} multiline onChange={(winText) => set({ winText })} />
          <TextField label="Text bei deiner Niederlage" value={draft.loseText} max={TEXT_MAX} multiline onChange={(loseText) => set({ loseText })} />
          <ImageField kind="bossPortrait" value={draft.portrait} onChange={(portrait) => set({ portrait })} assets={assets} onToast={onToast} />
          <ImageField kind="bossBackground" value={draft.background} onChange={(background) => set({ background })} assets={assets} onToast={onToast} />
          <small className="muted">Sound: kommt, sobald eigene oder freie Audiodateien vorliegen.</small>
        </>
      )}
      <ProblemList problems={problems} />
      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
      </div>
      {used.length > 0 && <small className="muted">Spielt in: {used.map((m) => m.name).join(', ')}</small>}
      {BUILTIN_OPPONENTS.some((o) => o.id === draft.id) && <small className="muted">Eingebauter Gegner: Deine Änderungen ersetzen die Vorlage.</small>}
    </div>
  );
}

