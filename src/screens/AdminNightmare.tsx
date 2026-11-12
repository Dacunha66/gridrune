// Admin: Schwierigkeit „Albtraum“ – how much stronger the computer's cards are, a bonus on their values, and the coins.
// Stored in settings/nightmare; a game keeps the values it started with, new games use the new ones.
import { useEffect, useState } from 'react';
import type { Db } from '../game/cardStore';
import { BONUS_LABEL, BOOST_LABEL, DEFAULT_NIGHTMARE, NIGHTMARE_DOC, NightmareConfig, parseNightmare, setNightmareConfig } from '../game/nightmare';

/** Measured with the "Schwer" computer playing the player's side (60 games each, strong and starter deck). */
function measured(c: NightmareConfig): string {
  const key = `${c.deckBoost}/${c.valueBonus}`;
  const known: Record<string, string> = {
    '0/0': 'etwa 50 % (wie Schwer)', '1/0': 'etwa 15–18 %', '0/1': 'etwa 13 %', '1/1': 'etwa 1–3 %', '2/0': 'etwa 1–2 %',
  };
  return known[key] ?? 'unter 2 % (nur für sehr starke Spieler)';
}

export function NightmareAdminView({ db, onToast }: { db: Db; onToast: (m: string) => void }) {
  const [config, setConfig] = useState<NightmareConfig | null>(null);
  const [saved, setSaved] = useState<NightmareConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.collection('settings').doc(NIGHTMARE_DOC).get()
      .then((s) => parseNightmare(s.exists ? s.data() : null))
      .catch(() => DEFAULT_NIGHTMARE)
      .then((c) => {
        setConfig(c);
        setSaved(c);
      });
  }, [db]);

  if (!config) return null;
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const setCoins = (k: keyof NightmareConfig['coins'], v: string) => setConfig({ ...config, coins: { ...config.coins, [k]: Math.max(0, Math.min(10000, Math.round(Number(v) || 0))) } });

  async function save() {
    if (!config) return;
    const clean = parseNightmare(config);
    setBusy(true);
    try {
      await db.collection('settings').doc(NIGHTMARE_DOC).set({ ...clean, updatedAt: new Date().toISOString() });
      setConfig(clean);
      setSaved(clean);
      setNightmareConfig(clean);
      onToast('Albtraum gespeichert ✓ – gilt für neue Spiele');
    } catch {
      onToast('Speichern hat nicht geklappt. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card admin-nightmare">
      <h3>Schwierigkeit „Albtraum“</h3>
      <p className="muted small">Die KI denkt wie auf „Schwer“ und sieht deine Handkarten nie. Schwerer wird sie über ihre Karten:</p>
      <span className="field"><span>Kartenstärke der KI</span>
        <span className="segmented">{[0, 1, 2].map((n) => (
          <button key={n} type="button" className={`seg ${config.deckBoost === n ? 'active' : ''}`} onClick={() => setConfig({ ...config, deckBoost: n })}>{BOOST_LABEL[n]}</button>
        ))}</span>
      </span>
      <span className="field"><span>Bonus auf die Werte der KI-Karten (auf den Karten sichtbar)</span>
        <span className="segmented">{[0, 1, 2].map((n) => (
          <button key={n} type="button" className={`seg ${config.valueBonus === n ? 'active' : ''}`} onClick={() => setConfig({ ...config, valueBonus: n })}>{BONUS_LABEL[n]}</button>
        ))}</span>
      </span>
      <p className="small">Gemessen: Die KI auf „Schwer“ als Spieler gewinnt damit <b>{measured(config)}</b> der Spiele (gegen „Schwer“ etwa 50 %). Gute echte Spieler sind deutlich stärker als diese KI.</p>
      <span className="field"><span>Münzen</span>
        <span className="nightmare-coins">
          <label>Sieg <input className="admin-input num" type="number" min={0} max={10000} value={config.coins.win} onChange={(e) => setCoins('win', e.target.value)} /></label>
          <label>Unentschieden <input className="admin-input num" type="number" min={0} max={10000} value={config.coins.draw} onChange={(e) => setCoins('draw', e.target.value)} /></label>
          <label>Niederlage <input className="admin-input num" type="number" min={0} max={10000} value={config.coins.loss} onChange={(e) => setCoins('loss', e.target.value)} /></label>
        </span>
      </span>
      <div className="admin-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => setConfig(DEFAULT_NIGHTMARE)}>Vorschlag wiederherstellen</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Speichert …' : 'Speichern'}</button>
      </div>
    </section>
  );
}
