// Admin: Fehlersammlung – errors reported from the players' games (newest first). "Erledigt" removes one entry,
// "Alle löschen" empties the list. Only the admin can read or delete (database rules); entries older than 30 days go.
import { useEffect, useState } from 'react';
import { webBackend } from '../game/cardStore';

interface ErrorRow {
  id: number;
  created_at: string;
  last_at: string;
  kind: string;
  message: string;
  stack: string;
  place: string;
  version: string;
  device: string;
  count: number;
  player_id: string | null;
}

const KIND_LABEL: Record<string, string> = { crash: 'Absturz', error: 'Fehler', promise: 'Fehler (im Hintergrund)' };
const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function ErrorsAdminView({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<ErrorRow[] | null | 'offline'>(null);
  const [open, setOpen] = useState<number | null>(null);

  async function load() {
    const sb = (await webBackend())?.supabase();
    if (!sb) return setRows('offline');
    const { data, error } = await sb.from('client_errors').select('*').order('last_at', { ascending: false }).limit(200);
    setRows(error ? 'offline' : (data as ErrorRow[]));
  }
  useEffect(() => {
    void load();
  }, []);

  async function remove(ids: number[] | 'all') {
    const sb = (await webBackend())?.supabase();
    if (!sb) return;
    const q = sb.from('client_errors').delete();
    const { error } = ids === 'all' ? await q.gt('id', 0) : await q.in('id', ids);
    if (error) return onToast('Löschen hat nicht geklappt.');
    onToast(ids === 'all' ? 'Alle Fehler gelöscht ✓' : 'Erledigt ✓');
    void load();
  }

  if (rows === null) return <p className="muted center">Lädt …</p>;
  if (rows === 'offline') return <p className="hint center">Die Fehlerliste konnte nicht geladen werden.</p>;
  const total = rows.reduce((n, r) => n + r.count, 0);
  return (
    <div className="scroll admin-errors">
      <section className="admin-card">
        <h3>Fehler aus dem Spiel</h3>
        <p className="muted small">Hier landen Abstürze und Fehler, die bei Spielern passiert sind – ohne persönliche Daten (nur Fehlertext, Bildschirm, Version und Geräteart). Derselbe Fehler wird zusammengezählt.</p>
        {rows.length === 0
          ? <p className="center">✓ Keine Fehler gemeldet.</p>
          : <p className="small"><b>{rows.length}</b> verschiedene Fehler, zusammen <b>{total}</b>× aufgetreten.</p>}
        {rows.length > 0 && <button type="button" className="btn btn-small" onClick={() => void remove('all')}>Alle löschen</button>}
      </section>
      <ul className="admin-error-list">
        {rows.map((r) => (
          <li key={r.id} className={`admin-error kind-${r.kind}`}>
            <button type="button" className="admin-error-head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span className="admin-error-kind">{KIND_LABEL[r.kind] ?? r.kind}{r.count > 1 ? ` · ${r.count}×` : ''}</span>
              <b>{r.message}</b>
              <small>{when(r.last_at)} · {r.device || 'Gerät unbekannt'}{r.player_id ? ' · mit Konto' : ' · Gast'}</small>
            </button>
            {open === r.id && (
              <div className="admin-error-detail">
                <p className="small">Bildschirm: {r.place || '–'} · Version: {r.version || '–'} · zuerst: {when(r.created_at)}</p>
                {r.stack && <pre className="admin-error-stack">{r.stack}</pre>}
                <button type="button" className="btn btn-small" onClick={() => void remove([r.id])}>Erledigt</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
