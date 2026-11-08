// Admin: player avatars – upload a picture (cut round in the game), name, emoji, colours, frame, the achievement that
// unlocks it, on/off. Changes go to content_docs avatars/<id>; the game and the server functions read them, so an
// avatar unlocks for players exactly as set here (built-in avatars are changed by saving them once).
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { ImageField } from './AdminCampaign';
import { Assets, Db, describeError, saveAvatar } from '../game/cardStore';
import { AVATARS, AVATARS_COLLECTION, AVATAR_FRAMES, AvatarDef, AvatarFrame, BUILTIN_AVATARS, FRAME_LABEL, nextAvatarId, parseAvatar, setAvatars } from '../game/avatars';
import { DEFAULT_QUESTS, QUESTS_COLLECTION, QUESTS_DOC, QuestConfig, parseQuestConfig, questText } from '../game/quests';

interface Props {
  db: Db;
  assets: Assets | null;
  onToast: (m: string) => void;
}

export function AvatarsView({ db, assets, onToast }: Props) {
  const [list, setList] = useState<AvatarDef[]>(() => [...AVATARS]);
  const [quests, setQuests] = useState<QuestConfig>(() => structuredClone(DEFAULT_QUESTS));
  const [editing, setEditing] = useState<AvatarDef | null>(null);

  useEffect(
    () =>
      db.collection(AVATARS_COLLECTION).onSnapshot(
        (snap) => {
          const saved = snap.docs.flatMap((d) => {
            const x = d.exists ? parseAvatar(d.id, d.data()) : null;
            return x ? [x] : [];
          });
          setAvatars(saved);
          setList([...AVATARS]);
        },
        (e) => onToast(describeError(e)),
      ),
    [db, onToast],
  );
  useEffect(
    () =>
      db.collection(QUESTS_COLLECTION).onSnapshot(
        (snap) => {
          const doc = snap.docs.find((d) => d.id === QUESTS_DOC && d.exists);
          setQuests(doc ? parseQuestConfig(doc.data()) : structuredClone(DEFAULT_QUESTS));
        },
        () => undefined,
      ),
    [db],
  );

  const questName = (id: string | undefined) => {
    if (!id) return 'Von Anfang an';
    const q = quests.achievements.find((a) => a.id === id);
    return q ? `${q.chain ? `${q.chain}: ` : ''}${questText(q)}` : `Erfolg ${id} (gibt es nicht mehr)`;
  };

  if (editing) {
    return <AvatarEditor initial={editing} isNew={!list.some((x) => x.id === editing.id)} quests={quests} questName={questName} db={db} assets={assets} onToast={onToast} onClose={() => setEditing(null)} />;
  }
  return (
    <section className="admin-avatars scroll">
      <p className="muted small">Avatare der Spieler: Bild hochladen (es wird rund ausgeschnitten), Name, Rahmen und welcher Erfolg sie freischaltet. Ohne Bild wird das Symbol gezeigt. Ausgeschaltete Avatare werden nicht angeboten; wer sie trägt, zeigt den Start-Avatar.</p>
      <button type="button" className="btn btn-primary" onClick={() => setEditing({ id: nextAvatarId(list.map((x) => x.id)), name: '', art: '🙂', bg: ['#475569', '#0f172a'], frame: 'silver', image: null, active: true, updatedAt: '' })}>+ Neuer Avatar</button>
      <div className="admin-avatar-list">
        {list.map((x) => (
          <button key={x.id} type="button" className={`admin-avatar-row ${x.active === false ? 'off' : ''}`} onClick={() => setEditing(x)}>
            <Avatar id={x.active === false ? null : x.id} size={44} />
            <span className="admin-avatar-text">
              <b>{x.name}</b> <small className="muted">{x.id} · {FRAME_LABEL[x.frame]}{x.image ? ' · Bild' : ''}{x.active === false ? ' · aus' : ''}</small>
              <small>{questName(x.quest)}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AvatarEditor({ initial, isNew, quests, questName, db, assets, onToast, onClose }: {
  initial: AvatarDef; isNew: boolean; quests: QuestConfig; questName: (id: string | undefined) => string; db: Db; assets: Assets | null; onToast: (m: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<AvatarDef>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<AvatarDef>) => setDraft({ ...draft, ...patch });
  const builtin = BUILTIN_AVATARS.some((x) => x.id === draft.id);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const takenBy = useMemo(() => (draft.quest ? AVATARS.filter((x) => x.id !== draft.id && x.quest === draft.quest).map((x) => x.name) : []), [draft.quest, draft.id]);

  const preview = <Avatar id={draft.id} def={draft} size={96} />;

  async function save() {
    if (!draft.name.trim()) return onToast('Bitte einen Namen eingeben.');
    setBusy(true);
    try {
      await saveAvatar(db, { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() });
      onToast('Avatar gespeichert ✓');
      onClose();
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-avatar-editor scroll">
      <div className="row-buttons"><button type="button" className="btn btn-small" onClick={onClose}>← Übersicht</button></div>
      <div className="admin-avatar-preview">{preview}<span><b>{draft.name || 'Neuer Avatar'}</b><small className="muted"> {draft.id}{builtin ? ' · eingebaut' : ''}{isNew ? ' · neu' : ''}</small></span></div>
      <ImageField kind="playerAvatar" value={draft.image ?? null} onChange={(image) => set({ image })} assets={assets} onToast={onToast} />
      <label className="field"><span>Name</span>
        <input className="admin-input" value={draft.name} maxLength={24} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field"><span>Symbol (wenn kein Bild)</span>
        <input className="admin-input" value={draft.art} maxLength={8} onChange={(e) => set({ art: e.target.value })} />
      </label>
      <div className="field"><span>Hintergrund (Verlauf)</span>
        <div className="row-buttons">
          <input type="color" aria-label="Farbe innen" value={draft.bg[0]} onChange={(e) => set({ bg: [e.target.value, draft.bg[1]] })} />
          <input type="color" aria-label="Farbe außen" value={draft.bg[1]} onChange={(e) => set({ bg: [draft.bg[0], e.target.value] })} />
        </div>
      </div>
      <div className="field"><span>Rahmen</span>
        <div className="segmented" role="radiogroup" aria-label="Rahmen">
          {AVATAR_FRAMES.map((f: AvatarFrame) => (
            <button key={f} type="button" role="radio" aria-checked={draft.frame === f} className={`seg ${draft.frame === f ? 'active' : ''}`} onClick={() => set({ frame: f })}>{FRAME_LABEL[f]}</button>
          ))}
        </div>
      </div>
      <label className="field"><span>Freigeschaltet durch</span>
        <select className="admin-input" value={draft.quest ?? ''} onChange={(e) => set({ quest: e.target.value || undefined })}>
          <option value="">Von Anfang an</option>
          {quests.achievements.map((q) => <option key={q.id} value={q.id}>{questName(q.id)}</option>)}
        </select>
        <small className="muted">Rückwirkend: Wer den Erfolg schon abgeholt hat, bekommt den Avatar sofort.{takenBy.length > 0 && ` Dieser Erfolg schaltet auch frei: ${takenBy.join(', ')}.`}</small>
      </label>
      <div className="field"><span>Status</span>
        <div className="segmented" role="radiogroup" aria-label="Status">
          <button type="button" role="radio" aria-checked={draft.active !== false} className={`seg ${draft.active !== false ? 'active' : ''}`} onClick={() => set({ active: true })}>An</button>
          <button type="button" role="radio" aria-checked={draft.active === false} className={`seg ${draft.active === false ? 'active' : ''}`} onClick={() => set({ active: false })}>Aus</button>
        </div>
      </div>
      <div className="row-buttons">
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}</button>
      </div>
    </section>
  );
}
