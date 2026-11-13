// Admin: Ranglisten-Ligen – the computer's strength per league, the promotion rewards (once per league and season) and
// the season-end rewards. Stored in settings/ladder; the server reads it for every new match and every result.
import { useEffect, useState } from 'react';
import type { Db } from '../game/cardStore';
import type { Reward } from '../game/campaign';
import type { AiLevel } from '../game/ai';
import { DEFAULT_LADDER, LADDER_DOC, LEAGUES, LadderConfig, MAX_LADDER_REWARDS, parseLadderConfig, setLadderConfig } from '../game/ladder';
import { LEVEL_LABEL } from '../game/stats';
import { RewardPicker } from './AdminLogin';

const LEVELS: AiLevel[] = ['easy', 'medium', 'hard', 'nightmare'];

export function LadderAdminView({ db, onToast }: { db: Db; onToast: (m: string) => void }) {
  const [config, setConfig] = useState<LadderConfig | null>(null);
  const [saved, setSaved] = useState<LadderConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.collection('settings').doc(LADDER_DOC).get()
      .then((s) => parseLadderConfig(s.exists ? s.data() : null))
      .catch(() => DEFAULT_LADDER)
      .then((c) => {
        setConfig(c);
        setSaved(c);
      });
  }, [db]);

  if (!config) return null;
  const dirty = JSON.stringify(config) !== JSON.stringify(saved);
  const setList = (key: 'promotion' | 'season', league: number, list: Reward[]) =>
    setConfig({ ...config, [key]: config[key].map((l, i) => (i === league ? list : l)) });

  async function save() {
    if (!config) return;
    const clean = parseLadderConfig(config);
    setBusy(true);
    try {
      await db.collection('settings').doc(LADDER_DOC).set({ ...clean, updatedAt: new Date().toISOString() });
      setConfig(clean);
      setSaved(clean);
      setLadderConfig(clean);
      onToast('Ligen gespeichert ✓ – gilt für neue Matches');
    } catch {
      onToast('Speichern hat nicht geklappt. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }

  const rewards = (key: 'promotion' | 'season', league: number) => {
    const list = config[key][league];
    return (
      <div className="admin-ladder-rewards">
        {list.map((r, i) => (
          <div key={i} className="admin-login-day">
            <RewardPicker reward={r} label={`${LEAGUES[league].name} ${i + 1}`} onChange={(x) => setList(key, league, list.map((y, k) => (k === i ? x : y)))} />
            <button type="button" className="btn btn-small" aria-label="Belohnung entfernen" onClick={() => setList(key, league, list.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        {list.length < MAX_LADDER_REWARDS && (
          <button type="button" className="btn btn-small" onClick={() => setList(key, league, [...list, { type: 'coins', amount: 100 }])}>+ Belohnung</button>
        )}
      </div>
    );
  };

  return (
    <section className="admin-card admin-ladder">
      <h3>Ranglisten-Ligen</h3>
      <p className="muted small">6 Ligen mit je 3 Stufen. 5 Siegpunkte = nächste Stufe, eine Niederlage kostet 1 Punkt, bei 0 Punkten geht es eine Stufe runter. Stufe I jeder Liga ist ein Safepoint (3 Mal pro Saison). Neue Saison jeden Monatsersten; man startet dann eine Liga tiefer. Belohnungen kommen ins Postfach.</p>
      {LEAGUES.map((l, league) => (
        <details key={l.id} className="admin-ladder-league" open={league === 0}>
          <summary><b>{l.name}</b> · Computer: {LEVEL_LABEL[config.levels[league]]}</summary>
          <span className="field"><span>Computer-Stärke</span>
            <span className="segmented">{LEVELS.map((lv) => (
              <button key={lv} type="button" className={`seg ${config.levels[league] === lv ? 'active' : ''}`}
                onClick={() => setConfig({ ...config, levels: config.levels.map((x, i) => (i === league ? lv : x)) })}>{LEVEL_LABEL[lv]}</button>
            ))}</span>
          </span>
          {league > 0 && <><p className="small"><b>Aufstieg</b> (einmal pro Saison beim Erreichen):</p>{rewards('promotion', league)}</>}
          <p className="small"><b>Saisonende</b> (beste erreichte Liga):</p>
          {rewards('season', league)}
        </details>
      ))}
      <div className="admin-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => setConfig(DEFAULT_LADDER)}>Vorschlag wiederherstellen</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Speichert …' : 'Speichern'}</button>
      </div>
    </section>
  );
}
