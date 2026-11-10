// Admin: Weltboss-Raids. List with live numbers, editor (boss, picture, class, life points, time, limit, damage
// values, phases with arena/boss deck/AI/rune, personal and community rewards), starting / pausing / ending /
// archiving, and the test mode: a test fight on this device, phase and damage calculator, reward check and
// simulated participants – none of it touches real raid data, rankings or rewards.
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmButton } from '../components/ConfirmButton';
import { ImageField, TextField } from './AdminCampaign';
import { HpBar } from './Raid';
import { AI_LEVELS, AiLevel } from '../game/ai';
import { ARENAS } from '../game/arenas';
import { HAND_SIZE } from '../game/battle';
import { LEVEL_LABEL, REWARD_LABEL, Reward, RewardType, rewardText } from '../game/campaign';
import { CARDS, RARITY_LABEL, cardPower, getCard, isCardId } from '../game/cards';
import { Assets, Db, describeError } from '../game/cardStore';
import { CLASSES, CLASS_INFO, CardClass } from '../game/effects';
import {
  DEFAULT_DAMAGE, RAIDS_COLLECTION, RaidConfig, RaidPhase, RaidSimulation, aiRaidFight, parseRaid, phaseIndex, raidDamage, raidOwed, raidProblems,
  raidToDoc, simulateRaid,
} from '../game/raid';
import { raidAdmin } from '../game/raidApi';
import { createRng } from '../game/rng';
import { RUNES } from '../game/runes';
import { PACKS } from '../game/shop';

interface StateRow {
  id: string; raid_id: string; status: string; config_version: number; max_hp: number; current_hp: number; participants: number; attacks: number;
}

const fmt = (n: number) => n.toLocaleString('de-DE');
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString());

/** What the admin list shows for a raid. */
function statusOf(c: RaidConfig, st: StateRow | undefined, now = Date.now()): { key: string; label: string } {
  if (c.status === 'draft') return { key: 'draft', label: 'Entwurf' };
  if (!st) return { key: 'ready', label: 'Nicht gestartet' };
  if (st.status === 'archived') return { key: 'archived', label: 'Archiviert' };
  if (st.status === 'paused') return { key: 'paused', label: 'Pausiert' };
  if (st.status === 'ended') return { key: 'ended', label: 'Beendet' };
  if (st.current_hp <= 0 || st.status === 'defeated') return { key: 'defeated', label: 'Besiegt' };
  if (now < Date.parse(c.startsAt)) return { key: 'planned', label: 'Geplant' };
  if (now >= Date.parse(c.endsAt)) return { key: 'expired', label: 'Abgelaufen' };
  return { key: 'active', label: 'Aktiv' };
}

function nextRaidId(existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = /^raid(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `raid${String(max + 1).padStart(2, '0')}`;
}

/** A complete example: "Waldwächter", three phases, solo-friendly life points. */
export function templateRaid(id: string): RaidConfig {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  // Boss decks of rising strength (by card power): mid-field cards first, strong ones only in the last phase –
  // a player with a good collection can win every phase alone.
  const byPower = (classes: CardClass[]) => CARDS.filter((c) => c.cls && classes.includes(c.cls) && c.rarity !== 'mythic').sort((a, b) => cardPower(a) - cardPower(b));
  const slice = (list: ReturnType<typeof byPower>, from: number) => {
    const start = Math.max(0, Math.min(list.length - 8, Math.round(list.length * from)));
    return list.slice(start, start + 8).map((c) => c.id);
  };
  const deckA = slice(byPower(['natur']), 0.3);
  const deckB = slice(byPower(['natur', 'schatten']), 0.35);
  const deckC = slice(byPower(['natur', 'schatten']), 0.5);
  const arena = (id2: string) => (ARENAS.some((a) => a.id === id2) ? id2 : 'a01');
  return parseRaid(id, {
    name: 'Erwachen des Waldwächters', bossName: 'Waldwächter', status: 'draft', version: 1, cls: 'natur',
    description: 'Tief im Düsterwald ist der uralte Wächter erwacht. Gemeinsam müssen alle Runenträger ihn zurück in den Schlaf zwingen.',
    maxHp: 20000, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 7 * 86400_000).toISOString(), dailyLimit: 5, resumeMinutes: 30,
    phases: [
      { name: 'Erwachen', arenaId: arena('a02'), deck: deckA, level: 'easy', prefer: ['natur'] },
      { name: 'Verderbnis', threshold: 70, arenaId: arena('a05'), deck: deckB, level: 'medium', prefer: ['schatten'], mechanic: 'Die Arena ist von Schattenfeldern durchzogen.' },
      { name: 'Letzter Widerstand', threshold: 30, arenaId: arena('a08'), deck: deckC, level: 'hard', prefer: ['natur'], rune: 'rn02' },
    ],
    damage: DEFAULT_DAMAGE,
    milestones: [
      { damage: 1000, reward: { type: 'coins', amount: 100 } }, { damage: 3000, reward: { type: 'pack', amount: 1, packId: 'abenteurer' } },
      { damage: 6000, reward: { type: 'coins', amount: 250 } }, { damage: 10000, reward: { type: 'pack', amount: 1, packId: 'helden' } },
    ],
    globalRewards: [
      { percent: 25, reward: { type: 'coins', amount: 50 } }, { percent: 50, reward: { type: 'coins', amount: 100 } },
      { percent: 75, reward: { type: 'coins', amount: 150 } }, { percent: 100, reward: { type: 'pack', amount: 1, packId: 'helden' } },
    ],
    minAttacksForGlobal: 1,
  })!;
}

interface Props {
  db: Db;
  assets: Assets | null;
  onToast: (m: string) => void;
  /** Test fight on this device with the raid as it is in the editor (nothing is stored). */
  onTestFight: (config: RaidConfig, phase: number) => void;
}

export function RaidsView({ db, assets, onToast, onTestFight }: Props) {
  const [raids, setRaids] = useState<RaidConfig[] | null>(null);
  const [states, setStates] = useState<StateRow[]>([]);
  const [editing, setEditing] = useState<RaidConfig | null>(null);
  const isNew = !!editing && !raids?.some((r) => r.id === editing.id);
  const loadStates = async () => {
    const r = await raidAdmin('admin-list');
    if (Array.isArray(r.states)) setStates(r.states as StateRow[]);
    else if (r.error) onToast(`Raid-Status konnte nicht geladen werden (${String(r.error)}).`);
  };
  useEffect(
    () =>
      db.collection(RAIDS_COLLECTION).onSnapshot(
        (snap) => setRaids(snap.docs.flatMap((d) => {
          const c = d.exists ? parseRaid(d.id, d.data()) : null;
          return c ? [c] : [];
        })),
        (e) => onToast(describeError(e)),
      ),
    [db, onToast],
  );
  useEffect(() => {
    void loadStates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!raids) return <p className="muted center">Raids werden geladen …</p>;
  if (editing) {
    return (
      <RaidEditor key={editing.id} db={db} assets={assets} initial={editing} isNew={isNew} state={states.find((s) => s.raid_id === editing.id)} onToast={onToast}
        onTestFight={onTestFight} onStates={loadStates} onClose={() => { setEditing(null); void loadStates(); }} />
    );
  }
  return (
    <div className="scroll campaign-admin">
      <div className="admin-toolbar">
        <span className="muted small grow">Ein Raid ist ein zeitlich begrenzter Weltboss für alle Spieler. Erst als Entwurf testen, dann veröffentlichen und starten.</span>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(templateRaid(nextRaidId(raids.map((r) => r.id))))}>＋ Neuer Raid</button>
      </div>
      {raids.length === 0 && <p className="muted">Noch kein Raid. „Neuer Raid“ legt den Beispiel-Boss „Waldwächter“ mit drei Phasen als Entwurf an.</p>}
      <ul className="admin-list">
        {[...raids].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map((c) => {
          const st = states.find((s) => s.raid_id === c.id);
          const status = statusOf(c, st);
          return (
            <li key={c.id}>
              <button type="button" className="admin-row" onClick={() => setEditing(JSON.parse(JSON.stringify(c)) as RaidConfig)}>
                <span className="admin-row-main">
                  <strong>{c.name}</strong>
                  <span className="admin-row-meta">
                    {c.bossName} · {new Date(c.startsAt).toLocaleDateString('de-DE')} – {new Date(c.endsAt).toLocaleDateString('de-DE')}
                    {' · '}{st ? `${fmt(st.current_hp)} / ${fmt(st.max_hp)} LP · ${st.participants} Teilnehmer · ${st.attacks} Kämpfe` : `${fmt(c.maxHp)} LP`}
                  </span>
                </span>
                <span className={`status-pill raid-st-${status.key}`}>{status.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RewardEdit({ value, onChange }: { value: Reward; onChange: (r: Reward) => void }) {
  const types: RewardType[] = ['coins', 'stones', 'pack', 'card'];
  return (
    <span className="raid-reward-edit">
      <select className="admin-input" value={value.type} onChange={(e) => {
        const t = e.target.value as RewardType;
        onChange(t === 'coins' ? { type: 'coins', amount: 100 } : t === 'stones' ? { type: 'stones', amount: 20 } : t === 'pack' ? { type: 'pack', amount: 1, packId: PACKS[0].id } : { type: 'card', cardId: CARDS[0].id });
      }}>
        {types.map((t) => <option key={t} value={t}>{REWARD_LABEL[t]}</option>)}
      </select>
      {(value.type === 'coins' || value.type === 'stones' || value.type === 'pack') && (
        <input className="admin-input num" type="number" inputMode="numeric" min={1} value={value.amount ?? 1}
          onChange={(e) => onChange({ ...value, amount: Math.max(1, Math.round(Number(e.target.value) || 1)) })} aria-label="Anzahl" />
      )}
      {value.type === 'pack' && (
        <select className="admin-input" value={value.packId ?? PACKS[0].id} onChange={(e) => onChange({ ...value, packId: e.target.value })}>
          {PACKS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {value.type === 'card' && (
        <select className="admin-input" value={value.cardId ?? ''} onChange={(e) => onChange({ ...value, cardId: e.target.value })}>
          {CARDS.map((c) => <option key={c.id} value={c.id}>{c.name} ({RARITY_LABEL[c.rarity]})</option>)}
        </select>
      )}
    </span>
  );
}

function PhaseEdit({ phase, index, onChange, onRemove }: { phase: RaidPhase; index: number; onChange: (p: RaidPhase) => void; onRemove?: () => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<CardClass | ''>('');
  const set = (patch: Partial<RaidPhase>) => onChange({ ...phase, ...patch });
  const toggle = (id: string) => set({ deck: phase.deck.includes(id) ? phase.deck.filter((x) => x !== id) : phase.deck.length < HAND_SIZE ? [...phase.deck, id] : phase.deck });
  const pool = CARDS.filter((c) => !filter || c.cls === filter);
  return (
    <section className="check-world raid-phase-edit">
      <h3>Phase {index + 1}{index === 0 ? ' (Start)' : ''}</h3>
      <div className="field-row wrap">
        <TextField label="Bezeichnung" value={phase.name} max={40} onChange={(name) => set({ name })} />
        {index > 0 && (
          <label className="field"><span>Beginnt unter … % LP</span>
            <input className="admin-input num" type="number" inputMode="numeric" min={1} max={99} value={phase.threshold}
              onChange={(e) => set({ threshold: Math.max(1, Math.min(99, Math.round(Number(e.target.value) || 1))) })} />
          </label>
        )}
      </div>
      <label className="field"><span>Arena</span>
        <select className="admin-input" value={phase.arenaId} onChange={(e) => set({ arenaId: e.target.value })}>
          {ARENAS.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.id})</option>)}
        </select>
      </label>
      <div className="field"><span>KI-Stärke</span>
        <div className="segmented">{AI_LEVELS.map((l: AiLevel) => (
          <button key={l} type="button" className={`seg ${phase.level === l ? 'active' : ''}`} aria-pressed={phase.level === l} onClick={() => set({ level: l })}>{LEVEL_LABEL[l]}</button>
        ))}</div>
      </div>
      <label className="field"><span>Rune des Bosses</span>
        <select className="admin-input" value={phase.rune ?? ''} onChange={(e) => set({ rune: e.target.value || null })}>
          <option value="">Keine Rune</option>
          {RUNES.filter((r) => !r.variantOf).map((r) => <option key={r.id} value={r.id}>{r.glyph} {r.name}</option>)}
        </select>
      </label>
      <div className="field"><span>Bevorzugte Klassen (höchstens 3)</span>
        <div className="segmented class-seg">{CLASSES.map((c) => (
          <button key={c} type="button" className={`seg ${phase.prefer.includes(c) ? 'active' : ''}`} aria-pressed={phase.prefer.includes(c)}
            onClick={() => set({ prefer: phase.prefer.includes(c) ? phase.prefer.filter((x) => x !== c) : [...phase.prefer, c].slice(-3) })}>{CLASS_INFO[c].icon}</button>
        ))}</div>
      </div>
      <TextField label="Besondere Mechanik (Text, optional)" value={phase.mechanic} max={200} onChange={(mechanic) => set({ mechanic })} />
      <div className="field">
        <span>Bossdeck <small className="muted">{phase.deck.length}/{HAND_SIZE}</small></span>
        <div className="hand-grid">
          {phase.deck.map((id) => (
            <div key={id} className="hand-pick">{isCardId(id) ? <Card id={id} size="sm" onClick={() => toggle(id)} ariaLabel={`${getCard(id).name} entfernen`} /> : <span className="field-error">{id} fehlt</span>}</div>
          ))}
        </div>
        <button type="button" className="btn btn-small" onClick={() => setOpen(!open)}>{open ? 'Kartenauswahl schließen' : 'Karten wählen'}</button>
        {open && (
          <>
            <select className="admin-input" value={filter} onChange={(e) => setFilter(e.target.value as CardClass | '')} aria-label="Klasse filtern">
              <option value="">Alle Klassen</option>
              {CLASSES.map((c) => <option key={c} value={c}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</option>)}
            </select>
            <div className="hand-grid pool deck-pool">
              {pool.map((c) => (
                <div key={c.id} className="hand-pick">
                  <Card id={c.id} size="sm" selected={phase.deck.includes(c.id)} onClick={() => toggle(c.id)} ariaLabel={`${c.name}${phase.deck.includes(c.id) ? ', im Deck' : ''}`} />
                </div>
              ))}
            </div>
          </>
        )}
        <small className="muted">Nur bestehende Karten – der Boss bekommt keine Extra-Werte, keine Extra-Züge.</small>
      </div>
      {onRemove && <ConfirmButton label="Phase entfernen" ariaLabel="Phase entfernen" confirmLabel="Wirklich entfernen?" onConfirm={onRemove} />}
    </section>
  );
}

function RaidEditor({ db, assets, initial, isNew, state, onToast, onTestFight, onStates, onClose }: {
  db: Db; assets: Assets | null; initial: RaidConfig; isNew: boolean; state: StateRow | undefined; onToast: (m: string) => void;
  onTestFight: (c: RaidConfig, phase: number) => void; onStates: () => Promise<void>; onClose: () => void;
}) {
  const [saved, setSaved] = useState<RaidConfig>(initial);
  const [draft, setDraft] = useState<RaidConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [stored, setStored] = useState(!isNew);
  const set = (patch: Partial<RaidConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = !stored || JSON.stringify(draft) !== JSON.stringify(saved);
  const problems = raidProblems(draft);
  const status = statusOf(saved, state);
  const live = !!state && ['active', 'paused', 'planned'].includes(status.key);

  async function save() {
    if (!draft.name.trim()) return onToast('Bitte einen Raidnamen eingeben.');
    if (draft.status === 'published' && problems.length) return onToast('Zum Veröffentlichen erst die Hinweise unten beheben.');
    setBusy(true);
    try {
      // A changed raid gets a new version; fights already running keep the setup they started with.
      const next = { ...draft, name: draft.name.trim(), version: saved.version + (state ? 1 : 0), updatedAt: new Date().toISOString() };
      await db.collection(RAIDS_COLLECTION).doc(next.id).set(raidToDoc(next));
      setSaved(next);
      setDraft(next);
      setStored(true);
      onToast(live ? 'Gespeichert ✓ – gilt ab sofort für neue Kämpfe. Geänderte LP mit „Änderungen übernehmen“ aktivieren.' : 'Raid gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function admin(action: 'admin-publish' | 'admin-status', body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const r = await raidAdmin(action, { raidId: saved.id, ...body });
    setBusy(false);
    if (r.error) return onToast(r.error === 'problems' ? `Noch nicht startklar: ${(r.problems as string[]).join(' ')}` : r.error === 'draft' ? 'Erst als „Veröffentlicht“ speichern.' : `Fehler: ${String(r.error)}`);
    onToast(ok);
    await onStates();
  }

  return (
    <div className="scroll campaign-editor raid-editor">
      <div className="arena-editor-head">
        <ConfirmButton label="◀ Raids" ariaLabel="Zurück zur Liste" confirmLabel="Ungespeichert verwerfen?" onConfirm={onClose} skipConfirm={!dirty} />
        <span className={`status-pill raid-st-${status.key}`}>{status.label}</span>
      </div>
      {state && (
        <section className="check-world">
          <h3>Live-Stand</h3>
          <HpBar current={state.current_hp} max={state.max_hp} phases={saved.phases} />
          <p className="small">{state.participants} Teilnehmer · {state.attacks} Kämpfe · Phase {phaseIndex(saved, state.current_hp) + 1} · Version {state.config_version}{state.config_version !== saved.version ? ` (gespeichert: ${saved.version})` : ''}</p>
        </section>
      )}
      {live && <p className="small raid-live-note">Dieser Raid läuft. Änderungen gelten nach dem Speichern sofort für <b>neue</b> Kämpfe – laufende Kämpfe behalten ihre Einstellungen. Neue Maximal-LP erst mit „Änderungen übernehmen“ (bereits verursachter Schaden bleibt).</p>}

      <TextField label="Raidname" value={draft.name} max={60} onChange={(name) => set({ name })} />
      <TextField label="Bossname" value={draft.bossName} max={40} onChange={(bossName) => set({ bossName })} />
      <TextField label="Beschreibung" value={draft.description} max={600} multiline onChange={(description) => set({ description })} />
      <ImageField kind="raidBoss" value={draft.image} onChange={(image) => set({ image })} assets={assets} onToast={onToast} />
      <label className="field"><span>Klasse / Element des Bosses</span>
        <select className="admin-input" value={draft.cls ?? ''} onChange={(e) => set({ cls: (e.target.value || null) as CardClass | null })}>
          <option value="">– keine –</option>
          {CLASSES.map((c) => <option key={c} value={c}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</option>)}
        </select>
      </label>
      <div className="field-row wrap">
        <label className="field grow"><span>Maximale LP</span>
          <input className="admin-input num" type="number" inputMode="numeric" min={100} value={draft.maxHp} onChange={(e) => set({ maxHp: Math.max(100, Math.round(Number(e.target.value) || 100)) })} />
        </label>
        <label className="field grow"><span>Angriffe pro Tag</span>
          <input className="admin-input num" type="number" inputMode="numeric" min={1} max={50} value={draft.dailyLimit} onChange={(e) => set({ dailyLimit: Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1))) })} />
        </label>
        <label className="field grow"><span>Frist für begonnene Kämpfe (Min.)</span>
          <input className="admin-input num" type="number" inputMode="numeric" min={5} max={1440} value={draft.resumeMinutes} onChange={(e) => set({ resumeMinutes: Math.max(5, Math.min(1440, Math.round(Number(e.target.value) || 30))) })} />
        </label>
      </div>
      <small className="muted">Solo-Faustregel: Ein Spieler schafft etwa 500–700 Schaden pro Angriff. 5 Angriffe × 7 Tage ≈ 20.000 LP. Der Tag wechselt um 0 Uhr UTC (1 Uhr deutscher Winterzeit).</small>
      <div className="field-row wrap">
        <label className="field grow"><span>Start</span><input className="admin-input" type="datetime-local" value={toLocalInput(draft.startsAt)} onChange={(e) => set({ startsAt: fromLocalInput(e.target.value) })} /></label>
        <label className="field grow"><span>Ende</span><input className="admin-input" type="datetime-local" value={toLocalInput(draft.endsAt)} onChange={(e) => set({ endsAt: fromLocalInput(e.target.value) })} /></label>
      </div>

      <section className="check-world">
        <h3>Schaden pro Kampf</h3>
        <div className="field-row wrap">
          {([['loss', 'Niederlage'], ['draw', 'Unentschieden'], ['win', 'Sieg'], ['perField', 'je Feld über 8 (Sieg)'], ['max', 'Höchstens']] as const).map(([k, label]) => (
            <label key={k} className="field grow"><span>{label}</span>
              <input className="admin-input num" type="number" inputMode="numeric" min={0} value={draft.damage[k]} onChange={(e) => set({ damage: { ...draft.damage, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) } })} />
            </label>
          ))}
        </div>
        <small className="muted">Der Schaden wird nur auf dem Server aus dem nachgespielten Kampf berechnet. Ein nicht beendeter Kampf zählt nach der Frist als Niederlage.</small>
      </section>

      {draft.phases.map((p, i) => (
        <PhaseEdit key={i} phase={p} index={i} onChange={(np) => set({ phases: draft.phases.map((x, j) => (j === i ? np : x)) })}
          onRemove={i > 0 ? () => set({ phases: draft.phases.filter((_, j) => j !== i) }) : undefined} />
      ))}
      {draft.phases.length < 5 && (
        <button type="button" className="btn" onClick={() => set({ phases: [...draft.phases, { ...draft.phases[draft.phases.length - 1], name: `Phase ${draft.phases.length + 1}`, threshold: Math.max(1, (draft.phases[draft.phases.length - 1]?.threshold ?? 50) - 20) }] })}>＋ Phase</button>
      )}

      <section className="check-world">
        <h3>Persönliche Belohnungen (Gesamtschaden)</h3>
        {draft.milestones.map((m, i) => (
          <div key={i} className="field-row wrap raid-reward-row">
            <input className="admin-input num" type="number" inputMode="numeric" min={1} value={m.damage} aria-label="Schaden"
              onChange={(e) => set({ milestones: draft.milestones.map((x, j) => (j === i ? { ...x, damage: Math.max(1, Math.round(Number(e.target.value) || 1)) } : x)) })} />
            <RewardEdit value={m.reward} onChange={(reward) => set({ milestones: draft.milestones.map((x, j) => (j === i ? { ...x, reward } : x)) })} />
            <button type="button" className="btn btn-small" onClick={() => set({ milestones: draft.milestones.filter((_, j) => j !== i) })} aria-label="Entfernen">✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-small" onClick={() => set({ milestones: [...draft.milestones, { damage: (draft.milestones[draft.milestones.length - 1]?.damage ?? 0) + 1000, reward: { type: 'coins', amount: 100 } }] })}>＋ Meilenstein</button>
      </section>
      <section className="check-world">
        <h3>Gemeinschafts-Belohnungen (% LP abgezogen)</h3>
        {draft.globalRewards.map((g, i) => (
          <div key={i} className="field-row wrap raid-reward-row">
            <input className="admin-input num" type="number" inputMode="numeric" min={1} max={100} value={g.percent} aria-label="Prozent"
              onChange={(e) => set({ globalRewards: draft.globalRewards.map((x, j) => (j === i ? { ...x, percent: Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1))) } : x)) })} />
            <RewardEdit value={g.reward} onChange={(reward) => set({ globalRewards: draft.globalRewards.map((x, j) => (j === i ? { ...x, reward } : x)) })} />
            <button type="button" className="btn btn-small" onClick={() => set({ globalRewards: draft.globalRewards.filter((_, j) => j !== i) })} aria-label="Entfernen">✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-small" onClick={() => set({ globalRewards: [...draft.globalRewards, { percent: 100, reward: { type: 'coins', amount: 100 } }] })}>＋ Ziel</button>
        <label className="field"><span>Teilnahme: mindestens … abgeschlossene Kämpfe</span>
          <input className="admin-input num" type="number" inputMode="numeric" min={1} value={draft.minAttacksForGlobal} onChange={(e) => set({ minAttacksForGlobal: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
        </label>
        <small className="muted">Belohnungen nur Münzen, Booster oder Karten – nie exklusive Kampfstärke. Jede Belohnung gibt es pro Spieler und Raid genau einmal.</small>
      </section>

      <div className="field"><span>Sichtbarkeit</span>
        <div className="segmented">
          {(['draft', 'published'] as const).map((s) => (
            <button key={s} type="button" className={`seg ${draft.status === s ? 'active' : ''}`} aria-pressed={draft.status === s} onClick={() => set({ status: s })}>{s === 'draft' ? 'Entwurf (nur Admin)' : 'Veröffentlicht'}</button>
          ))}
        </div>
      </div>
      {problems.length > 0 && <ul className="problem-list">{problems.map((p) => <li key={p} className="field-error">⚠ {p}</li>)}</ul>}
      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? '…' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
      </div>

      <section className="check-world">
        <h3>Steuerung</h3>
        {!state ? (
          <ConfirmButton label="▶ Raid starten" ariaLabel="Raid starten" confirmLabel={`Starten? LP ${fmt(saved.maxHp)}`}
            onConfirm={() => (dirty ? onToast('Bitte erst speichern.') : admin('admin-publish', {}, 'Raid gestartet ✓ – Spieler sehen ihn ab dem Startzeitpunkt.'))} />
        ) : (
          <div className="row-buttons wrap">
            {state.config_version !== saved.version || state.max_hp !== saved.maxHp
              ? <ConfirmButton label="Änderungen übernehmen" ariaLabel="Änderungen übernehmen" confirmLabel="Neue Version übernehmen?" onConfirm={() => admin('admin-publish', {}, 'Neue Version übernommen ✓')} />
              : null}
            {state.status === 'active' && <ConfirmButton label="⏸ Pausieren" ariaLabel="Pausieren" confirmLabel="Pausieren?" onConfirm={() => admin('admin-status', { status: 'paused' }, 'Raid pausiert')} />}
            {state.status === 'paused' && <ConfirmButton label="▶ Fortsetzen" ariaLabel="Fortsetzen" confirmLabel="Fortsetzen?" onConfirm={() => admin('admin-status', { status: 'active' }, 'Raid läuft wieder')} />}
            {(state.status === 'active' || state.status === 'paused') && <ConfirmButton label="■ Beenden" ariaLabel="Beenden" confirmLabel="Raid wirklich beenden?" onConfirm={() => admin('admin-status', { status: 'ended' }, 'Raid beendet')} />}
            {state.status !== 'archived' && <ConfirmButton label="Archivieren" ariaLabel="Archivieren" confirmLabel="Archivieren (für Spieler unsichtbar)?" onConfirm={() => admin('admin-status', { status: 'archived' }, 'Raid archiviert')} />}
          </div>
        )}
        <small className="muted">Starten legt die Lebenspunkte an. Spieler sehen den Raid nur, wenn er veröffentlicht und gestartet ist. Bereits verdiente Belohnungen bleiben auch nach dem Ende abholbar.</small>
      </section>

      <RaidTestPanel config={draft} onTestFight={onTestFight} />
    </div>
  );
}

/** Test mode: nothing here is stored or paid – it only calculates with the raid as it is in the editor. */
function RaidTestPanel({ config, onTestFight }: { config: RaidConfig; onTestFight: (c: RaidConfig, phase: number) => void }) {
  const [hpPct, setHpPct] = useState(100);
  const [outcome, setOutcome] = useState<'win' | 'draw' | 'loss'>('win');
  const [fields, setFields] = useState(10);
  const [dmg, setDmg] = useState(3500);
  const [attacks, setAttacks] = useState(5);
  const [removed, setRemoved] = useState(50);
  const [sim, setSim] = useState<RaidSimulation | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const hp = Math.round((config.maxHp * hpPct) / 100);
  const phase = phaseIndex(config, hp);
  const owed = useMemo(() => raidOwed(config, { totalDamage: dmg, attacks }, Math.round(config.maxHp * (1 - removed / 100)), []), [config, dmg, attacks, removed]);
  const runSim = (n: number) => {
    setSimBusy(true);
    setTimeout(() => {
      setSim(simulateRaid(config, n, createRng(Date.now() % 100000), 8, aiRaidFight));
      setSimBusy(false);
    }, 30);
  };
  return (
    <section className="check-world raid-test">
      <h3>🧪 Testmodus</h3>
      <p className="small muted">Alles hier läuft nur auf diesem Gerät mit dem Stand im Editor: keine echten Angriffe, keine Rangliste, keine Belohnungen, keine Boss-LP.</p>

      <h4>Testkampf</h4>
      <div className="row-buttons wrap">
        {config.phases.map((p, i) => (
          <button key={i} type="button" className="btn btn-small" disabled={raidProblems(config).some((x) => x.startsWith(`Phase ${i + 1}`))} onClick={() => onTestFight(config, i)}>⚔️ Phase {i + 1}: {p.name}</button>
        ))}
      </div>

      <h4>Phasenwechsel</h4>
      <label className="field"><span>Boss-LP: {hpPct} % ({fmt(hp)} LP)</span>
        <input type="range" min={0} max={100} value={hpPct} onChange={(e) => setHpPct(Number(e.target.value))} />
      </label>
      <p className="small">→ Neue Kämpfe starten in <b>Phase {phase + 1}: {config.phases[phase]?.name}</b> ({LEVEL_LABEL[config.phases[phase]?.level ?? 'medium']}, {ARENAS.find((a) => a.id === config.phases[phase]?.arenaId)?.name ?? '?'})</p>

      <h4>Schaden berechnen</h4>
      <div className="field-row wrap">
        <select className="admin-input" value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="win">Sieg</option><option value="draw">Unentschieden</option><option value="loss">Niederlage</option>
        </select>
        <label className="field"><span>eigene Felder</span>
          <input className="admin-input num" type="number" min={0} max={16} value={fields} onChange={(e) => setFields(Math.max(0, Math.min(16, Number(e.target.value) || 0)))} />
        </label>
        <b className="raid-dmg">= {fmt(raidDamage(config.damage, outcome, fields))} Schaden</b>
      </div>

      <h4>Belohnungen prüfen</h4>
      <div className="field-row wrap">
        <label className="field"><span>Gesamtschaden</span><input className="admin-input num" type="number" min={0} value={dmg} onChange={(e) => setDmg(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field"><span>Kämpfe</span><input className="admin-input num" type="number" min={0} value={attacks} onChange={(e) => setAttacks(Math.max(0, Number(e.target.value) || 0))} /></label>
        <label className="field"><span>% LP abgezogen</span><input className="admin-input num" type="number" min={0} max={100} value={removed} onChange={(e) => setRemoved(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} /></label>
      </div>
      <ul className="plain-list small">{owed.length ? owed.map((o) => <li key={o.key}>🎁 {o.source}: {rewardText(o.reward)}</li>) : <li className="muted">Keine Belohnung fällig.</li>}</ul>

      <h4>Simulierte Teilnehmer</h4>
      <div className="row-buttons wrap">
        {[1, 10, 50, 100].map((n) => <button key={n} type="button" className="btn btn-small" disabled={simBusy} onClick={() => runSim(n)}>{n} {n === 1 ? 'Spieler' : 'Spieler'}</button>)}
      </div>
      {simBusy && <p className="small muted">Rechne Probekämpfe …</p>}
      {sim && !simBusy && (
        <div className="raid-sim small">
          <p><b>{sim.participants} Spieler</b>, jeder nutzt alle {config.dailyLimit} Angriffe pro Tag, {sim.days} Tage:</p>
          <p>{sim.defeatedOnDay ? `✓ Boss besiegt an Tag ${sim.defeatedOnDay}.` : `✗ Boss überlebt mit ${fmt(sim.hpByDay[sim.hpByDay.length - 1] ?? 0)} LP.`} Ø {fmt(sim.averageDamagePerPlayer)} Schaden pro Spieler.</p>
          <ul className="plain-list">
            {sim.phaseOdds.map((o, i) => (
              <li key={i}>Phase {i + 1}: Sieg {Math.round(o.win * 100)} % · Unentsch. {Math.round(o.draw * 100)} % · Ndl. {Math.round(o.loss * 100)} % · Ø {fmt(Math.round(o.avgDamage))} Schaden{sim.phaseStartDay[i] ? ` · erreicht an Tag ${sim.phaseStartDay[i]}` : ''}</li>
            ))}
          </ul>
          <p className="muted">LP nach Tagen: {sim.hpByDay.map((h) => fmt(h)).join(' → ')}</p>
          <p className="muted">Simulierte Spieler spielen wie die normale KI mit 8 zufälligen Karten. Nichts davon wird gespeichert oder in echten Ranglisten gezeigt.</p>
        </div>
      )}
    </section>
  );
}
