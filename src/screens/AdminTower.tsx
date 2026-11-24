// Admin: Turm der Prüfungen – the floors (name, difficulty, reward, published or draft), test mode (every floor open,
// drafts too, nothing stored) and resetting the admin's OWN tower progress (the server allows it only for the own
// account; other players are never touched).
import { useEffect, useState } from 'react';
import type { Db } from '../game/cardStore';
import { DIFFICULTY_LABEL, TOWER_DIFFICULTIES, TowerDifficulty, TowerFloor } from '../game/tower';
import { loadFloors, saveFloor } from '../game/towerApi';
import { resetTowerRemote, towerStatusRemote } from '../game/adventureApi';
import { LEVEL_LABEL, rewardText } from '../game/campaign';
import { RewardPicker } from './AdminLogin';
import { ArenaField } from './AdminCampaign';
import { ARENAS } from '../game/arenas';
import { RARITY_LABEL, getCard } from '../game/cards';

export function TowerAdminView({ db, onToast, onTest }: { db: Db; onToast: (m: string) => void; onTest: (floorId?: string) => void }) {
  const [floors, setFloors] = useState<TowerFloor[] | null>(null);
  const [edit, setEdit] = useState<TowerFloor | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<{ cleared: number; rewarded: string[] } | null>(null);

  const reload = () => {
    void loadFloors(db).then((f) => setFloors((f ?? []).sort((a, b) => a.number - b.number)));
    void towerStatusRemote().then(setMine);
  };
  useEffect(reload, [db]);

  if (!floors) return <p className="muted center">Lädt …</p>;

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      await saveFloor(db, edit);
      onToast(`Etage ${edit.number} gespeichert.`);
      setEdit(null);
      reload();
    } catch {
      onToast('Speichern hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  /** Publishes every draft floor of one section at once. */
  const publishSection = async (section: string) => {
    const list = (floors ?? []).filter((f) => f.section === section && f.status === 'draft');
    if (!list.length || !window.confirm(`${list.length} Etagen von „${section}“ veröffentlichen? Danach sehen alle Spieler sie.`)) return;
    setBusy(true);
    try {
      for (const f of list) await saveFloor(db, { ...f, status: 'active' });
      onToast(`„${section}“ ist veröffentlicht.`);
    } catch {
      onToast('Veröffentlichen hat nicht geklappt.');
    } finally {
      setBusy(false);
      reload();
    }
  };
  const draftSections = [...new Set(floors.filter((f) => f.status === 'draft').map((f) => f.section))];

  const reset = async (rewards: boolean) => {
    const text = rewards
      ? 'Deinen eigenen Turm-Fortschritt UND die erhaltenen Etagen-Belohnungen zurücksetzen? Du kannst die Münzen danach noch einmal verdienen. Andere Spieler sind nicht betroffen.'
      : 'Deinen eigenen Turm-Fortschritt zurücksetzen (wieder ab Etage 1)? Erhaltene Belohnungen bleiben erhalten und werden nicht erneut gezahlt. Andere Spieler sind nicht betroffen.';
    if (!window.confirm(text)) return;
    setBusy(true);
    const ok = await resetTowerRemote(rewards);
    setBusy(false);
    onToast(ok ? 'Dein Turm-Fortschritt wurde zurückgesetzt.' : 'Zurücksetzen hat nicht geklappt.');
    reload();
  };

  return (
    <div className="scroll admin-tower">
      <section className="admin-card">
        <h3>Turm der Prüfungen</h3>
        <p className="muted small">
          Spieler steigen Etage für Etage nach oben (nur mit Konto). Jeder Kampf wird vom Server nachgespielt; erst dann öffnet sich die nächste
          Etage und die Belohnung wird gezahlt – pro Konto und Etage nur einmal. Entwürfe sehen nur Admins (im Testmodus).
        </p>
        <div className="admin-actions">
          <button type="button" className="btn btn-primary" onClick={() => onTest()}>Testmodus öffnen</button>
        </div>
        <p className="muted small">Testmodus: alle Etagen offen, Entwürfe sichtbar, der Server prüft den Kampf – aber nichts wird gespeichert oder gezahlt.</p>
      </section>

      <section className="admin-card">
        <h3>Etagen ({floors.length})</h3>
        {floors.length === 0 && <p className="muted">Noch keine Etagen.</p>}
        {draftSections.map((sec) => (
          <div key={sec} className="admin-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publishSection(sec)}>„{sec}“ veröffentlichen</button>
          </div>
        ))}
        <ul className="admin-tower-list">
          {floors.map((f) => (
            <li key={f.id} className={f.status === 'draft' ? 'draft' : ''}>
              {edit?.id === f.id ? (
                <div className="admin-tower-edit">
                  <label>Name <input className="admin-input" value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                  <label>Schwierigkeit{' '}
                    <select className="admin-input" value={edit.difficulty} onChange={(e) => setEdit({ ...edit, difficulty: e.target.value as TowerDifficulty })}>
                      {TOWER_DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
                    </select>
                  </label>
                  <label>Gegner-Karte (Bild und Name des Gegners)
                    <select className="admin-input" value={edit.face ?? ''} onChange={(e) => {
                      const id = e.target.value;
                      setEdit(id ? { ...edit, face: id, opponent: { ...edit.opponent, name: getCard(id).name } } : { ...edit, face: undefined });
                    }}>
                      <option value="">Kein Kartenbild (Emoji {edit.opponent.emoji})</option>
                      {[...new Set([...(edit.face ? [edit.face] : []), ...edit.opponent.deck])].map((id) => (
                        <option key={id} value={id}>{getCard(id).name} ({RARITY_LABEL[getCard(id).rarity]})</option>
                      ))}
                    </select>
                  </label>
                  <ArenaField db={db} value={edit.arenaId} onChange={(arenaId) => setEdit({ ...edit, arenaId })}
                    note="Jede Arena ist wählbar – auch ausgeschaltete; sie gilt dann nur auf dieser Etage. Neue Arenen legst du im Reiter „Arenen“ an." />
                  <div className="admin-login-day">
                    <b>Belohnung</b>
                    <RewardPicker reward={edit.reward ?? { type: 'coins', amount: 25 }} label={`Etage ${edit.number}`} onChange={(r) => setEdit({ ...edit, reward: r })} />
                  </div>
                  <label className="field-check">
                    <input type="checkbox" checked={edit.status === 'active'} onChange={(e) => setEdit({ ...edit, status: e.target.checked ? 'active' : 'draft' })} />
                    <span>Veröffentlicht (sonst Entwurf)</span>
                  </label>
                  <div className="admin-actions">
                    <button type="button" className="btn" disabled={busy} onClick={() => setEdit(null)}>Abbrechen</button>
                    <button type="button" className="btn btn-primary" disabled={busy || !edit.name.trim()} onClick={() => void save()}>{busy ? 'Speichert …' : 'Speichern'}</button>
                  </div>
                </div>
              ) : (
                <div className="admin-tower-row">
                  <span className="tf-num">{f.number}</span>
                  <span className="admin-tower-main">
                    <b>{f.name}</b> {f.status === 'draft' && <span className="pill">Entwurf</span>}
                    {f.face && <span className="muted small">Gegner-Karte: {getCard(f.face).name}</span>}
                    <span className="muted small">
                      {DIFFICULTY_LABEL[f.difficulty]} · {f.opponent.emoji} {f.opponent.name} (KI: {LEVEL_LABEL[f.opponent.level]}){f.opponent.rune ? ' · mit Rune' : ''}
                      {' · '}{ARENAS.find((a) => a.id === f.arenaId)?.name ?? f.arenaId}
                      {' · '}{f.reward ? rewardText(f.reward) : 'keine Belohnung'}
                    </span>
                  </span>
                  <span className="admin-tower-btns">
                    <button type="button" className="btn btn-small" onClick={() => onTest(f.id)}>Testen</button>
                    <button type="button" className="btn btn-small" onClick={() => setEdit(f)}>Bearbeiten</button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-card">
        <h3>Eigenen Fortschritt zurücksetzen</h3>
        <p className="muted small">
          Nur für dein eigenes Konto, zum Testen.
          {mine ? ` Aktuell: ${mine.cleared} ${mine.cleared === 1 ? 'Etage' : 'Etagen'} geschafft, ${mine.rewarded.length} Belohnungen erhalten.` : ''}
        </p>
        <div className="admin-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void reset(false)}>Fortschritt zurücksetzen</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void reset(true)}>Fortschritt + Belohnungen zurücksetzen</button>
        </div>
      </section>
    </div>
  );
}
