// Admin: arena templates (16 cells with terrain). Built-in arenas can be changed or switched off;
// a saved arena with the same id replaces the built-in one, "Standard wiederherstellen" removes it again.
import { useEffect, useMemo, useState } from 'react';
import { ConfirmButton } from '../components/ConfirmButton';
import {
  ARENAS_COLLECTION, ARENA_NAME_MAX, ARENA_STATUSES, Arena, ArenaStatus, BUILTIN_ARENAS, nextArenaId, parseArena, rankedProblems, setArenas,
} from '../game/arenas';
import { CELL_COUNT } from '../game/battle';
import { Db, deleteArena, describeError, saveArena } from '../game/cardStore';
import { TERRAINS, TERRAIN_INFO, Terrain } from '../game/effects';

const STATUS_LABEL: Record<ArenaStatus, string> = { draft: 'Entwurf', active: 'Aktiv', campaign: 'Nur Kampagne', disabled: 'Deaktiviert' };

export function ArenaView({ db, onToast }: { db: Db; onToast: (m: string) => void }) {
  const [saved, setSaved] = useState<Arena[] | null>(null);
  const [editing, setEditing] = useState<Arena | null>(null);

  useEffect(
    () =>
      db.collection(ARENAS_COLLECTION).onSnapshot(
        (snap) => {
          const list = snap.docs.flatMap((d) => {
            const a = d.exists ? parseArena(d.id, d.data()) : null;
            return a ? [a] : [];
          });
          setSaved(list);
          setArenas(list); // the next duel uses the change right away
        },
        (e) => onToast(describeError(e)),
      ),
    [db, onToast],
  );

  const all = useMemo(() => {
    const byId = new Map<string, Arena>(BUILTIN_ARENAS.map((a) => [a.id, a]));
    for (const a of saved ?? []) byId.set(a.id, a);
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [saved]);

  if (!saved) return <p className="muted center">Arenen werden geladen …</p>;
  if (editing) {
    return (
      <ArenaEditor
        key={editing.id}
        db={db}
        initial={editing}
        isBuiltin={BUILTIN_ARENAS.some((a) => a.id === editing.id)}
        isSaved={saved.some((a) => a.id === editing.id)}
        onToast={onToast}
        onClose={() => setEditing(null)}
      />
    );
  }

  const newArena = (): Arena => ({
    id: nextArenaId(all.map((a) => a.id)), name: '', cells: Array<Terrain>(CELL_COUNT).fill('normal'), status: 'draft', ranked: false, updatedAt: '',
  });
  return (
    <div className="scroll">
      <div className="admin-toolbar">
        <p className="muted arena-intro">Abenteuer-Duelle nutzen eine zufällige aktive Arena. In der Liga bekommen beide Spieler dieselbe Arena (nur „Rangliste ✓“).</p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(newArena())}>＋ Neue Arena</button>
      </div>
      <ul className="admin-list">
        {all.map((a) => (
          <li key={a.id}>
            <button type="button" className="admin-row" onClick={() => setEditing({ ...a, cells: [...a.cells] })}>
              <span className="arena-thumb" aria-hidden="true">
                {a.cells.map((t, i) => <span key={i} className={`mini-cell terrain-${t}`} />)}
              </span>
              <span className="admin-row-main">
                <strong>{a.name}</strong>
                <span className="admin-row-meta">
                  <span className="mono">{a.id}</span>
                  {[...new Set(a.cells)].filter((t) => t !== 'normal').map((t) => ` · ${TERRAIN_INFO[t].icon} ${a.cells.filter((c) => c === t).length}`)}
                  {a.ranked ? ' · Rangliste ✓' : ''}
                </span>
              </span>
              <span className={`status-pill status-${a.status}`}>{STATUS_LABEL[a.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArenaEditor({ db, initial, isBuiltin, isSaved, onToast, onClose }: {
  db: Db;
  initial: Arena;
  isBuiltin: boolean;
  isSaved: boolean;
  onToast: (m: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Arena>(initial);
  const [brush, setBrush] = useState<Terrain>('wald');
  const [busy, setBusy] = useState(false);
  const problems = rankedProblems(draft.cells);
  const hasNormal = draft.cells.includes('normal');
  const nameOk = draft.name.trim().length > 0;

  function paint(i: number) {
    setDraft((d) => {
      const cells = [...d.cells];
      cells[i] = cells[i] === brush ? 'normal' : brush;
      const ranked = d.ranked && rankedProblems(cells).length === 0;
      return { ...d, cells, ranked };
    });
  }

  async function save() {
    if (!nameOk || !hasNormal || busy) return;
    setBusy(true);
    try {
      await saveArena(db, { ...draft, name: draft.name.trim().slice(0, ARENA_NAME_MAX), ranked: draft.ranked && problems.length === 0, updatedAt: new Date().toISOString() });
      onToast('Arena gespeichert ✓');
      onClose();
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteArena(db, draft.id);
      onToast(isBuiltin ? 'Standard wiederhergestellt ✓' : 'Arena gelöscht');
      onClose();
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="scroll arena-editor">
      <div className="arena-editor-head">
        <button type="button" className="btn btn-small" onClick={onClose}>◀ Arenen</button>
        <span className="pill mono">{draft.id}</span>
      </div>
      <label className="field">
        <span>Name *</span>
        <input id="arena-name" className="admin-input" value={draft.name} maxLength={ARENA_NAME_MAX} placeholder="z. B. Glutschlucht" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>

      <div className="field">
        <span>Gelände malen: wählen, dann Felder antippen (nochmal tippen = normal)</span>
        <div className="segmented" role="radiogroup" aria-label="Gelände">
          {TERRAINS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={brush === t} className={`seg ${brush === t ? 'active' : ''}`} onClick={() => setBrush(t)}>
              {TERRAIN_INFO[t].icon || '⬜'} {TERRAIN_INFO[t].label}
            </button>
          ))}
        </div>
        <div className="arena-grid" role="grid" aria-label="Arena 4 mal 4">
          {draft.cells.map((t, i) => (
            <button key={i} type="button" role="gridcell" className={`cell terrain-${t}`} aria-label={`Feld ${Math.floor(i / 4) + 1}-${(i % 4) + 1}: ${TERRAIN_INFO[t].label}`} onClick={() => paint(i)}>
              <span className="terrain-icon" aria-hidden="true">{TERRAIN_INFO[t].icon}</span>
            </button>
          ))}
        </div>
        {!hasNormal && <small className="field-error">Mindestens ein normales Feld wird gebraucht (dort kann der Fels liegen).</small>}
      </div>

      <div className="field">
        <span>Status</span>
        <div className="segmented" role="radiogroup" aria-label="Status">
          {ARENA_STATUSES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={draft.status === s} className={`seg status-seg-${s} ${draft.status === s ? 'active' : ''}`} onClick={() => setDraft({ ...draft, status: s })}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>Rangliste (Liga)</span>
        <label className="toggle toggle-left">
          <input id="arena-ranked" type="checkbox" checked={draft.ranked} disabled={problems.length > 0} onChange={(e) => setDraft({ ...draft, ranked: e.target.checked })} />
          <span>In Ranglisten-Matches verwenden</span>
        </label>
        {problems.length > 0 ? (
          <ul className="league-errors">{problems.map((p) => <li key={p} className="field-warn">{p}</li>)}</ul>
        ) : (
          <small className="muted">✓ Fair: spiegelgleich, kein Gelände nur einmal, höchstens 8 Geländefelder. Der Fels liegt nur auf normalen Feldern.</small>
        )}
      </div>

      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={!nameOk || !hasNormal || busy} onClick={save}>Speichern</button>
        {isSaved && (
          <ConfirmButton
            label={isBuiltin ? '↺ Standard wiederherstellen' : '🗑 Löschen'}
            ariaLabel={isBuiltin ? 'Standard wiederherstellen' : 'Arena löschen'}
            confirmLabel="Wirklich?"
            onConfirm={remove}
          />
        )}
      </div>
    </div>
  );
}
