// Admin: Community – reported chat messages (delete, mute the writer, dismiss), muted players, clans (rename, dissolve)
// and the admin's own word filter list. Every step goes through the server function "community" (admin checked there);
// the word list is the settings document "community" (admin-only write, like every content document).
import { useEffect, useState } from 'react';
import { Db, describeError } from '../game/cardStore';
import { ClanInfo, adminCommunity, listClans } from '../game/communityApi';
import { COMMUNITY_DOC, cleanWords } from '../../supabase/functions/community/logic';
import { ConfirmButton } from '../components/ConfirmButton';
import { Avatar } from '../components/Avatar';
import { PRIVACY_DOC, PrivacyInfo, EMPTY_PRIVACY, parsePrivacy, setPrivacyInfo } from '../game/privacy';

interface Report {
  id: number;
  reason: string;
  at: string;
  reporter: string;
  message: { id: number; body: string; name: string; playerId: string; channel: string; at: string; deleted: boolean } | null;
}
interface Muted { id: string; name: string; until: string; reason: string }

const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function CommunityAdminView({ db, onToast }: { db: Db; onToast: (m: string) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [muted, setMuted] = useState<Muted[]>([]);
  const [clans, setClans] = useState<ClanInfo[]>([]);
  const [words, setWords] = useState('');
  const [savedWords, setSavedWords] = useState('');
  const [rename, setRename] = useState<{ id: string; name: string; tag: string } | null>(null);
  const [privacy, setPrivacy] = useState<PrivacyInfo>(EMPTY_PRIVACY);
  const [savedPrivacy, setSavedPrivacy] = useState<PrivacyInfo>(EMPTY_PRIVACY);

  async function load() {
    const [r, m, c] = await Promise.all([adminCommunity('admin-reports'), adminCommunity('admin-muted'), listClans('')]);
    setReports((r?.reports as Report[]) ?? []);
    setMuted((m?.muted as Muted[]) ?? []);
    setClans(c ?? []);
  }
  useEffect(() => {
    load();
    db.collection('settings').doc(COMMUNITY_DOC).get().then((s) => {
      const list = s.exists ? cleanWords((s.data() as { words?: unknown }).words).join(', ') : '';
      setWords(list);
      setSavedWords(list);
    }).catch(() => undefined);
    db.collection('settings').doc(PRIVACY_DOC).get().then((s) => {
      const p = s.exists ? parsePrivacy(s.data()) : EMPTY_PRIVACY;
      setPrivacy(p);
      setSavedPrivacy(p);
    }).catch(() => undefined);
  }, [db]);

  async function savePrivacy() {
    const p = parsePrivacy(privacy);
    if (privacy.contact && !p.contact) return onToast('Bitte eine gültige E-Mail-Adresse eintragen.');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const next = { ...p, updated: today };
      await db.collection('settings').doc(PRIVACY_DOC).set({ ...next, updatedAt: new Date().toISOString() });
      setPrivacy(next);
      setSavedPrivacy(next);
      setPrivacyInfo(next);
      onToast('Datenschutz-Angaben gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
    }
  }

  async function run(action: string, args: Record<string, unknown>, ok: string) {
    const r = await adminCommunity(action, args);
    onToast(r ? ok : 'Das hat nicht geklappt.');
    await load();
  }

  async function saveWords() {
    try {
      const list = cleanWords(words);
      await db.collection('settings').doc(COMMUNITY_DOC).set({ words: list, updatedAt: new Date().toISOString() });
      setWords(list.join(', '));
      setSavedWords(list.join(', '));
      onToast('Wortliste gespeichert ✓ – gilt sofort');
    } catch (e) {
      onToast(describeError(e));
    }
  }

  return (
    <div className="scroll admin-community">
      <section className="admin-card">
        <h3>Gemeldete Nachrichten {reports && <small className="muted">{reports.length} offen</small>}</h3>
        {reports === null ? <p className="muted">Lädt …</p> : reports.length === 0 ? <p className="muted">Keine offenen Meldungen.</p> : reports.map((r) => (
          <article key={r.id} className="report">
            {r.message ? (
              <>
                <p className="report-msg"><b>{r.message.name}</b> <small className="muted">{r.message.channel === 'global' ? 'Allgemein' : 'Clan-Chat'} · {when(r.message.at)}</small><br />{r.message.body}</p>
                <p className="muted small">Gemeldet von {r.reporter}: {r.reason || 'ohne Grund'} · {when(r.at)}{r.message.deleted ? ' · bereits gelöscht' : ''}</p>
                <div className="admin-actions wrap">
                  <button type="button" className="btn btn-small btn-danger" onClick={() => run('admin-delete', { messageId: r.message!.id }, 'Nachricht gelöscht ✓')}>Löschen</button>
                  <button type="button" className="btn btn-small" onClick={() => run('admin-mute', { playerId: r.message!.playerId, hours: 24, reason: r.reason, messageId: r.message!.id }, `${r.message!.name} 24 Std. stumm ✓`)}>24 Std. stumm</button>
                  <button type="button" className="btn btn-small" onClick={() => run('admin-mute', { playerId: r.message!.playerId, hours: 24 * 7, reason: r.reason, messageId: r.message!.id }, `${r.message!.name} 7 Tage stumm ✓`)}>7 Tage stumm</button>
                  <ConfirmButton label="Dauerhaft stumm" confirmLabel="Wirklich dauerhaft?" onConfirm={() => run('admin-mute', { playerId: r.message!.playerId, hours: 0, reason: r.reason, messageId: r.message!.id }, `${r.message!.name} dauerhaft stumm ✓`)} />
                  <button type="button" className="btn btn-small" onClick={() => run('admin-dismiss', { reportId: r.id }, 'Meldung verworfen')}>Verwerfen</button>
                </div>
              </>
            ) : (
              <div className="admin-actions"><span className="muted">Nachricht nicht mehr vorhanden.</span><button type="button" className="btn btn-small" onClick={() => run('admin-dismiss', { reportId: r.id }, 'Erledigt')}>Erledigt</button></div>
            )}
          </article>
        ))}
      </section>

      <section className="admin-card">
        <h3>Stummgeschaltet</h3>
        {muted.length === 0 ? <p className="muted">Niemand.</p> : (
          <ul className="admin-plain">
            {muted.map((m) => (
              <li key={m.id}>
                <b>{m.name}</b> <small className="muted">bis {new Date(m.until).getFullYear() > 2100 ? 'auf Weiteres' : when(m.until)}{m.reason ? ` · ${m.reason}` : ''}</small>
                <button type="button" className="btn btn-small" onClick={() => run('admin-unmute', { playerId: m.id }, `${m.name} darf wieder schreiben ✓`)}>Aufheben</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card">
        <h3>Clans <small className="muted">{clans.length}</small></h3>
        {clans.length === 0 ? <p className="muted">Noch keine Clans.</p> : (
          <ul className="admin-plain">
            {clans.map((c) => (
              <li key={c.id} className="admin-clan">
                <Avatar id={c.emblem} size={30} />
                <span><b>[{c.tag}] {c.name}</b> <small className="muted">{c.members} Mitglieder · {c.weekPoints} Punkte</small></span>
                {rename?.id === c.id ? (
                  <span className="admin-clan-edit">
                    <input className="admin-input" value={rename.name} maxLength={20} onChange={(e) => setRename({ ...rename, name: e.target.value })} aria-label="Neuer Name" />
                    <input className="admin-input num" value={rename.tag} maxLength={4} onChange={(e) => setRename({ ...rename, tag: e.target.value.toUpperCase() })} aria-label="Neues Kürzel" />
                    <button type="button" className="btn btn-small btn-primary" onClick={() => { run('admin-clan-rename', rename, 'Clan umbenannt ✓'); setRename(null); }}>Speichern</button>
                  </span>
                ) : (
                  <span className="admin-actions">
                    <button type="button" className="btn btn-small" onClick={() => setRename({ id: c.id, name: c.name, tag: c.tag })}>Umbenennen</button>
                    <ConfirmButton label="Auflösen" confirmLabel="Wirklich auflösen?" onConfirm={() => run('admin-clan-dissolve', { clanId: c.id }, 'Clan aufgelöst ✓')} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-card">
        <h3>Datenschutz-Angaben</h3>
        <p className="muted small">Erscheinen auf der Seite „Datenschutz“ (Mehr → Datenschutz). Pflicht: Name und Anschrift der verantwortlichen Person sowie eine E-Mail für Anfragen.</p>
        <label className="field"><span>Verantwortlich (Name und Anschrift, mehrere Zeilen)</span>
          <textarea className="admin-input" rows={3} value={privacy.operator} maxLength={400} onChange={(e) => setPrivacy({ ...privacy, operator: e.target.value })} />
        </label>
        <label className="field"><span>E-Mail für Datenschutzfragen</span>
          <input className="admin-input" type="email" value={privacy.contact} maxLength={120} onChange={(e) => setPrivacy({ ...privacy, contact: e.target.value.trim() })} />
        </label>
        <div className="admin-actions">
          <button type="button" className="btn btn-primary" disabled={JSON.stringify(privacy) === JSON.stringify(savedPrivacy)} onClick={savePrivacy}>
            {JSON.stringify(privacy) === JSON.stringify(savedPrivacy) ? 'Gespeichert ✓' : 'Angaben speichern'}
          </button>
        </div>
      </section>

      <section className="admin-card">
        <h3>Wortfilter</h3>
        <p className="muted small">Eingebaut sind gängige Beleidigungen (deutsch und englisch). Hier kannst du weitere Wörter ergänzen, durch Komma getrennt. Sie werden in
          Nachrichten durch Sterne ersetzt und sind in Clannamen, Kürzeln und Beschreibungen nicht erlaubt.</p>
        <textarea className="admin-input" rows={3} value={words} onChange={(e) => setWords(e.target.value)} aria-label="Weitere gesperrte Wörter" />
        <div className="admin-actions">
          <button type="button" className="btn btn-primary" disabled={words === savedWords} onClick={saveWords}>{words === savedWords ? 'Gespeichert ✓' : 'Wortliste speichern'}</button>
        </div>
      </section>
    </div>
  );
}
