// Admin: the Login-Kalender – on/off and the 7 rewards (coins, Runensteine, a pack or a card). Stored in the settings
// document "login"; the server reads it when a player collects, so changes count from the next field collected.
import { useEffect, useMemo, useState } from 'react';
import type { Db } from '../game/cardStore';
import { CARDS, RARITY_LABEL } from '../game/cards';
import { PACKS, packView } from '../game/shop';
import type { Reward } from '../game/campaign';
import { DEFAULT_LOGIN, LOGIN_DOC, LoginConfig, parseLoginConfig } from '../game/loginCalendar';

type Kind = 'coins' | 'stones' | 'pack' | 'card';
const KIND_LABEL: Record<Kind, string> = { coins: 'Münzen', stones: 'Runensteine', pack: 'Pack', card: 'Karte' };

export function LoginAdminView({ db, onToast }: { db: Db; onToast: (m: string) => void }) {
  const [config, setConfig] = useState<LoginConfig | null>(null);
  const [saved, setSaved] = useState<LoginConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const cards = useMemo(() => [...CARDS].sort((a, b) => a.name.localeCompare(b.name, 'de')), []);

  useEffect(() => {
    db.collection('settings').doc(LOGIN_DOC).get()
      .then((s) => parseLoginConfig(s.exists ? s.data() : null))
      .catch(() => DEFAULT_LOGIN)
      .then((c) => {
        setConfig(c);
        setSaved(c);
      });
  }, [db]);

  if (!config) return <p className="muted center">Lädt …</p>;

  const setDay = (i: number, r: Reward) => setConfig({ ...config, rewards: config.rewards.map((x, k) => (k === i ? r : x)) });
  const setKind = (i: number, kind: Kind) => setDay(i, kind === 'coins' || kind === 'stones' ? { type: kind, amount: 50 } : kind === 'pack' ? { type: 'pack', packId: PACKS[0]?.id, amount: 1 } : { type: 'card', cardId: cards[0]?.id });
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);

  async function save() {
    if (!config) return;
    const clean = parseLoginConfig(config);
    setBusy(true);
    try {
      await db.collection('settings').doc(LOGIN_DOC).set({ ...clean, updatedAt: new Date().toISOString() });
      setConfig(clean);
      setSaved(clean);
      onToast('Login-Kalender gespeichert ✓');
    } catch {
      onToast('Speichern hat nicht geklappt. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <section className="admin-card">
        <h3>Login-Kalender</h3>
        <p className="muted small">Angemeldete Spieler holen jeden Tag ein Feld ab (Tageswechsel um Mitternacht deutscher Zeit). Verpasste Tage setzen nichts zurück; nach Tag 7 geht es wieder bei Tag 1 los. Packs werden beim Abholen geöffnet.</p>
        <label className="field-check">
          <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />
          <span>Kalender eingeschaltet</span>
        </label>
        {config.rewards.map((r, i) => {
          const kind = r.type as Kind;
          return (
            <div key={i} className="admin-login-day">
              <b>Tag {i + 1}</b>
              <span className="segmented">
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <button key={k} type="button" className={`seg ${kind === k ? 'active' : ''}`} onClick={() => kind !== k && setKind(i, k)}>{KIND_LABEL[k]}</button>)}
              </span>
              {(kind === 'coins' || kind === 'stones') && (
                <input className="admin-input num" type="number" min={1} max={100000} value={r.amount ?? 1} aria-label={`Tag ${i + 1}: Anzahl`}
                  onChange={(e) => setDay(i, { ...r, amount: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
              )}
              {kind === 'pack' && (
                <>
                  <select className="admin-input" value={r.packId ?? ''} aria-label={`Tag ${i + 1}: Pack`} onChange={(e) => setDay(i, { ...r, packId: e.target.value })}>
                    {PACKS.map((p) => <option key={p.id} value={p.id}>{packView(p).name}</option>)}
                  </select>
                  <input className="admin-input num" type="number" min={1} max={10} value={r.amount ?? 1} aria-label={`Tag ${i + 1}: Anzahl Packs`}
                    onChange={(e) => setDay(i, { ...r, amount: Math.min(10, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                </>
              )}
              {kind === 'card' && (
                <select className="admin-input" value={r.cardId ?? ''} aria-label={`Tag ${i + 1}: Karte`} onChange={(e) => setDay(i, { ...r, cardId: e.target.value })}>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.name} ({RARITY_LABEL[c.rarity]})</option>)}
                </select>
              )}
            </div>
          );
        })}
        <div className="admin-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => setConfig(DEFAULT_LOGIN)}>Vorschlag wiederherstellen</button>
          <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Speichert …' : 'Speichern'}</button>
        </div>
      </section>
    </div>
  );
}
