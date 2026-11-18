// Admin: arena templates (16 cells with terrain). Built-in arenas can be changed or switched off;
// a saved arena with the same id replaces the built-in one, "Standard wiederherstellen" removes it again.
import { PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmButton } from '../components/ConfirmButton';
import {
  ARENAS_COLLECTION, ARENA_LIST_DOC, ARENA_NAME_MAX, ARENA_STATUSES, Arena, ArenaList, ArenaShape, ArenaStatus, BUILTIN_ARENAS, SHAPE_LABEL, arenaShape, emptyCells,
  moveId, nextArenaId, orderedArenas, parseArena, parseArenaList, rankedProblems, setArenas,
} from '../game/arenas';
import { BUILTIN_MISSIONS, MISSIONS_COLLECTION, Mission, parseMission } from '../game/campaign';
import { RAIDS_COLLECTION, parseRaid } from '../game/raid';
import { boardHoles } from '../game/battle';
import { Db, SETTINGS_COLLECTION, deleteArena, describeError, saveArena } from '../game/cardStore';
import { TERRAINS, TERRAIN_INFO, Terrain } from '../game/effects';

const STATUS_LABEL: Record<ArenaStatus, string> = { draft: 'Entwurf', active: 'Aktiv', campaign: 'Nur Kampagne', disabled: 'Deaktiviert' };

/** Order of the arena list and removed built-in arenas (settings/arena_list), live. */
export function useArenaList(db: Db | null): ArenaList {
  const [list, setList] = useState<ArenaList>({ order: [], hidden: [] });
  useEffect(() => {
    if (!db) return;
    return db.collection(SETTINGS_COLLECTION).onSnapshot((snap) => {
      const d = snap.docs.find((x) => x.id === ARENA_LIST_DOC);
      setList(parseArenaList(d?.exists ? d.data() : null));
    });
  }, [db]);
  return list;
}

/** Where each arena is used: campaign missions (also drafts) and raid phases. */
function useArenaUsage(db: Db): Map<string, string[]> {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [raids, setRaids] = useState<{ name: string; arenas: string[] }[]>([]);
  useEffect(() => db.collection(MISSIONS_COLLECTION).onSnapshot((snap) => {
    setMissions(snap.docs.flatMap((d) => {
      const m = d.exists ? parseMission(d.id, d.data()) : null;
      return m ? [m] : [];
    }));
  }), [db]);
  useEffect(() => db.collection(RAIDS_COLLECTION).onSnapshot((snap) => {
    setRaids(snap.docs.flatMap((d) => {
      const r = d.exists ? parseRaid(d.id, d.data()) : null;
      return r ? [{ name: r.name, arenas: r.phases.map((p) => p.arenaId) }] : [];
    }));
  }), [db]);
  return useMemo(() => {
    const byId = new Map<string, Mission>(BUILTIN_MISSIONS.map((m) => [m.id, m]));
    for (const m of missions) byId.set(m.id, m);
    const use = new Map<string, string[]>();
    const add = (id: string, what: string) => use.set(id, [...(use.get(id) ?? []), what]);
    for (const m of byId.values()) if (m.status !== 'disabled') add(m.arenaId, `Mission „${m.name}“`);
    for (const r of raids) for (const id of new Set(r.arenas)) add(id, `Raid „${r.name}“`);
    return use;
  }, [missions, raids]);
}

/** Why an arena cannot be deleted right now (null = it can). */
function deleteBlock(a: Arena, usedIn: string[]): string | null {
  if (usedIn.length) return `Wird verwendet: ${usedIn.slice(0, 3).join(', ')}${usedIn.length > 3 ? ` und ${usedIn.length - 3} weitere` : ''}.`;
  if (a.status === 'active') return 'Ist im Spiel aktiv – erst auf „Deaktiviert“ stellen.';
  return null;
}

export function ArenaView({ db, onToast }: { db: Db; onToast: (m: string) => void }) {
  const [saved, setSaved] = useState<Arena[] | null>(null);
  const [editing, setEditing] = useState<Arena | null>(null);
  const view = useArenaList(db);
  const usage = useArenaUsage(db);
  /** Order while a row is being dragged (shown at once, saved when the finger is lifted). */
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [showHidden, setShowHidden] = useState(false);

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
    return [...byId.values()];
  }, [saved]);
  const shown = useMemo(() => orderedArenas(all, view), [all, view]);
  const order = dragOrder ?? shown.map((a) => a.id);
  const byId = useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const hiddenList = all.filter((a) => view.hidden.includes(a.id));

  async function saveView(next: ArenaList) {
    try {
      await db.collection(SETTINGS_COLLECTION).doc(ARENA_LIST_DOC).set({ order: next.order, hidden: next.hidden, updatedAt: new Date().toISOString() });
    } catch (e) {
      onToast(describeError(e));
    }
  }

  // ---------- Drag and drop with the handle (finger or mouse) ----------
  function startDrag(e: ReactPointerEvent<HTMLSpanElement>, id: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragId(id);
    setDragOrder(shown.map((a) => a.id));
  }
  function moveDrag(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!dragId || !dragOrder || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('li[data-id]')];
    const from = dragOrder.indexOf(dragId);
    // The row under the finger (above the first row = first place, below the last = last place).
    let to = from;
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) to = i;
    });
    if (rows.length && e.clientY < rows[0].getBoundingClientRect().top) to = 0;
    if (rows.length && e.clientY > rows[rows.length - 1].getBoundingClientRect().bottom) to = rows.length - 1;
    if (to !== from) setDragOrder(moveId(dragOrder, from, to));
    // Scroll the list along near the top or bottom edge.
    const scroller = listRef.current.closest('.scroll') as HTMLElement | null;
    if (scroller) {
      const b = scroller.getBoundingClientRect();
      if (e.clientY < b.top + 40) scroller.scrollTop -= 12;
      else if (e.clientY > b.bottom - 40) scroller.scrollTop += 12;
    }
  }
  function endDrag() {
    if (dragOrder && dragOrder.join() !== shown.map((a) => a.id).join()) {
      void saveView({ order: dragOrder, hidden: view.hidden }).then(() => onToast('Reihenfolge gespeichert ✓'));
    }
    setDragId(null);
    // Keep the new order on screen until the saved list arrives.
    setTimeout(() => setDragOrder(null), 1500);
  }

  async function remove(a: Arena) {
    const builtin = BUILTIN_ARENAS.some((b) => b.id === a.id);
    try {
      if (builtin) {
        // Built-in arenas live in the game code: they are only taken out of every list (and stay off in the game).
        if (saved?.some((x) => x.id === a.id) && a.status !== 'disabled') await saveArena(db, { ...a, status: 'disabled', updatedAt: new Date().toISOString() });
        await saveView({ order: view.order.filter((id) => id !== a.id), hidden: [...view.hidden, a.id] });
      } else {
        await deleteArena(db, a.id);
        await saveView({ order: view.order.filter((id) => id !== a.id), hidden: view.hidden });
      }
      onToast(`„${a.name}“ gelöscht`);
    } catch (e) {
      onToast(describeError(e));
    }
  }

  if (!saved) return <p className="muted center">Arenen werden geladen …</p>;
  if (editing) {
    return (
      <ArenaEditor
        key={editing.id}
        db={db}
        initial={editing}
        isBuiltin={BUILTIN_ARENAS.some((a) => a.id === editing.id)}
        isSaved={saved.some((a) => a.id === editing.id)}
        usedIn={usage.get(editing.id) ?? []}
        onToast={onToast}
        onClose={() => setEditing(null)}
      />
    );
  }

  const newArena = (): Arena => ({
    id: nextArenaId(all.map((a) => a.id)), name: '', cells: emptyCells('square'), status: 'draft', ranked: false, updatedAt: '',
  });
  return (
    <div className="scroll">
      <div className="admin-toolbar">
        <p className="muted arena-intro">Abenteuer-Duelle nutzen eine zufällige aktive Arena. In der Liga bekommen beide Spieler dieselbe Arena (nur „Rangliste ✓“). Sortieren: am Griff ⠿ ziehen.</p>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(newArena())}>＋ Neue Arena</button>
      </div>
      <ul className="admin-list arena-sort-list" ref={listRef}>
        {order.map((id) => {
          const a = byId.get(id);
          if (!a) return null;
          const usedIn = usage.get(a.id) ?? [];
          const block = deleteBlock(a, usedIn);
          return (
            <li key={a.id} data-id={a.id} className={`arena-sort-row ${dragId === a.id ? 'dragging' : ''}`}>
              <span className="drag-handle" role="button" tabIndex={-1} aria-label={`${a.name} verschieben`}
                onPointerDown={(e) => startDrag(e, a.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>⠿</span>
              <button type="button" className="admin-row" onClick={() => setEditing({ ...a, cells: [...a.cells] })}>
                <span className="arena-thumb" aria-hidden="true">
                  {a.cells.map((t, i) => <span key={i} className={`mini-cell terrain-${t} ${boardHoles(a.cells.length).includes(i) ? 'hole' : ''}`} />)}
                </span>
                <span className="admin-row-main">
                  <strong>{a.name}</strong>
                  <span className="admin-row-meta">
                    <span className="mono">{a.id}</span>
                    {[...new Set(a.cells)].filter((t) => t !== 'normal').map((t) => ` · ${TERRAIN_INFO[t].icon} ${a.cells.filter((c) => c === t).length}`)}
                    {a.ranked ? ' · Rangliste ✓' : ''}
                    {usedIn.length > 0 ? ` · in ${usedIn.length} ${usedIn.length === 1 ? 'Mission/Raid' : 'Missionen/Raids'}` : ' · unbenutzt'}
                  </span>
                </span>
                <span className={`status-pill status-${a.status}`}>{STATUS_LABEL[a.status]}</span>
              </button>
              {block
                ? <button type="button" className="btn btn-small arena-del is-off" aria-disabled="true" title={block} aria-label={`${a.name} kann nicht gelöscht werden: ${block}`} onClick={() => onToast(block)}>🗑</button>
                : <ConfirmButton label="🗑" ariaLabel={`${a.name} löschen`} confirmLabel="Löschen?" onConfirm={() => void remove(a)} />}
            </li>
          );
        })}
      </ul>
      <p className="muted small">🗑 geht bei Arenen, die in keiner Mission und keinem Raid stecken und im Spiel nicht aktiv sind. Tippe auf ein ausgegrautes 🗑, um zu sehen, warum nicht.</p>
      {hiddenList.length > 0 && (
        <div className="field">
          <button type="button" className="btn btn-small" onClick={() => setShowHidden((v) => !v)}>{showHidden ? '▾' : '▸'} Gelöschte Standard-Arenen ({hiddenList.length})</button>
          {showHidden && (
            <ul className="admin-list">
              {hiddenList.map((a) => (
                <li key={a.id} className="arena-sort-row">
                  <span className="admin-row"><span className="admin-row-main"><strong>{a.name}</strong><span className="admin-row-meta mono">{a.id}</span></span></span>
                  <button type="button" className="btn btn-small" onClick={() => void saveView({ order: view.order, hidden: view.hidden.filter((x) => x !== a.id) }).then(() => onToast(`„${a.name}“ wiederhergestellt ✓`))}>Zurückholen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ArenaEditor({ db, initial, isBuiltin, isSaved, usedIn, onToast, onClose }: {
  db: Db;
  initial: Arena;
  isBuiltin: boolean;
  isSaved: boolean;
  usedIn: string[];
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
        <span>Form des Spielfelds</span>
        <div className="segmented" role="radiogroup" aria-label="Form">
          {(['square', 'kristall'] as ArenaShape[]).map((sh) => (
            <button key={sh} type="button" role="radio" aria-checked={arenaShape(draft.cells) === sh} className={`seg ${arenaShape(draft.cells) === sh ? 'active' : ''}`}
              onClick={() => arenaShape(draft.cells) !== sh && setDraft({ ...draft, cells: emptyCells(sh) })}>
              {SHAPE_LABEL[sh]}
            </button>
          ))}
        </div>
        <small className="muted">Beide Formen haben 16 Felder. Beim Wechsel der Form wird das Gelände zurückgesetzt.</small>
      </div>

      <div className="field">
        <span>Gelände malen: wählen, dann Felder antippen (nochmal tippen = normal)</span>
        <div className="segmented" role="radiogroup" aria-label="Gelände">
          {TERRAINS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={brush === t} className={`seg ${brush === t ? 'active' : ''}`} onClick={() => setBrush(t)}>
              {TERRAIN_INFO[t].icon || '⬜'} {TERRAIN_INFO[t].label}
            </button>
          ))}
        </div>
        <div className="arena-grid" role="grid" aria-label={arenaShape(draft.cells) === 'kristall' ? 'Kristall-Arena' : 'Arena 4 mal 4'}>
          {draft.cells.map((t, i) => boardHoles(draft.cells.length).includes(i) ? <span key={i} className="cell hole" aria-hidden="true" /> : (
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

      {usedIn.length > 0 && <p className="muted small">Verwendet in: {usedIn.join(', ')}.</p>}
      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={!nameOk || !hasNormal || busy} onClick={save}>Speichern</button>
        {isSaved && !(!isBuiltin && deleteBlock(draft, usedIn)) && (
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
