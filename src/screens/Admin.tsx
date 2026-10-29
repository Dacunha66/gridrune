import { CampaignContent } from '../game/campaign';
import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmButton } from '../components/ConfirmButton';
import { BUILTIN_CARDS, RARITIES, RARITY_LABEL, RARITY_ORDER, Rarity } from '../game/cards';
import {
  CardRecord, CardStatus, DESCRIPTION_MAX, MIN_ACTIVE_CARDS, NAME_MAX, STATUSES, STATUS_LABEL, VALUE_KEYS, ValueKey,
  balanceReport, builtinRecords, cardSum, duplicateRecord, newRecord, nextCardId, powerHint, recordToCard,
} from '../game/catalog';
import {
  Assets, CARDS_COLLECTION, Db, deleteCardRecord, describeError, getAssets, getDb, isAdmin, loadGameSettings, parseDocs, prepareCardImage,
  saveCardRecord,
} from '../game/cardStore';
import { GameSettings, defaultSettings } from '../game/settings';
import { BalanceView, RunnerSettingsView } from './AdminBalance';
import { ArenaView } from './AdminArenas';
import { DesignerView } from './AdminDesigns';
import { CampaignView } from './AdminCampaign';
import { CardStyleView } from './AdminCardStyle';
import { RunesView } from './AdminRunes';
import { Design, DesignState } from '../game/designs';
import { CardClass, CLASS_INFO, CLASSES, effectFitsClass, EffectId, effectPreview, EFFECTS, effectsForClass } from '../game/effects';

interface Props {
  /** Called with the live card list so the game picks up changes right away. */
  onCatalogChange: (records: CardRecord[]) => void;
  /** Called after the runner settings were saved, so the game uses them right away. */
  onSettingsChange: (settings: GameSettings) => void;
  /** Called after a design was published, so the game shows it right away. */
  onDesignsChange: (designs: Design[], state: DesignState) => void;
  /** Called after campaign content was saved, so the game uses it right away. */
  onCampaignChange: (content: CampaignContent) => void;
  /** Plays a mission in test mode (drafts visible, nothing saved). */
  onTestCampaign: (missionId?: string) => void;
  /** Campaign content in use (for rune unlock conditions). */
  campaign: CampaignContent;
  onBack: () => void;
}

type Tab = 'cards' | 'balance' | 'runner' | 'arenas' | 'designs' | 'campaign' | 'runes' | 'cardstyle';
const TAB_LABEL: Record<Tab, string> = { cards: 'Karten', balance: 'Balancing', runner: 'Lauf', arenas: 'Arenen', designs: 'Spielfeld-Designer', campaign: 'Kampagnen-Editor', runes: 'Runen', cardstyle: 'Kartendesign' };
/** Tab to come back to (e.g. after testing a mission). */
let lastTab: Tab = 'cards';

type SortKey = 'id' | 'name' | 'rarity' | 'updated';

const VALUE_LABEL: Record<ValueKey, string> = { top: 'Oben', right: 'Rechts', bottom: 'Unten', left: 'Links' };
const STATUS_HINT: Record<CardStatus, string> = {
  draft: 'Nur hier sichtbar – noch nicht im Spiel.',
  active: 'Im Spiel: in Toren, Packs und beim Gegner.',
  disabled: 'Vorübergehend aus dem Spiel genommen – nicht gelöscht. Spieler behalten sie; jederzeit wieder aktivierbar.',
};

export function Admin({ onCatalogChange, onSettingsChange, onDesignsChange, onCampaignChange, onTestCampaign, campaign, onBack }: Props) {
  const [access, setAccess] = useState<'checking' | 'denied' | 'ok'>('checking');
  const [db, setDb] = useState<Db | null>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [records, setRecords] = useState<CardRecord[] | null>(null);
  const [editing, setEditing] = useState<{ draft: CardRecord; original: CardRecord | null } | null>(null);
  const [toast, setToast] = useState('');
  const [tab, setTabState] = useState<Tab>(lastTab);
  const setTab = (t: Tab) => {
    lastTab = t;
    setTabState(t);
  };
  const [settings, setSettings] = useState<GameSettings | null>(null);
  const changeRef = useRef(onCatalogChange);
  changeRef.current = onCatalogChange;

  // Access check, then subscribe once to the live card list.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let alive = true;
    (async () => {
      const [admin, theDb] = await Promise.all([isAdmin(), getDb()]);
      if (!alive) return;
      if (!admin || !theDb) {
        setAccess('denied');
        return;
      }
      setAccess('ok');
      setDb(theDb);
      setAssets(await getAssets());
      setSettings((await loadGameSettings(theDb)) ?? defaultSettings());
      unsub = theDb.collection(CARDS_COLLECTION).onSnapshot(
        (snap) => {
          const list = parseDocs(snap.docs);
          setRecords(list);
          if (list.length > 0) changeRef.current(list);
        },
        (e) => setToast(describeError(e)),
      );
    })();
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  // Keep the chosen tab visible in the swipeable tab row.
  useEffect(() => {
    try {
      document.querySelector('.admin-tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    } catch {
      /* old browsers */
    }
  }, [tab, records]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  if (access !== 'ok') {
    return (
      <main className="screen admin">
        <AdminHeader title="Kartenverwaltung" onBack={onBack} />
        <div className="admin-empty">
          {access === 'checking' ? <p>Zugang wird geprüft …</p> : (
            <>
              <p className="admin-lock" aria-hidden="true">🔒</p>
              <h2>Kein Zugriff</h2>
              <p className="muted">Die Kartenverwaltung ist nur für Administratoren dieser Spielseite (Besitzer oder Editor auf claude.ai).</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const allIds = [...BUILTIN_CARDS.map((c) => c.id), ...(records ?? []).map((r) => r.id)];

  if (editing) {
    return (
      <CardEditor
        key={editing.draft.id}
        db={db!}
        assets={assets}
        draft={editing.draft}
        original={editing.original}
        records={records ?? []}
        onToast={setToast}
        toast={toast}
        onClose={() => setEditing(null)}
        onDuplicate={(rec) => setEditing({ draft: duplicateRecord(rec, nextCardId(allIds)), original: null })}
      />
    );
  }

  const open = (rec: CardRecord) => setEditing({ draft: { ...rec }, original: rec });
  return (
    <main className="screen admin">
      <AdminHeader title="Kartenverwaltung" onBack={onBack} right={<span className="pill">{records?.length ?? '…'} Karten</span>} />
      {records && records.length > 0 && (
        <div className="admin-tabs" role="tablist">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`admin-tab admin-tab-${t} ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      {(tab === 'cards' || !records || records.length === 0) && (
        <CardList
          records={records}
          db={db!}
          onToast={setToast}
          onNew={() => setEditing({ draft: newRecord(nextCardId(allIds)), original: null })}
          onOpen={open}
        />
      )}
      {tab === 'balance' && records && records.length > 0 && <BalanceView records={records} db={db!} onToast={setToast} onOpen={open} />}
      {tab === 'runner' && records && records.length > 0 && (
        settings ? (
          <RunnerSettingsView
            records={records}
            db={db!}
            saved={settings}
            onToast={setToast}
            onSaved={(s) => {
              setSettings(s);
              onSettingsChange(s);
            }}
          />
        ) : <p className="muted center">Einstellungen werden geladen …</p>
      )}
      {tab === 'arenas' && records && records.length > 0 && <ArenaView db={db!} onToast={setToast} />}
      {tab === 'designs' && records && records.length > 0 && <DesignerView db={db!} assets={assets} onToast={setToast} onDesignsChange={onDesignsChange} />}
      {tab === 'cardstyle' && <CardStyleView />}
      {tab === 'runes' && records && records.length > 0 && settings && (
        <RunesView db={db!} assets={assets} settings={settings} campaign={campaign} onToast={setToast}
          onSettingsSaved={(s) => {
            setSettings(s);
            onSettingsChange(s);
          }} />
      )}
      {tab === 'campaign' && records && records.length > 0 && <CampaignView db={db!} assets={assets} onToast={setToast} onCampaignChange={onCampaignChange} onTest={onTestCampaign} />}
      {toast && <div className="admin-toast" role="status">{toast}</div>}
    </main>
  );
}

function AdminHeader({ title, onBack, right, back }: { title: string; onBack: () => void; right?: ReactNode; back?: ReactNode }) {
  return (
    <header className="topbar admin-topbar">
      {back ?? <button type="button" className="btn btn-small" onClick={onBack}>◀ Zurück</button>}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}

// ---------------------------------------------------------------- list

function CardList({ records, db, onToast, onNew, onOpen }: {
  records: CardRecord[] | null;
  db: Db;
  onToast: (m: string) => void;
  onNew: () => void;
  onOpen: (rec: CardRecord) => void;
}) {
  const [query, setQuery] = useState('');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [status, setStatus] = useState<CardStatus | 'all'>('all');
  const [cls, setCls] = useState<CardClass | 'all' | 'effect'>('all');
  const [sort, setSort] = useState<SortKey>('rarity');
  const [importing, setImporting] = useState<number | null>(null);

  const counts = useMemo(() => {
    const c: Record<CardStatus, number> = { draft: 0, active: 0, disabled: 0 };
    for (const r of records ?? []) c[r.status]++;
    return c;
  }, [records]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (records ?? []).filter((r) =>
      (rarity === 'all' || r.rarity === rarity) &&
      (status === 'all' || r.status === status) &&
      (cls === 'all' || (cls === 'effect' ? r.effect !== null : r.cls === cls)) &&
      (!q || r.name.toLowerCase().includes(q) || r.id.includes(q) || r.description.toLowerCase().includes(q) ||
        (r.effect !== null && EFFECTS[r.effect].name.toLowerCase().includes(q))),
    );
    const cmp: Record<SortKey, (a: CardRecord, b: CardRecord) => number> = {
      id: (a, b) => a.id.localeCompare(b.id),
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
      rarity: (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.id.localeCompare(b.id),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    };
    return list.sort(cmp[sort]);
  }, [records, query, rarity, status, cls, sort]);

  async function importBuiltin() {
    const list = builtinRecords();
    setImporting(0);
    try {
      for (let i = 0; i < list.length; i++) {
        await saveCardRecord(db, list[i]);
        setImporting(i + 1);
      }
      onToast(`${list.length} Karten übernommen ✓`);
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setImporting(null);
    }
  }

  return (
    <>
      {records === null && <div className="admin-empty"><p>Karten werden geladen …</p></div>}

      {records?.length === 0 && (
        <div className="admin-empty">
          <h2>Die Datenbank ist noch leer</h2>
          <p className="muted">Übernimm die 100 Karten, die bisher fest im Spiel eingebaut sind. Danach kannst du sie hier bearbeiten.</p>
          <button type="button" className="btn btn-primary" disabled={importing !== null} onClick={importBuiltin}>
            {importing === null ? '100 vorhandene Karten übernehmen' : `Übernehme … ${importing}/100`}
          </button>
        </div>
      )}

      {records && records.length > 0 && (
        <>
          <div className="admin-toolbar">
            <input
              id="admin-search"
              className="admin-input"
              type="search"
              placeholder="Suchen: Name, ID oder Beschreibung"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Karten durchsuchen"
            />
            <button type="button" className="btn btn-primary" onClick={onNew}>＋ Neue Karte</button>
          </div>
          <div className="chips" role="group" aria-label="Status-Filter">
            {(['all', ...STATUSES] as const).map((s) => (
              <button key={s} type="button" className={`chip ${status === s ? 'active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
                {s === 'all' ? `Alle ${records.length}` : `${STATUS_LABEL[s]} ${counts[s]}`}
              </button>
            ))}
          </div>
          <div className="admin-filters">
            <label>
              <span>Seltenheit</span>
              <select id="admin-rarity" className="admin-input" value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
                <option value="all">Alle</option>
                {RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}
              </select>
            </label>
            <label>
              <span>Klasse</span>
              <select id="admin-class" className="admin-input" value={cls} onChange={(e) => setCls(e.target.value as CardClass | 'all' | 'effect')}>
                <option value="all">Alle</option>
                <option value="effect">✨ Nur mit Effekt</option>
                {CLASSES.map((c) => <option key={c} value={c}>{CLASS_INFO[c].icon} {CLASS_INFO[c].label}</option>)}
              </select>
            </label>
            <label>
              <span>Sortierung</span>
              <select id="admin-sort" className="admin-input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="rarity">Seltenheit</option>
                <option value="name">Name</option>
                <option value="id">ID</option>
                <option value="updated">Zuletzt geändert</option>
              </select>
            </label>
          </div>
          {counts.active < MIN_ACTIVE_CARDS && (
            <p className="admin-warning">⚠️ Nur {counts.active} aktive Karten. Das Spiel braucht mindestens {MIN_ACTIVE_CARDS} – bis dahin nutzt es die eingebauten Karten.</p>
          )}
          <div className="scroll">
            {shown.length === 0 && <p className="muted center">Keine Karte passt zu Suche und Filtern.</p>}
            <ul className="admin-list">
              {shown.map((r) => (
                <li key={r.id}>
                  <button type="button" className="admin-row" onClick={() => onOpen(r)}>
                    <span className="admin-thumb"><Card id={r.id} def={recordToCard(r)} size="xs" /></span>
                    <span className="admin-row-main">
                      <strong>{r.name}</strong>
                      <span className="admin-row-meta">
                        <span className="mono">{r.id}</span> · <span className={`rarity-text rarity-${r.rarity}`}>{RARITY_LABEL[r.rarity]}</span>
                        {' '}· {CLASS_INFO[r.cls].icon} {CLASS_INFO[r.cls].label}{r.effect ? ` · ✨ ${EFFECTS[r.effect].name}` : ''}
                      </span>
                      <span className="admin-row-values">⬆{r.top} ➡{r.right} ⬇{r.bottom} ⬅{r.left} · <b>Σ {cardSum(r).toLocaleString('de-DE')}</b>{r.imageId ? ' · 🖼️' : ''}{!r.inRunner ? ' · 🚫' : ''}{r.rewardOnly ? ' · 🏆' : ''}</span>
                    </span>
                    <span className={`status-pill status-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- editor

function CardEditor({ db, assets, draft: initial, original, records, toast, onToast, onClose, onDuplicate }: {
  db: Db;
  assets: Assets | null;
  draft: CardRecord;
  original: CardRecord | null;
  records: CardRecord[];
  toast: string;
  onToast: (m: string) => void;
  onClose: () => void;
  onDuplicate: (rec: CardRecord) => void;
}) {
  const [draft, setDraft] = useState<CardRecord>(initial);
  const [busy, setBusy] = useState<'' | 'saving' | 'uploading' | 'deleting'>('');
  const [saved, setSaved] = useState<CardRecord | null>(original);
  const uploaded = useRef<string[]>([]);
  const preview = recordToCard(draft);
  const hint = powerHint(draft);
  // Compare against the other active cards of the same rarity (this card counted as active).
  const balance = useMemo(
    () => balanceReport([...records.filter((r) => r.id !== draft.id), { ...draft, status: 'active' }]).cards.get(draft.id)!,
    [records, draft],
  );
  const nameOk = draft.name.trim().length > 0;
  const dirty = !saved || JSON.stringify({ ...draft, updatedAt: '' }) !== JSON.stringify({ ...saved, updatedAt: '' });

  const set = <K extends keyof CardRecord>(key: K, value: CardRecord[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setValue = (k: ValueKey, v: number) => set(k, Math.min(10, Math.max(1, Math.round(v) || 1)));
  // An effect always belongs to the class: changing the class removes an effect of another class.
  const setClass = (cls: CardClass) => setDraft((d) => ({ ...d, cls, effect: d.effect && effectFitsClass(d.effect, cls) ? d.effect : null }));
  const effect = draft.effect ? EFFECTS[draft.effect] : null;
  const fxPreview = draft.effect ? effectPreview([draft.top, draft.right, draft.bottom, draft.left], draft.effect) : null;

  /**
   * Deletes a picture only if no other card uses it (duplicates share pictures) and the
   * new state of this card (`current`, null when deleted) does not either.
   */
  async function cleanupImage(imageId: string | null, current: CardRecord | null) {
    if (!assets || !imageId) return;
    const inUse = records.some((r) => r.imageId === imageId && r.id !== initial.id) || current?.imageId === imageId;
    if (!inUse) await assets.delete(imageId).catch(() => undefined);
  }

  async function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !assets) return;
    setBusy('uploading');
    try {
      const blob = await prepareCardImage(file);
      const res = await assets.upload(blob, { type: 'image/jpeg' });
      uploaded.current.push(res.id);
      set('imageId', res.id);
      onToast('Bild hochgeladen – Speichern nicht vergessen');
    } catch (err) {
      onToast((err as Error)?.message === 'image_decode' ? 'Dieses Bild konnte nicht gelesen werden.' : describeError(err));
    } finally {
      setBusy('');
    }
  }

  async function save() {
    if (!nameOk || busy) return;
    setBusy('saving');
    const rec: CardRecord = { ...draft, name: draft.name.trim(), updatedAt: new Date().toISOString() };
    try {
      await saveCardRecord(db, rec);
      const before = saved;
      setSaved(rec);
      setDraft(rec);
      // Remove pictures that were replaced or uploaded and then discarded.
      const candidates = new Set([...(before?.imageId ? [before.imageId] : []), ...uploaded.current]);
      candidates.delete(rec.imageId ?? '');
      uploaded.current = [];
      for (const id of candidates) await cleanupImage(id, rec);
      onToast(rec.status === 'active' ? 'Gespeichert ✓ – die Karte ist im Spiel' : 'Gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!saved) return;
    setBusy('deleting');
    try {
      await deleteCardRecord(db, saved.id);
      await cleanupImage(saved.imageId, null);
      for (const id of uploaded.current) await cleanupImage(id, null);
      onToast(`„${saved.name}“ gelöscht`);
      onClose();
    } catch (e) {
      onToast(describeError(e));
      setBusy('');
    }
  }

  async function close() {
    // Pictures uploaded in this session but never saved are removed again.
    for (const id of uploaded.current) if (id !== saved?.imageId) await cleanupImage(id, saved);
    onClose();
  }

  return (
    <main className="screen admin admin-editor">
      <AdminHeader
        title={saved ? 'Karte bearbeiten' : 'Neue Karte'}
        onBack={close}
        back={<ConfirmButton label="◀ Zurück" ariaLabel="Zurück zur Liste" confirmLabel="Verwerfen?" onConfirm={close} skipConfirm={!dirty} />}
        right={<span className="pill mono">{draft.id}</span>}
      />
      <div className="scroll">
        <div className="editor-grid">
          <section className="editor-preview" aria-label="Live-Vorschau">
            <Card id={draft.id} def={preview} size="lg" />
            <p className="preview-name">{draft.name || 'Ohne Namen'}</p>
            <div className="preview-owners">
              <div><Card id={draft.id} def={preview} size="sm" owner="player" /><span>Deine Karte</span></div>
              <div><Card id={draft.id} def={preview} size="sm" owner="cpu" /><span>Gegner</span></div>
            </div>
            {draft.description && <p className="card-description">{draft.description}</p>}
          </section>

          <section className="editor-form">
            <label className="field">
              <span>Kartenname *</span>
              <input id="card-name" className="admin-input" value={draft.name} maxLength={NAME_MAX} placeholder="z. B. Glutdrache" onChange={(e) => set('name', e.target.value)} />
              {!nameOk && <small className="field-error">Bitte einen Namen eingeben.</small>}
            </label>

            <div className="field">
              <span>Bild</span>
              <div className="image-row">
                {assets ? (
                  <label className={`btn btn-small ${busy === 'uploading' ? 'disabled' : ''}`}>
                    {busy === 'uploading' ? 'Lädt hoch …' : draft.imageId ? '📷 Bild ersetzen' : '📷 Bild hochladen'}
                    <input id="card-image" type="file" accept="image/*" hidden disabled={busy === 'uploading'} onChange={onPickImage} />
                  </label>
                ) : <small className="muted">Bild-Upload ist in dieser Ansicht nicht verfügbar.</small>}
                {draft.imageId && <button type="button" className="btn btn-small" onClick={() => set('imageId', null)}>Bild entfernen</button>}
              </div>
              <small className="muted">Foto aus der Mediathek oder Kamera. Es wird automatisch auf das Kartenformat 3:4 zugeschnitten.</small>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Symbol (ohne Bild)</span>
                <input id="card-art" className="admin-input emoji-input" value={draft.art} maxLength={8} onChange={(e) => set('art', e.target.value)} />
              </label>
              <label className="field grow">
                <span>Hintergrundfarbe</span>
                <input id="card-hue" type="range" min={0} max={359} value={draft.hue} onChange={(e) => set('hue', Number(e.target.value))} className="hue-slider" />
              </label>
            </div>

            <div className="field">
              <span>Seltenheit</span>
              <div className="segmented" role="radiogroup" aria-label="Seltenheit">
                {RARITIES.map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={draft.rarity === r} className={`seg rarity-seg-${r} ${draft.rarity === r ? 'active' : ''}`} onClick={() => set('rarity', r)}>
                    {RARITY_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span>Klasse</span>
              <div className="segmented class-seg" role="radiogroup" aria-label="Klasse">
                {CLASSES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={draft.cls === c} className={`seg ${draft.cls === c ? 'active' : ''}`} onClick={() => setClass(c)}>
                    <span aria-hidden="true">{CLASS_INFO[c].icon}</span> {CLASS_INFO[c].label}
                  </button>
                ))}
              </div>
              <small className="muted">{CLASS_INFO[draft.cls].focus}. Die Klasse allein gibt keinen Bonus.</small>
            </div>

            <label className="field">
              <span>Spezialeffekt</span>
              <select id="card-effect" className="admin-input" value={draft.effect ?? ''} onChange={(e) => set('effect', (e.target.value || null) as EffectId | null)}>
                <option value="">Kein Spezialeffekt</option>
                {effectsForClass(draft.cls).map((e) => <option key={e.id} value={e.id}>{e.name} (Stärke +{e.value.toLocaleString('de-DE')})</option>)}
              </select>
              {effect ? (
                <div className="effect-box">
                  <p><strong>✨ {effect.name}</strong> · {effect.trigger === 'play' ? 'wirkt einmal beim Ausspielen' : 'wirkt, solange die Bedingung erfüllt ist'}</p>
                  <p>{effect.text}</p>
                  {fxPreview && (
                    <p className="effect-preview">
                      {fxPreview.situation}: ⬆{fxPreview.values[0]} ➡{fxPreview.values[1]} ⬇{fxPreview.values[2]} ⬅{fxPreview.values[3]}
                      {' '}<span className="muted">(statt ⬆{draft.top} ➡{draft.right} ⬇{draft.bottom} ⬅{draft.left})</span>
                      {fxPreview.note && <><br />{fxPreview.note}</>}
                    </p>
                  )}
                  <small className="muted">Für das Balancing zählt der Effekt wie +{effect.value.toLocaleString('de-DE')} Wertpunkte (gemessen in Testduellen).</small>
                </div>
              ) : (
                <small className="muted">Nur Effekte der Klasse „{CLASS_INFO[draft.cls].label}“ stehen zur Auswahl.</small>
              )}
            </label>

            <div className="field">
              <span>Kartenwerte (1–10)</span>
              <div className="value-cross">
                {VALUE_KEYS.map((k) => (
                  <div key={k} className={`stepper stepper-${k}`}>
                    <small>{VALUE_LABEL[k]}</small>
                    <div className="stepper-row">
                      <button type="button" className="btn btn-step" aria-label={`${VALUE_LABEL[k]} verringern`} disabled={draft[k] <= 1} onClick={() => setValue(k, draft[k] - 1)}>−</button>
                      <input
                        id={`card-${k}`}
                        className="admin-input value-input"
                        type="number" inputMode="numeric" min={1} max={10}
                        value={draft[k]}
                        aria-label={VALUE_LABEL[k]}
                        onChange={(e) => setValue(k, Number(e.target.value))}
                      />
                      <button type="button" className="btn btn-step" aria-label={`${VALUE_LABEL[k]} erhöhen`} disabled={draft[k] >= 10} onClick={() => setValue(k, draft[k] + 1)}>+</button>
                    </div>
                  </div>
                ))}
                <div className={`power-badge ${hint.ok ? 'ok' : 'warn'}`}>
                  <strong>Σ {hint.total.toLocaleString('de-DE')}</strong>
                  <small>{hint.effect > 0 ? `${hint.sum} + Effekt ${hint.effect.toLocaleString('de-DE')} · ` : ''}empfohlen {hint.min}–{hint.max}</small>
                </div>
              </div>
              {!hint.ok && (
                <small className="field-warn">Hinweis: Für „{RARITY_LABEL[draft.rarity]}“ liegt die Stärke (Summe der vier Werte{hint.effect > 0 ? ' plus Effekt' : ''}) im Spiel sonst bei {hint.min}–{hint.max}. Speichern ist trotzdem möglich.</small>
              )}
              {balance.flag && balance.avg !== null && (
                <small className="field-warn balance-warn">
                  ⚠️ Auffällig {balance.flag === 'strong' ? 'stark' : 'schwach'}: Gesamtpunktzahl {hint.total.toLocaleString('de-DE')}, die anderen aktiven „{RARITY_LABEL[draft.rarity]}“-Karten haben im Schnitt {balance.avg.toLocaleString('de-DE')} ({balance.diff > 0 ? '+' : ''}{balance.diff.toLocaleString('de-DE')}).
                </small>
              )}
            </div>

            <label className="field">
              <span>Beschreibung (optional)</span>
              <textarea id="card-description" className="admin-input" rows={3} maxLength={DESCRIPTION_MAX} value={draft.description} placeholder="Kurzer Text, der in der Kartenansicht erscheint" onChange={(e) => set('description', e.target.value)} />
              <small className="muted">{draft.description.length}/{DESCRIPTION_MAX}</small>
            </label>

            <div className="field">
              <span>Status</span>
              <div className="segmented" role="radiogroup" aria-label="Status">
                {STATUSES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={draft.status === s} className={`seg status-seg-${s} ${draft.status === s ? 'active' : ''}`} onClick={() => set('status', s)}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <small className="muted">{STATUS_HINT[draft.status]}</small>
            </div>

            <div className="field">
              <span>Lauf &amp; Belohnung</span>
              <label className="toggle toggle-left">
                <input id="card-in-runner" type="checkbox" checked={draft.inRunner} onChange={(e) => set('inRunner', e.target.checked)} />
                <span>Darf im Lauf als neue Karte erscheinen (Finaltor)</span>
              </label>
              <label className="toggle toggle-left">
                <input id="card-reward-only" type="checkbox" checked={draft.rewardOnly} onChange={(e) => set('rewardOnly', e.target.checked)} />
                <span>Nur durch Belohnung freischaltbar (nicht in Booster-Packs)</span>
              </label>
              {draft.rewardOnly && !draft.inRunner && (
                <small className="field-warn">⚠️ So kann niemand diese Karte bekommen: Sie ist „nur Belohnung“, darf aber nicht im Lauf erscheinen.</small>
              )}
            </div>
          </section>
        </div>
      </div>

      <footer className="bottombar editor-actions">
        <button type="button" className="btn btn-primary" disabled={!nameOk || !dirty || busy !== ''} onClick={save}>
          {busy === 'saving' ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}
        </button>
        {saved && <button type="button" className="btn" disabled={busy !== ''} onClick={() => onDuplicate(saved)}>Duplizieren</button>}
        {saved && <ConfirmButton label="🗑 Löschen" ariaLabel="Karte löschen" confirmLabel="Wirklich löschen?" onConfirm={remove} />}
      </footer>
      {toast && <div className="admin-toast" role="status">{toast}</div>}
    </main>
  );
}
