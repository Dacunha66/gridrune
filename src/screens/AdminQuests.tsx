// Admin → Erfolge: the daily quests, weekly quests and achievements with their rewards (content_docs quests/config).
// The server reads the same document; changes count from the next look at the board (counters stay).
import { useEffect, useMemo, useState } from 'react';
import { ConfirmButton } from '../components/ConfirmButton';
import { CARDS } from '../game/cards';
import { Db, describeError } from '../game/cardStore';
import {
  COUNTED_METRICS, DEFAULT_QUESTS, METRIC_LABEL, METRIC_TEXT, QUESTS_COLLECTION, QUESTS_DOC, QUEST_METRICS, QUEST_REWARD_LABEL, QUEST_REWARD_TYPES,
  QuestConfig, QuestDef, QuestMetric, QuestReward, QuestRewardType, TITLE_MAX, parseQuestConfig, questConfigProblems, rewardText,
} from '../game/quests';
import { RUNES } from '../game/runes';
import { PACKS } from '../game/shop';
import { SKINS } from '../game/skins';

interface Props {
  db: Db;
  onToast: (text: string) => void;
}

type ListKey = 'daily' | 'weekly' | 'achievements';
const LIST_LABEL: Record<ListKey, string> = { daily: 'Tagesquests', weekly: 'Wochenquests', achievements: 'Dauerhafte Erfolge' };
const PREFIX: Record<ListKey, string> = { daily: 'd', weekly: 'w', achievements: 'a' };

function RewardEditor({ value, onChange }: { value: QuestReward; onChange: (r: QuestReward) => void }) {
  const cards = useMemo(() => [...CARDS].sort((a, b) => a.name.localeCompare(b.name, 'de')), []);
  const setType = (type: QuestRewardType) => {
    if (type === 'coins') onChange({ type, amount: 50 });
    else if (type === 'stones') onChange({ type, amount: 10 });
    else if (type === 'pack') onChange({ type, packId: PACKS[0].id, amount: 1 });
    else if (type === 'card') onChange({ type, cardId: cards[0]?.id });
    else if (type === 'skin') onChange({ type, skinId: SKINS.find((s) => s.kind === 'card' && (s.price > 0 || s.rewardOnly))?.id });
    else if (type === 'rune') onChange({ type, runeId: RUNES[0]?.id });
    else onChange({ type, title: 'Neuer Titel' });
  };
  return (
    <span className="quest-reward-edit">
      <select className="admin-input" value={value.type} onChange={(e) => setType(e.target.value as QuestRewardType)} aria-label="Belohnung">
        {QUEST_REWARD_TYPES.map((t) => <option key={t} value={t}>{QUEST_REWARD_LABEL[t]}</option>)}
      </select>
      {(value.type === 'coins' || value.type === 'stones') && (
        <input className="admin-input num" type="number" min={0} max={100000} value={value.amount ?? 0} aria-label={value.type === 'coins' ? 'Münzen' : 'Runensteine'}
          onChange={(e) => onChange({ ...value, amount: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
      )}
      {value.type === 'pack' && (
        <>
          <select className="admin-input" value={value.packId} onChange={(e) => onChange({ ...value, packId: e.target.value })} aria-label="Booster">
            {PACKS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className="admin-input num" type="number" min={1} max={10} value={value.amount ?? 1} aria-label="Anzahl"
            onChange={(e) => onChange({ ...value, amount: Math.min(10, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
        </>
      )}
      {value.type === 'card' && (
        <select className="admin-input" value={value.cardId} onChange={(e) => onChange({ ...value, cardId: e.target.value })} aria-label="Karte">
          {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      {value.type === 'skin' && (
        <select className="admin-input" value={value.skinId} onChange={(e) => onChange({ ...value, skinId: e.target.value })} aria-label="Skin">
          {SKINS.filter((s) => s.kind === 'card' && (s.price > 0 || s.rewardOnly)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.rewardOnly ? ' (nur Belohnung)' : ''}</option>)}
        </select>
      )}
      {value.type === 'rune' && (
        <select className="admin-input" value={value.runeId} onChange={(e) => onChange({ ...value, runeId: e.target.value })} aria-label="Rune">
          {RUNES.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
      {value.type === 'title' && (
        <input className="admin-input" value={value.title ?? ''} maxLength={TITLE_MAX} aria-label="Titel" onChange={(e) => onChange({ ...value, title: e.target.value })} />
      )}
    </span>
  );
}

function QuestEditorRow({ def, list, onChange, onDelete }: { def: QuestDef; list: ListKey; onChange: (d: QuestDef) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const metrics = list === 'achievements' ? QUEST_METRICS : COUNTED_METRICS;
  const text = def.text || METRIC_TEXT[def.metric](def.target);
  return (
    <div className={`admin-quest ${def.enabled ? '' : 'off'} ${open ? 'open' : ''}`}>
      <div className="admin-quest-head">
        <input type="checkbox" checked={def.enabled} aria-label="aktiv" onChange={(e) => onChange({ ...def, enabled: e.target.checked })} />
        <button type="button" className="admin-quest-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="admin-quest-title">{list === 'achievements' && def.chain ? <b>{def.chain}: </b> : null}{text}</span>
          <span className="admin-quest-reward">{rewardText(def.reward)}</span>
        </button>
        <button type="button" className="btn btn-small" onClick={() => setOpen(!open)}>{open ? 'Fertig' : 'Ändern'}</button>
      </div>
      {open && (
        <div className="admin-quest-fields">
          <label className="field"><span>Was zählt</span>
            <select className="admin-input" value={def.metric} onChange={(e) => onChange({ ...def, metric: e.target.value as QuestMetric })}>
              {metrics.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
          </label>
          <label className="field"><span>Ziel</span>
            <input className="admin-input num" type="number" inputMode="numeric" min={1} value={def.target}
              onChange={(e) => onChange({ ...def, target: Math.max(1, Math.round(Number(e.target.value) || 1)) })} />
          </label>
          {list === 'achievements' && (
            <label className="field"><span>Gruppe (Stufen gleicher Gruppe stehen zusammen)</span>
              <input className="admin-input" value={def.chain ?? ''} placeholder="z. B. Sieger" maxLength={30} onChange={(e) => onChange({ ...def, chain: e.target.value })} />
            </label>
          )}
          <label className="field"><span>Eigener Text (leer = automatisch)</span>
            <input className="admin-input" value={def.text ?? ''} placeholder={METRIC_TEXT[def.metric](def.target)} maxLength={80} onChange={(e) => onChange({ ...def, text: e.target.value })} />
          </label>
          <div className="field"><span>Belohnung</span><RewardEditor value={def.reward} onChange={(reward) => onChange({ ...def, reward })} /></div>
          <div className="admin-quest-foot">
            <span className="muted small">Kennung: {def.id}</span>
            <ConfirmButton label="Löschen" confirmLabel="Wirklich löschen?" onConfirm={onDelete} />
          </div>
        </div>
      )}
    </div>
  );
}

export function QuestsView({ db, onToast }: Props) {
  const [stored, setStored] = useState<QuestConfig | null>(null);
  const [exists, setExists] = useState(false);
  const [draft, setDraft] = useState<QuestConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      db.collection(QUESTS_COLLECTION).onSnapshot(
        (snap) => {
          const doc = snap.docs.find((d) => d.id === QUESTS_DOC && d.exists);
          const c = doc ? parseQuestConfig(doc.data()) : structuredClone(DEFAULT_QUESTS);
          setExists(!!doc);
          setStored(c);
          setDraft((d) => d ?? structuredClone(c));
        },
        (e) => onToast(describeError(e)),
      ),
    [db, onToast],
  );

  if (!draft || !stored) return <p className="muted center">Erfolge werden geladen …</p>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored) || !exists;
  const problems = questConfigProblems(draft);
  const setList = (k: ListKey, list: QuestDef[]) => setDraft({ ...draft, [k]: list });
  const add = (k: ListKey) => {
    const ids = new Set([...draft.daily, ...draft.weekly, ...draft.achievements].map((d) => d.id));
    let n = draft[k].length + 1;
    while (ids.has(`${PREFIX[k]}-neu${n}`)) n++;
    const def: QuestDef = { id: `${PREFIX[k]}-neu${n}`, metric: 'wins', target: k === 'daily' ? 2 : k === 'weekly' ? 10 : 100, reward: { type: 'coins', amount: 50 }, enabled: true };
    setList(k, [...draft[k], def]);
  };

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const clean = parseQuestConfig(JSON.parse(JSON.stringify(draft)));
      await db.collection(QUESTS_COLLECTION).doc(QUESTS_DOC).set(clean as unknown as Record<string, unknown>);
      setDraft(clean);
      onToast('Erfolge gespeichert ✓ – gilt sofort für alle Spieler.');
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="scroll admin-quests">
      <p className="muted small">
        Täglich und wöchentlich wird für alle Spieler dieselbe zufällige Auswahl aus den aktiven Quests gezogen (Wechsel um Mitternacht deutscher Zeit, Wochen am Montag).
        Gezählt wird nur, was der Server geprüft hat. Bereits abgeholte Belohnungen bleiben abgeholt; Zähler bleiben beim Ändern erhalten.
      </p>
      <div className="admin-quest-counts">
        <label>Tagesquests pro Tag <input className="admin-input num" type="number" min={1} max={6} value={draft.perDay} onChange={(e) => setDraft({ ...draft, perDay: Math.min(6, Math.max(1, Math.round(Number(e.target.value) || 1))) })} /></label>
        <label>Wochenquests pro Woche <input className="admin-input num" type="number" min={1} max={6} value={draft.perWeek} onChange={(e) => setDraft({ ...draft, perWeek: Math.min(6, Math.max(1, Math.round(Number(e.target.value) || 1))) })} /></label>
      </div>
      <div className="admin-quest-counts">
        <label>Bonus „alle Tagesquests“ <RewardEditor value={draft.dailyBonus} onChange={(dailyBonus) => setDraft({ ...draft, dailyBonus })} /></label>
        <label>Bonus „alle Wochenquests“ <RewardEditor value={draft.weeklyBonus} onChange={(weeklyBonus) => setDraft({ ...draft, weeklyBonus })} /></label>
      </div>
      {(Object.keys(LIST_LABEL) as ListKey[]).map((k) => (
        <section key={k} className="admin-quest-list">
          <h3>{LIST_LABEL[k]} <span className="muted small">{draft[k].filter((d) => d.enabled).length} aktiv</span></h3>
          {draft[k].map((def, i) => (
            <QuestEditorRow key={def.id} def={def} list={k}
              onChange={(d) => setList(k, draft[k].map((x, j) => (j === i ? d : x)))}
              onDelete={() => setList(k, draft[k].filter((_, j) => j !== i))} />
          ))}
          <button type="button" className="btn btn-small" onClick={() => add(k)}>+ hinzufügen</button>
        </section>
      ))}
      {problems.length > 0 && <ul className="admin-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <p className="muted small">Vorschau Bonus: {rewardText(draft.dailyBonus)} täglich · {rewardText(draft.weeklyBonus)} wöchentlich</p>
      <div className="row-buttons">
        <button type="button" className="btn btn-primary" disabled={!dirty || busy || problems.length > 0} onClick={() => void save()}>{busy ? '…' : exists ? 'Speichern' : 'Speichern (zum ersten Mal)'}</button>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setDraft(structuredClone(stored))}>Änderungen verwerfen</button>
        <ConfirmButton label="Standard laden" confirmLabel="Alles ersetzen?" onConfirm={() => setDraft(structuredClone(DEFAULT_QUESTS))} />
      </div>
    </section>
  );
}
