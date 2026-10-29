// Admin: runes (create, edit, deactivate, artwork, unlock, modes) and the release of the new features
// (runes, Wirbelwind/Kettenübernahme) plus the chain length. Runes are never deleted – only deactivated –
// so collections stay valid. Variants copy their base rune's effect, so rarer versions are never stronger.
import { useEffect, useMemo, useState } from 'react';
import { ConfirmButton } from '../components/ConfirmButton';
import { RuneBadge } from '../components/RuneBadge';
import { ImageField, StatusSeg, TextField } from './AdminCampaign';
import { RARITIES, RARITY_LABEL, Rarity } from '../game/cards';
import { Assets, Db, describeError, saveGameSettings, saveRune } from '../game/cardStore';
import { CLASSES, CLASS_INFO, CardClass } from '../game/effects';
import { STATUS_LABEL, CampaignContent } from '../game/campaign';
import {
  BUILTIN_RUNES, GAME_MODES, MODE_NAME, RUNES_COLLECTION, RUNE_EFFECTS, RUNE_EFFECT_LABEL, RuneDef, RuneEffect, nextRuneId, parseRune, runeRules, setRunes,
} from '../game/runes';
import { CHAIN_DEPTH_MAX, GameSettings, RELEASES, Release } from '../game/settings';

const RELEASE_LABEL: Record<Release, string> = { off: 'Aus', admin: 'Nur Admin (Test)', all: 'Alle Spieler' };

interface Props {
  db: Db;
  assets: Assets | null;
  settings: GameSettings;
  campaign: CampaignContent;
  onToast: (m: string) => void;
  onSettingsSaved: (s: GameSettings) => void;
}

export function RunesView({ db, assets, settings, campaign, onToast, onSettingsSaved }: Props) {
  const [saved, setSaved] = useState<RuneDef[] | null>(null);
  const [editing, setEditing] = useState<RuneDef | null>(null);

  useEffect(
    () =>
      db.collection(RUNES_COLLECTION).onSnapshot(
        (snap) => {
          const list = snap.docs.flatMap((d) => {
            const r = d.exists ? parseRune(d.id, d.data()) : null;
            return r ? [r] : [];
          });
          setSaved(list);
          setRunes(list); // the next duel uses the change right away
        },
        (e) => onToast(describeError(e)),
      ),
    [db, onToast],
  );

  const all = useMemo(() => {
    const byId = new Map<string, RuneDef>(BUILTIN_RUNES.map((r) => [r.id, r]));
    for (const r of saved ?? []) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [saved]);

  if (!saved) return <p className="muted center">Runen werden geladen …</p>;
  if (editing) {
    return <RuneEditor key={editing.id} db={db} assets={assets} initial={editing} all={all} campaign={campaign} onToast={onToast} onClose={() => setEditing(null)} />;
  }
  const newRune = (): RuneDef => ({
    ...BUILTIN_RUNES[0], id: nextRuneId(all.map((r) => r.id)), name: '', description: '', status: 'draft', unlock: { kind: 'stars', n: 10 }, glyph: 'ᚱ', updatedAt: '',
  });

  return (
    <div className="scroll campaign-admin">
      <ReleasePanel db={db} settings={settings} onToast={onToast} onSaved={onSettingsSaved} />
      <div className="admin-toolbar">
        <span className="muted small grow">Runen werden nie gelöscht, nur deaktiviert – Sammlungen bleiben gültig.</span>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(newRune())}>＋ Neue Rune</button>
      </div>
      <ul className="admin-list">
        {all.map((r) => {
          const rules = runeRules(r);
          return (
            <li key={r.id}>
              <button type="button" className="admin-row" onClick={() => setEditing(JSON.parse(JSON.stringify(r)) as RuneDef)}>
                <RuneBadge rune={r} />
                <span className="admin-row-main">
                  <strong>{r.name}</strong>
                  <span className="admin-row-meta">
                    <span className="mono">{r.id}</span> · {RARITY_LABEL[r.rarity]} · {RUNE_EFFECT_LABEL[rules.effect]}{r.variantOf ? ` · Variante von ${r.variantOf}` : ''}
                    {r.unlock.kind === 'start' ? ' · für alle' : ' · Kampagne'}
                  </span>
                </span>
                <span className={`status-pill status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Release of the new features and the chain length (stored in the game settings). */
function ReleasePanel({ db, settings, onToast, onSaved }: { db: Db; settings: GameSettings; onToast: (m: string) => void; onSaved: (s: GameSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const row = (key: 'runes' | 'abilities', label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {RELEASES.map((r) => (
          <button key={r} type="button" role="radio" aria-checked={draft.features[key] === r} className={`seg ${draft.features[key] === r ? 'active' : ''}`}
            onClick={() => setDraft({ ...draft, features: { ...draft.features, [key]: r } })}>{RELEASE_LABEL[r]}</button>
        ))}
      </div>
    </div>
  );
  return (
    <section className="check-world release-panel">
      <h3>Freigabe</h3>
      {row('runes', 'Runen im Duell')}
      {row('abilities', 'Fähigkeiten Wirbelwind und Kettenübernahme')}
      <small className="muted">„Nur Admin (Test)“: Nur du siehst die neuen Inhalte – Spieler spielen unverändert. Karten mit Wirbelwind oder Kettenübernahme spielen für Spieler bis zur Freigabe wie Karten ohne Fähigkeit.</small>
      <label className="field">
        <span>Kettenübernahme: weitere Stufen nach der ersten Übernahme</span>
        <input className="admin-input num" type="number" inputMode="numeric" min={0} max={CHAIN_DEPTH_MAX} value={draft.chainDepth}
          onChange={(e) => setDraft({ ...draft, chainDepth: Math.min(CHAIN_DEPTH_MAX, Math.max(0, Math.round(Number(e.target.value) || 0))) })} />
        <small className="muted">Test-Standard: 2. 0 = unbegrenzt (jede Karte greift trotzdem höchstens einmal an).</small>
      </label>
      <ConfirmButton
        label={busy ? 'Speichert …' : dirty ? 'Freigabe speichern' : 'Gespeichert ✓'}
        confirmLabel={draft.features.runes === 'all' || draft.features.abilities === 'all' ? 'Wirklich für alle Spieler?' : 'Speichern?'}
        ariaLabel="Freigabe speichern"
        onConfirm={async () => {
          if (!dirty || busy) return;
          setBusy(true);
          try {
            await saveGameSettings(db, draft);
            onSaved(draft);
            onToast('Freigabe gespeichert ✓');
          } catch (e) {
            onToast(describeError(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}

function RuneEditor({ db, assets, initial, all, campaign, onToast, onClose }: {
  db: Db; assets: Assets | null; initial: RuneDef; all: RuneDef[]; campaign: CampaignContent; onToast: (m: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<RuneDef>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<RuneDef>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const base = draft.variantOf ? all.find((r) => r.id === draft.variantOf) : null;
  const rules = base ? { ...draft, effect: base.effect, amount: base.amount, maxTargets: base.maxTargets, minPlaced: base.minPlaced, cls: base.cls } : draft;
  const isBuiltin = BUILTIN_RUNES.some((r) => r.id === draft.id);

  async function save() {
    if (!draft.name.trim()) return onToast('Bitte einen Namen eingeben.');
    if (draft.effect === 'empower' && !draft.cls && !base) return onToast('Bitte die Klasse wählen, die gestärkt wird.');
    setBusy(true);
    try {
      await saveRune(db, { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() });
      onToast(draft.status === 'active' ? 'Rune gespeichert und veröffentlicht ✓' : 'Rune gespeichert ✓');
      onClose();
    } catch (e) {
      onToast(describeError(e));
      setBusy(false);
    }
  }

  return (
    <div className="scroll campaign-editor">
      <div className="arena-editor-head">
        <ConfirmButton label="◀ Runen" ariaLabel="Zurück zur Liste" confirmLabel="Ungespeichert verwerfen?" onConfirm={onClose} skipConfirm={!dirty} />
        <span className={`status-pill status-${draft.status}`}>{STATUS_LABEL[draft.status]}</span>
      </div>
      <div className="rune-preview-row">
        <RuneBadge rune={draft} className="big" />
        <RuneBadge rune={draft} />
        <RuneBadge rune={draft} used />
        <small className="muted">Vorschau: Sammlung · Duell · verbraucht</small>
      </div>
      <TextField label="Name" value={draft.name} max={40} onChange={(name) => set({ name })} />
      <TextField label="Beschreibung" value={draft.description} max={300} multiline onChange={(description) => set({ description })} />
      <div className="field-row wrap">
        <label className="field grow"><span>Seltenheit (nur Optik)</span>
          <select className="admin-input" value={draft.rarity} onChange={(e) => set({ rarity: e.target.value as Rarity })}>
            {RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}
          </select>
        </label>
        <label className="field emoji-field"><span>Zeichen</span><input className="admin-input" value={draft.glyph} maxLength={4} onChange={(e) => set({ glyph: e.target.value })} /></label>
      </div>
      <label className="field"><span>Variante von (kosmetisch, gleiche Wirkung)</span>
        <select className="admin-input" value={draft.variantOf ?? ''} onChange={(e) => set({ variantOf: e.target.value || undefined })}>
          <option value="">– eigene Rune –</option>
          {all.filter((r) => r.id !== draft.id && !r.variantOf).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
      {base ? (
        <p className="small">Wirkung wie „{base.name}“: {RUNE_EFFECT_LABEL[base.effect]}. Varianten sind nie stärker als ihre Grundrune.</p>
      ) : (
        <>
          <label className="field"><span>Effektart</span>
            <select className="admin-input" value={draft.effect} onChange={(e) => set({ effect: e.target.value as RuneEffect })}>
              {RUNE_EFFECTS.map((x) => <option key={x} value={x}>{RUNE_EFFECT_LABEL[x]}</option>)}
            </select>
          </label>
          {draft.effect === 'echo' && (
            <label className="field"><span>Höchstens Übernahmen pro Einsatz</span>
              <select className="admin-input" value={draft.maxTargets} onChange={(e) => set({ maxTargets: Number(e.target.value) })}>
                {[1, 2, 3].map((n) => <option key={n} value={n}>{n} Karte{n > 1 ? 'n' : ''}{n === 1 ? ' (Test-Standard)' : ''}</option>)}
              </select>
              <small className="muted">Könnte die Karte mehr Gegner übernehmen, wählt der Spieler aus. Nie eine Kettenreaktion – auch nicht bei Karten mit Kettenübernahme.</small>
            </label>
          )}
          {(draft.effect === 'empower' || draft.effect === 'curse') && (
            <div className="field-row wrap">
              <label className="field grow"><span>Stärke (±)</span>
                <select className="admin-input" value={draft.amount} onChange={(e) => set({ amount: Number(e.target.value) })}>
                  {[1, 2].map((n) => <option key={n} value={n}>{draft.effect === 'empower' ? '+' : '−'}{n} auf alle vier Werte</option>)}
                </select>
              </label>
              <label className="field grow"><span>Ziele (höchstens)</span>
                <select className="admin-input" value={draft.maxTargets} onChange={(e) => set({ maxTargets: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n} Karte{n > 1 ? 'n' : ''}</option>)}
                </select>
              </label>
              {draft.effect === 'empower' && (
                <label className="field grow"><span>Klasse</span>
                  <select className="admin-input" value={draft.cls ?? ''} onChange={(e) => set({ cls: (e.target.value || undefined) as CardClass | undefined })}>
                    <option value="">– wählen –</option>
                    {CLASSES.map((c) => <option key={c} value={c}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
          <label className="field"><span>Einsetzbar ab</span>
            <select className="admin-input" value={draft.minPlaced} onChange={(e) => set({ minPlaced: Number(e.target.value) })}>
              {[0, 2, 4, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n === 0 ? 'Duellbeginn' : `${n} Karten auf dem Spielfeld${n === 8 ? ' (Spielmitte)' : ''}`}</option>)}
            </select>
          </label>
          <small className="muted">Dauer: {rules.effect === 'twist' ? 'dauerhaft bis Duellende (Ausrichtung)' : rules.effect === 'echo' ? 'sofort (einmaliger Angriff, keine Kette)' : 'bis Duellende, nur Karten, die beim Einsatz schon liegen'}. Werte bleiben immer zwischen 1 und 10.</small>
        </>
      )}
      <div className="field"><span>Spielmodi</span>
        <div className="segmented">
          {GAME_MODES.map((m) => (
            <button key={m} type="button" className={`seg ${draft.modes[m] ? 'active' : ''}`} aria-pressed={draft.modes[m]} onClick={() => set({ modes: { ...draft.modes, [m]: !draft.modes[m] } })}>{MODE_NAME[m]}</button>
          ))}
        </div>
        <small className="muted">Liga (Rangliste): nur Grundrunen „für alle“ – Kampagnen-Runen und Varianten sind dort nie wählbar.</small>
      </div>
      <div className="field"><span>Freischaltung</span>
        <select className="admin-input" value={draft.unlock.kind} onChange={(e) => {
          const k = e.target.value;
          set({ unlock: k === 'mission' ? { kind: 'mission', missionId: campaign.missions[0]?.id ?? 'm001' } : k === 'stars' ? { kind: 'stars', n: 10 } : { kind: 'start' } });
        }}>
          <option value="start">Von Anfang an (für alle)</option>
          <option value="mission">Kampagne: Mission gewinnen</option>
          <option value="stars">Kampagne: Sterne sammeln</option>
        </select>
        {draft.unlock.kind === 'mission' && (
          <select className="admin-input" value={draft.unlock.missionId} onChange={(e) => set({ unlock: { kind: 'mission', missionId: e.target.value } })}>
            {campaign.missions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {draft.unlock.kind === 'stars' && (
          <input className="admin-input num" type="number" inputMode="numeric" min={1} max={999} value={draft.unlock.n} onChange={(e) => set({ unlock: { kind: 'stars', n: Math.max(1, Math.round(Number(e.target.value) || 1)) } })} />
        )}
        <small className="muted">Keine Runen für Echtgeld. Runen bleiben nach dem Einsatz in der Sammlung.</small>
      </div>
      <ImageField kind="runeIcon" value={draft.icon} onChange={(icon) => set({ icon })} assets={assets} onToast={onToast} />
      <ImageField kind="runeArt" value={draft.image} onChange={(image) => set({ image })} assets={assets} onToast={onToast} />
      <div className="field"><span>Status</span><StatusSeg value={draft.status} onChange={(status) => set({ status })} /></div>
      <div className="editor-actions arena-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
      </div>
      {isBuiltin && <small className="muted">Grundrune: Änderungen ersetzen die Vorlage. Zum Abschalten „Deaktiviert“ wählen.</small>}
    </div>
  );
}
