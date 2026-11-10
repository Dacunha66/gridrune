// Admin: Puzzle-Events – create and edit events (reward edition with its picture, fragments, grid, dates, tasks),
// preview the puzzle, publish / end / archive / repeat, numbers, and a test mode that runs only on this device
// (it changes no player data, cards, rewards or statistics).
import { useEffect, useState } from 'react';
import { Assets, Db, describeError } from '../game/cardStore';
import { CARDS, RARITY_LABEL, getCard, isCardId } from '../game/cards';
import { METRIC_TEXT } from '../game/quests';
import {
  EDITION_FRAMES, EditionDef, FRAME_LABEL, PERIOD_LABEL, PHASE_LABEL, PIECES_BY_RARITY, PUZZLE_METRICS, PuzzleDef, PuzzlePeriod, PuzzleTask, allEditions,
  findEdition, gridFor, nextEditionId, nextPuzzleId, puzzlePhase, puzzleProblems, setEditions, setPuzzles, taskTitle,
} from '../game/puzzles';
import { EventStats, EventView, fetchEventStats, loadEditions, loadPuzzles, saveEdition, savePuzzle } from '../game/puzzleApi';
import { editionImage } from '../game/editionArt';
import { ImageField, TextField } from './AdminCampaign';
import { EventDetail, PuzzleBoard, UnlockReveal } from './Events';

const DAY = 86400_000;
/** "2026-11-10T08:00" for <input type="datetime-local"> (local time). */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocal = (v: string) => (Number.isNaN(Date.parse(v)) ? null : new Date(v).toISOString());

function newPuzzle(id: string, editionId: string): PuzzleDef {
  const now = Date.now();
  return {
    id, name: 'Neues Puzzle-Event', description: '', image: null, reward: { type: 'edition', editionId }, pieces: 9, cols: 3, rows: 3, status: 'draft',
    run: { id: 'r1', startsAt: new Date(now + DAY).toISOString(), endsAt: new Date(now + 15 * DAY).toISOString() },
    tasks: [
      { id: 'tday', title: '', description: '', metric: 'wins', target: 2, fragments: 1, period: 'daily' },
      { id: 'tweek', title: '', description: '', metric: 'wins', target: 10, fragments: 2, period: 'weekly' },
      { id: 'tonce', title: '', description: '', metric: 'big_wins', target: 1, fragments: 1, period: 'once' },
    ],
  };
}

/** The event as a player would see it, with simulated pieces and task progress (test mode and preview). */
function simulated(p: PuzzleDef, e: EditionDef | null, have: number[], done: string[], gained: number[] = []): EventView {
  return {
    id: p.id, name: p.name, description: p.description, image: p.image, pieces: p.pieces, cols: p.cols, rows: p.rows, phase: 'active', run: p.run,
    reward: e ? { type: 'edition', editionId: e.id, cardId: e.cardId, name: e.name, image: e.image, frame: e.frame } : null,
    have, completedAt: have.length >= p.pieces ? new Date().toISOString() : null, gained,
    tasks: p.tasks.map((t) => ({ id: t.id, title: taskTitle(t), description: t.description, period: t.period, fragments: t.fragments,
      value: done.includes(t.id) ? t.target : 0, target: t.target, done: done.includes(t.id), claimed: done.includes(t.id) })),
  };
}

export function EventsAdminView({ db, assets, onToast }: { db: Db; assets: Assets | null; onToast: (m: string) => void }) {
  const [puzzles, setList] = useState<PuzzleDef[] | null>(null);
  const [editions, setEds] = useState<EditionDef[]>(allEditions());
  const [edit, setEdit] = useState<{ p: PuzzleDef; e: EditionDef } | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<'none' | 'some' | 'all'>('some');
  const [test, setTest] = useState<{ have: number[]; done: string[]; gained: number[] } | null>(null);
  const [anim, setAnim] = useState(false);
  const [stats, setStats] = useState<EventStats | null | 'loading'>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadPuzzles(db), loadEditions(db)]).then(([ps, es]) => {
      if (!alive) return;
      if (es) setEditions(es);
      setEds(allEditions());
      setList(ps ?? []);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  const dirty = edit ? JSON.stringify(edit) !== saved : false;
  const open = (p: PuzzleDef) => {
    const e = findEdition(p.reward.editionId) ?? { id: p.reward.editionId, cardId: CARDS[0].id, name: 'Edition', image: null, frame: 'none' as const };
    const x = { p, e };
    setEdit(x);
    setSaved(JSON.stringify(x));
    setTest(null);
    setStats(null);
  };
  const create = () => {
    const eid = nextEditionId(editions.map((e) => e.id));
    const p = newPuzzle(nextPuzzleId((puzzles ?? []).map((x) => x.id)), eid);
    const e: EditionDef = { id: eid, cardId: CARDS.find((c) => c.rarity === 'epic')?.id ?? CARDS[0].id, name: 'Neue Edition', image: null, frame: 'moon' };
    setEdit({ p, e });
    setSaved('');
    setTest(null);
  };

  async function save(next = edit) {
    if (!next) return false;
    setBusy(true);
    try {
      await saveEdition(db, next.e);
      await savePuzzle(db, next.p);
      const eds = [...editions.filter((x) => x.id !== next.e.id), next.e];
      setEditions(eds);
      setEds(allEditions());
      const list = [...(puzzles ?? []).filter((x) => x.id !== next.p.id), next.p];
      setList(list);
      setPuzzles(list);
      setEdit(next);
      setSaved(JSON.stringify(next));
      onToast('Event gespeichert ✓');
      return true;
    } catch (err) {
      onToast(describeError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!puzzles) return <p className="muted center">Events werden geladen …</p>;

  if (!edit) {
    return (
      <div className="scroll events-admin">
        <p className="muted small">
          Puzzle-Events: Spieler sammeln mit Aufgaben Fragmente eines Kartenbilds. Ist das Puzzle vollständig, bekommen sie die besondere Edition
          der Karte – gleiche Werte, eigene Illustration. Fortschritt bleibt erhalten, auch wenn ein Event später wiederholt wird.
        </p>
        <button type="button" className="btn btn-primary btn-wide" onClick={create}>+ Neues Puzzle-Event</button>
        <ul className="admin-list">
          {puzzles.map((p) => {
            const e = findEdition(p.reward.editionId);
            const phase = puzzlePhase(p);
            return (
              <li key={p.id}>
                <button type="button" className="admin-row" onClick={() => open(p)}>
                  <span className="admin-thumb"><PuzzleBoard picture={e ? editionImage(e) : undefined} cols={p.cols} rows={p.rows} pieces={p.pieces} have={[]} /></span>
                  <span className="admin-row-main">
                    <strong>{p.name}</strong>
                    <span className="admin-row-meta">{p.id} · {p.pieces} Fragmente · {new Date(p.run.startsAt).toLocaleDateString('de-DE')}–{new Date(p.run.endsAt).toLocaleDateString('de-DE')}</span>
                  </span>
                  <span className={`pill phase-${phase}`}>{PHASE_LABEL[phase]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {puzzles.length === 0 && <p className="muted center">Noch keine Events.</p>}
      </div>
    );
  }

  const { p, e } = edit;
  const setP = (patch: Partial<PuzzleDef>) => setEdit({ ...edit, p: { ...p, ...patch } });
  const setE = (patch: Partial<EditionDef>) => setEdit({ ...edit, e: { ...e, ...patch } });
  const setTask = (i: number, patch: Partial<PuzzleTask>) => setP({ tasks: p.tasks.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const phase = puzzlePhase(p);
  // Problems are checked against the edition being edited.
  const problems = puzzleProblems(p).filter((x) => !x.startsWith('Die Belohnungs-Edition') && !x.startsWith('Die Karte der Edition'));
  if (!isCardId(e.cardId)) problems.push('Die Karte der Edition gibt es nicht.');
  const picture = editionImage(e) ?? (isCardId(e.cardId) ? getCard(e.cardId).image : undefined);
  const previewHave = preview === 'none' ? [] : preview === 'all' ? Array.from({ length: p.pieces }, (_, i) => i) : Array.from({ length: Math.ceil(p.pieces / 2) }, (_, i) => i * 2 % p.pieces);
  const card = isCardId(e.cardId) ? getCard(e.cardId) : null;

  async function setStatus(patch: Partial<PuzzleDef>, text: string) {
    const next = { ...edit!, p: { ...p, ...patch } };
    if (await save(next)) onToast(text);
  }

  if (test) {
    const view = simulated(p, e, test.have, test.done, test.gained);
    const missing = Array.from({ length: p.pieces }, (_, i) => i).filter((i) => !test.have.includes(i));
    const give = (n: number) => {
      const add = missing.slice().sort(() => Math.random() - 0.5).slice(0, n);
      const have = [...test.have, ...add];
      setTest({ ...test, have, gained: add });
      if (have.length >= p.pieces && add.length) setAnim(true);
    };
    return (
      <div className="events-admin-test">
        <div className="test-bar">
          <b>TESTMODUS</b> · nur auf diesem Gerät, nichts wird gespeichert
          <div className="row-buttons">
            <button type="button" className="btn btn-small" onClick={() => give(1)} disabled={!missing.length}>+1 Fragment</button>
            <button type="button" className="btn btn-small" onClick={() => give(missing.length)} disabled={!missing.length}>Puzzle vollständig</button>
            <button type="button" className="btn btn-small" onClick={() => setAnim(true)}>Animation</button>
            <button type="button" className="btn btn-small" onClick={() => setTest({ have: [], done: [], gained: [] })}>Zurücksetzen</button>
            <button type="button" className="btn btn-small" onClick={() => setTest(null)}>Test beenden</button>
          </div>
          <div className="row-buttons">
            {p.tasks.map((t) => (
              <button key={t.id} type="button" className={`btn btn-small ${test.done.includes(t.id) ? 'active' : ''}`} onClick={() => {
                if (test.done.includes(t.id)) return setTest({ ...test, done: test.done.filter((x) => x !== t.id) });
                const add = missing.slice(0, t.fragments);
                const have = [...test.have, ...add];
                setTest({ have, done: [...test.done, t.id], gained: add });
                if (have.length >= p.pieces && add.length) setAnim(true);
              }}>✓ {taskTitle(t)}</button>
            ))}
          </div>
        </div>
        {anim && <UnlockReveal ev={view} reducedMotion={false} onCard={() => setAnim(false)} onCollection={() => setAnim(false)} onClose={() => setAnim(false)} />}
        <EventDetail key={test.have.join(',')} ev={{ ...view, gained: anim ? [] : view.gained, completedAt: anim ? null : view.completedAt }} reducedMotion={false} test
          onBack={() => setTest(null)} onCard={() => undefined} onCollection={() => undefined} />
      </div>
    );
  }

  return (
    <div className="scroll events-admin">
      <div className="row-buttons">
        <button type="button" className="btn btn-small" onClick={() => (dirty && !confirm('Ungespeicherte Änderungen verwerfen?') ? undefined : setEdit(null))}>‹ Alle Events</button>
        <span className={`pill phase-${phase}`}>{PHASE_LABEL[phase]}</span>
        <span className="muted small">{p.id} · Runde {p.run.id}</span>
      </div>

      <section className="admin-card">
        <h3>Event</h3>
        <TextField label="Eventname" value={p.name} max={40} onChange={(name) => setP({ name })} />
        <TextField label="Beschreibung" value={p.description} max={300} multiline onChange={(description) => setP({ description })} />
        <ImageField kind="eventArt" value={p.image} onChange={(image) => setP({ image })} assets={assets} onToast={onToast} />
        <div className="field-row">
          <label className="field"><span>Start</span>
            <input className="admin-input" type="datetime-local" value={toLocal(p.run.startsAt)} onChange={(ev) => { const v = fromLocal(ev.target.value); if (v) setP({ run: { ...p.run, startsAt: v } }); }} />
          </label>
          <label className="field"><span>Ende</span>
            <input className="admin-input" type="datetime-local" value={toLocal(p.run.endsAt)} onChange={(ev) => { const v = fromLocal(ev.target.value); if (v) setP({ run: { ...p.run, endsAt: v } }); }} />
          </label>
        </div>
      </section>

      <section className="admin-card">
        <h3>Belohnung: besondere Kartenedition</h3>
        <p className="muted small">Eventtyp „Kartenedition“: eine vorhandene Karte mit eigener Illustration und eigenem Rahmen. Werte, Klasse und Fähigkeit
          bleiben genau wie bei der Karte – kein spielerischer Vorteil. (Neue exklusive Karten folgen in einer späteren Version.)</p>
        <label className="field"><span>Karte</span>
          <select className="admin-input" value={e.cardId} onChange={(ev) => {
            const c = getCard(ev.target.value);
            const pieces = PIECES_BY_RARITY[c.rarity];
            setEdit({ p: { ...p, pieces, ...gridFor(pieces) }, e: { ...e, cardId: c.id } });
          }}>
            {[...CARDS].sort((a, b) => a.name.localeCompare(b.name, 'de')).map((c) => <option key={c.id} value={c.id}>{c.name} ({RARITY_LABEL[c.rarity]})</option>)}
          </select>
        </label>
        <TextField label="Editionsname (z. B. Mondfinsternis)" value={e.name} max={40} onChange={(name) => setE({ name })} />
        <label className="field"><span>Rahmen</span>
          <select className="admin-input" value={e.frame} onChange={(ev) => setE({ frame: ev.target.value as EditionDef['frame'] })}>
            {EDITION_FRAMES.map((f) => <option key={f} value={f}>{FRAME_LABEL[f]}</option>)}
          </select>
        </label>
        <ImageField kind="editionArt" value={e.image} onChange={(image) => setE({ image })} assets={assets} onToast={onToast} />
        {!e.image && editionImage(e) && <p className="muted small">Ohne Upload wird die eingebaute Illustration dieser Edition gezeigt.</p>}
        {card && <p className="muted small">{card.name}: ↑{card.top} →{card.right} ↓{card.bottom} ←{card.left} · {RARITY_LABEL[card.rarity]} – vorgeschlagen {PIECES_BY_RARITY[card.rarity]} Fragmente.</p>}
      </section>

      <section className="admin-card">
        <h3>Puzzle</h3>
        <div className="field-row">
          <label className="field"><span>Fragmente</span>
            <select className="admin-input" value={p.pieces} onChange={(ev) => { const n = Number(ev.target.value); setP({ pieces: n, ...gridFor(n) }); }}>
              {[4, 6, 9, 12, 16, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="field"><span>Spalten</span>
            <input className="admin-input num" type="number" min={1} max={6} value={p.cols} onChange={(ev) => setP({ cols: Math.min(6, Math.max(1, Number(ev.target.value) || 1)) })} />
          </label>
          <label className="field"><span>Reihen</span>
            <input className="admin-input num" type="number" min={1} max={6} value={p.rows} onChange={(ev) => setP({ rows: Math.min(6, Math.max(1, Number(ev.target.value) || 1)) })} />
          </label>
        </div>
        <div className="segmented" role="group" aria-label="Vorschau">
          {(['none', 'some', 'all'] as const).map((k) => (
            <button key={k} type="button" className={`seg ${preview === k ? 'active' : ''}`} onClick={() => setPreview(k)}>{k === 'none' ? '0 Teile' : k === 'some' ? 'Teilweise' : 'Vollständig'}</button>
          ))}
        </div>
        <div className="events-admin-preview"><PuzzleBoard picture={picture} cols={p.cols} rows={p.rows} pieces={p.pieces} have={previewHave} big /></div>
      </section>

      <section className="admin-card">
        <h3>Aufgaben</h3>
        <p className="muted small">Gezählt werden nur vom Server geprüfte Ergebnisse, und nur während das Event läuft. Täglich/Wöchentlich: einmal pro Tag/Woche,
          Einmalig: einmal pro Eventrunde.</p>
        {p.tasks.map((t, i) => (
          <div key={t.id} className="event-task-edit">
            <div className="field-row">
              <label className="field grow"><span>Aufgabe</span>
                <select className="admin-input" value={t.metric} onChange={(ev) => setTask(i, { metric: ev.target.value as PuzzleTask['metric'] })}>
                  {PUZZLE_METRICS.map((m) => <option key={m} value={m}>{METRIC_TEXT[m](2).replace(/\b2\b/, 'X')}</option>)}
                </select>
              </label>
              <label className="field"><span>Ziel</span>
                <input className="admin-input num" type="number" min={1} value={t.target} onChange={(ev) => setTask(i, { target: Math.max(1, Math.round(Number(ev.target.value) || 1)) })} />
              </label>
            </div>
            <div className="field-row">
              <label className="field"><span>Art</span>
                <select className="admin-input" value={t.period} onChange={(ev) => setTask(i, { period: ev.target.value as PuzzlePeriod })}>
                  {(['daily', 'weekly', 'once'] as const).map((k) => <option key={k} value={k}>{PERIOD_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="field"><span>Fragmente</span>
                <input className="admin-input num" type="number" min={1} max={10} value={t.fragments} onChange={(ev) => setTask(i, { fragments: Math.min(10, Math.max(1, Math.round(Number(ev.target.value) || 1))) })} />
              </label>
              <button type="button" className="btn btn-small btn-danger" onClick={() => setP({ tasks: p.tasks.filter((_, k) => k !== i) })} aria-label="Aufgabe löschen">✕</button>
            </div>
            <TextField label={`Titel (leer = „${METRIC_TEXT[t.metric](t.target)}“)`} value={t.title} max={60} onChange={(title) => setTask(i, { title })} />
          </div>
        ))}
        <button type="button" className="btn btn-small" disabled={p.tasks.length >= 12} onClick={() => {
          let n = p.tasks.length + 1;
          while (p.tasks.some((t) => t.id === `t${n}`)) n++;
          setP({ tasks: [...p.tasks, { id: `t${n}`, title: '', description: '', metric: 'games', target: 3, fragments: 1, period: 'daily' }] });
        }}>+ Aufgabe</button>
      </section>

      {problems.length > 0 && <ul className="admin-warning">{problems.map((x) => <li key={x}>{x}</li>)}</ul>}

      <section className="admin-card">
        <h3>Testen und veröffentlichen</h3>
        <div className="row-buttons">
          <button type="button" className="btn" onClick={() => setTest({ have: [], done: [], gained: [] })}>▶ Testmodus</button>
          <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => save()}>{busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
        </div>
        <div className="row-buttons">
          {p.status !== 'published' && (
            <button type="button" className="btn" disabled={busy || problems.length > 0} onClick={() => setStatus({ status: 'published' }, Date.parse(p.run.startsAt) > Date.now() ? 'Veröffentlicht – sichtbar ab dem Start' : 'Veröffentlicht – das Event läuft')}>Veröffentlichen</button>
          )}
          {p.status === 'published' && phase !== 'ended' && (
            <button type="button" className="btn" disabled={busy} onClick={() => confirm('Event jetzt beenden? Der Fortschritt der Spieler bleibt.') && setStatus({ run: { ...p.run, endsAt: new Date().toISOString() } }, 'Event beendet')}>Event beenden</button>
          )}
          {p.status === 'published' && (
            <button type="button" className="btn" disabled={busy} onClick={() => setStatus({ status: 'draft' }, 'Zurück zum Entwurf – für Spieler unsichtbar')}>Als Entwurf</button>
          )}
          {p.status !== 'archived' && (
            <button type="button" className="btn" disabled={busy} onClick={() => setStatus({ status: 'archived' }, 'Archiviert')}>Archivieren</button>
          )}
          {(phase === 'ended' || phase === 'archived') && (
            <button type="button" className="btn" disabled={busy} onClick={() => {
              const n = Number(p.run.id.slice(1)) + 1;
              setP({ status: 'draft', run: { id: `r${n}`, startsAt: new Date(Date.now() + DAY).toISOString(), endsAt: new Date(Date.now() + 15 * DAY).toISOString() } });
              onToast('Neue Runde angelegt – Daten prüfen, speichern, veröffentlichen. Gesammelte Teile der Spieler bleiben.');
            }}>Event wiederholen</button>
          )}
        </div>
        <p className="muted small">Ein Event ist nie vor seinem Start sichtbar. Beendete Events landen im Archiv der Spieler; ihre Fragmente bleiben.</p>
      </section>

      <section className="admin-card">
        <h3>Statistik <small className="muted">Runde {p.run.id}</small></h3>
        {stats === null && <button type="button" className="btn btn-small" onClick={() => { setStats('loading'); fetchEventStats(p.id, p.run.id).then(setStats); }}>Laden</button>}
        {stats === 'loading' && <p className="muted small">Wird geladen …</p>}
        {stats && stats !== 'loading' && (
          <ul className="plain-list small">
            <li>Teilnehmende Spieler: <b>{stats.participants}</b></li>
            <li>Ø gesammelte Fragmente: <b>{stats.averagePieces}</b> von {p.pieces}</li>
            <li>Vollständige Puzzles / freigeschaltete Editionen: <b>{stats.completed}</b></li>
            {p.tasks.map((t) => (
              <li key={t.id}>{taskTitle(t)}: <b>{stats.claimsByTask[t.id] ?? 0}×</b> erledigt{stats.participants ? ` (${Math.round(((stats.claimsByTask[t.id] ?? 0) / stats.participants) * 100)} % der Teilnehmer, Mehrfach-Abschlüsse mitgezählt)` : ''}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
