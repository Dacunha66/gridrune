// Admin: board designer and page background. Pictures are uploaded once and never changed; zoom, position and
// the grid layout are stored separately. Drafts change nothing in the game until they are published.
import { CSSProperties, ChangeEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/Card';
import { ConfirmButton } from '../components/ConfirmButton';
import { DesignImage } from '../components/DesignArt';
import { CARDS } from '../game/cards';
import { imageUrl } from '../game/catalog';
import {
  Assets, Db, describeError, loadDesignState, prepareDisplayImage, saveDesign, saveDesignState,
} from '../game/cardStore';
import {
  ACTIVE, BoardLayout, DEFAULT_FIT, DEFAULT_LAYOUT, DESIGNS_COLLECTION, DISPLAY_MAX, DESIGN_NAME_MAX, Design, DesignKind, DesignState, EMPTY_STATE,
  ImageFit, LAYOUT_LIMITS, RECOMMENDED, UPLOAD_MAX_BYTES, ZOOM_MAX, ZOOM_MIN, clampFit, dragFit, layoutVars, newDesign, nextDesignId, parseDesign,
  publish, restorePrevious,
} from '../game/designs';
import { TERRAIN_INFO, Terrain } from '../game/effects';

const KIND_LABEL: Record<DesignKind, string> = { board: 'Spielfeld', page: 'Seitenhintergrund' };
const DEVICES = { iphone: { w: 390, h: 664, label: 'iPhone' }, ipad: { w: 820, h: 1050, label: 'iPad' } } as const;
type Device = keyof typeof DEVICES;

interface Props {
  db: Db;
  assets: Assets | null;
  onToast: (m: string) => void;
  /** Called after publishing so the game uses the new design right away. */
  onDesignsChange: (designs: Design[], state: DesignState) => void;
}

export function DesignerView({ db, assets, onToast, onDesignsChange }: Props) {
  const [designs, setDesigns] = useState<Design[] | null>(null);
  const [state, setState] = useState<DesignState>(EMPTY_STATE);
  const [editing, setEditing] = useState<Design | null>(null);
  const [busy, setBusy] = useState<DesignKind | null>(null);

  useEffect(() => {
    let alive = true;
    loadDesignState(db).then((s) => alive && s && setState(s));
    const unsub = db.collection(DESIGNS_COLLECTION).onSnapshot(
      (snap) => {
        const list = snap.docs.flatMap((d) => {
          const x = d.exists ? parseDesign(d.id, d.data()) : null;
          return x ? [x] : [];
        });
        setDesigns(list.sort((a, b) => a.id.localeCompare(b.id)));
      },
      (e) => onToast(describeError(e)),
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [db, onToast]);

  async function changeState(next: DesignState, message: string, updated?: Design) {
    try {
      await saveDesignState(db, next);
      setState(next);
      // The list may not contain the latest save yet – use the version that was just published.
      const list = (designs ?? []).filter((d) => d.id !== updated?.id).concat(updated ? [updated] : []);
      onDesignsChange(list, next);
      onToast(message);
    } catch (e) {
      onToast(describeError(e));
    }
  }

  async function upload(kind: DesignKind, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !assets) return;
    if (!file.type.startsWith('image/')) return onToast('Bitte eine Bilddatei wählen (JPEG, PNG oder WebP).');
    if (file.size > UPLOAD_MAX_BYTES) return onToast('Das Bild ist größer als 15 MB. Bitte eine kleinere Datei wählen.');
    setBusy(kind);
    try {
      // 1. the original, unchanged; 2. a smaller copy for the game.
      const original = await assets.upload(file, { type: file.type });
      const display = await prepareDisplayImage(file, DISPLAY_MAX[kind]);
      const copy = await assets.upload(display.blob, { type: display.type });
      const d: Design = {
        ...newDesign(nextDesignId((designs ?? []).map((x) => x.id)), kind),
        name: file.name.replace(/\.[^.]+$/, '').slice(0, DESIGN_NAME_MAX) || newDesign('d000', kind).name,
        imageId: original.id, displayId: copy.id, imageW: display.srcW, imageH: display.srcH,
      };
      await saveDesign(db, d);
      onToast('Bild hochgeladen ✓ – jetzt Ausschnitt einstellen');
      setEditing(d);
    } catch (err) {
      onToast((err as Error)?.message === 'image_decode' ? 'Dieses Bild konnte nicht gelesen werden.' : describeError(err));
    } finally {
      setBusy(null);
    }
  }

  if (!designs) return <p className="muted center">Designs werden geladen …</p>;
  if (editing) {
    return (
      <DesignEditor
        key={editing.id}
        db={db}
        initial={editing}
        state={state}
        onToast={onToast}
        onPublish={(d) => changeState(publish(state, d.kind, d.id), `„${d.name}“ ist veröffentlicht ✓`, d)}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="scroll designer">
      {(['board', 'page'] as DesignKind[]).map((kind) => {
        const list = designs.filter((d) => d.kind === kind);
        const current = state[kind];
        const prev = kind === 'board' ? state.boardPrev : state.pagePrev;
        const nameOf = (id: string | null) => (id ? designs.find((d) => d.id === id)?.name ?? id : 'Standard');
        return (
          <section key={kind} className="designer-section">
            <h2>{KIND_LABEL[kind]}</h2>
            <p className="designer-live">Im Spiel: <b>{nameOf(current)}</b></p>
            <div className="designer-actions">
              {prev !== current && (
                <ConfirmButton label={`↺ Zurück zu „${nameOf(prev)}“`} confirmLabel="Wirklich zurück?" onConfirm={() => changeState(restorePrevious(state, kind), `„${nameOf(prev)}“ ist wieder aktiv ✓`)} />
              )}
              {current !== null && (
                <ConfirmButton label="Standard verwenden" confirmLabel="Standard veröffentlichen?" onConfirm={() => changeState(publish(state, kind, null), 'Standard-Design ist wieder aktiv ✓')} />
              )}
            </div>
            <UploadInfo kind={kind} />
            {assets ? (
              <label className={`btn btn-primary btn-wide ${busy ? 'disabled' : ''}`}>
                {busy === kind ? 'Lädt hoch …' : `＋ ${kind === 'board' ? 'Neues Spielfeldbild' : 'Neuen Hintergrund'} hochladen`}
                <input type="file" accept="image/*" hidden disabled={busy !== null} onChange={(e) => upload(kind, e)} />
              </label>
            ) : <p className="muted">Bild-Upload ist in dieser Ansicht nicht verfügbar.</p>}
            <ul className="admin-list">
              <li className="admin-row designer-row standard">
                <span className="designer-thumb standard-thumb" aria-hidden="true" />
                <span className="admin-row-main"><strong>Standard</strong><span className="admin-row-meta">bisheriges Design, immer verfügbar</span></span>
                {current === null && <span className="status-pill status-active">Im Spiel</span>}
              </li>
              {list.map((d) => (
                <li key={d.id}>
                  <button type="button" className="admin-row designer-row" onClick={() => setEditing(d)}>
                    <span className={`designer-thumb ${kind}`}>{d.displayId && <DesignImage src={imageUrl(d.displayId)!} fit={d.fit} />}</span>
                    <span className="admin-row-main">
                      <strong>{d.name}</strong>
                      <span className="admin-row-meta"><span className="mono">{d.id}</span> · {d.imageW} × {d.imageH} px</span>
                    </span>
                    <span className={`status-pill ${d.id === current ? 'status-active' : 'status-draft'}`}>{d.id === current ? 'Im Spiel' : 'Entwurf'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Recommended picture size and why (shown at the upload). */
function UploadInfo({ kind }: { kind: DesignKind }) {
  const r = RECOMMENDED[kind];
  return (
    <details className="upload-info">
      <summary>Empfohlene Bildmaße: {r.w} × {r.h} px</summary>
      <dl>
        <dt>Breite × Höhe</dt><dd>{r.w} × {r.h} Pixel</dd>
        <dt>Seitenverhältnis</dt><dd>{r.ratio}</dd>
        <dt>Dateiformat</dt><dd>JPEG oder WebP (PNG nur bei Transparenz)</dd>
        <dt>Transparenz</dt><dd>{kind === 'board' ? 'Nicht nötig. Durchsichtige Stellen zeigen den dunklen Spielfeld-Hintergrund.' : 'Nicht sinnvoll – der Hintergrund füllt den ganzen Bildschirm.'}</dd>
        <dt>Dateigröße</dt><dd>am besten unter {r.maxMb} MB (höchstens 15 MB)</dd>
      </dl>
      <p className="muted">
        {kind === 'board'
          ? 'Warum: Das Spielfeld besteht aus 4 × 4 Feldern im Kartenformat 3:4 und ist deshalb selbst 3:4. Auf dem iPad ist es bis zu etwa 700 Punkte breit, bei doppelter Bildschärfe also rund 1400 Pixel; iPhones brauchen etwa 1100 Pixel. 1536 Pixel reichen für beide und lassen Spielraum zum Hineinzoomen.'
          : 'Warum: Der Hintergrund füllt den ganzen Bildschirm. Große iPhones haben 1290 × 2796 Pixel; auf dem iPad (3:4) wird automatisch ein passender Ausschnitt gezeigt.'}
        {' '}Bilder mit anderen Maßen sind kein Problem: Der Editor füllt die Fläche automatisch ohne Verzerrung, den Ausschnitt wählst du mit dem Finger. Das Original bleibt unverändert gespeichert; im Spiel wird eine verkleinerte Kopie geladen.
      </p>
    </details>
  );
}

function DesignEditor({ db, initial, state, onToast, onPublish, onClose }: {
  db: Db;
  initial: Design;
  state: DesignState;
  onToast: (m: string) => void;
  onPublish: (d: Design) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Design>(initial);
  const [saved, setSaved] = useState<Design>(initial);
  const [device, setDevice] = useState<Device>('iphone');
  const [compare, setCompare] = useState<'new' | 'old'>('new');
  /** Finger mode: gestures move the picture; off = the page scrolls normally over the preview. */
  const [handMode, setHandMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify({ ...draft, updatedAt: '' }) !== JSON.stringify({ ...saved, updatedAt: '' });
  const live = state[draft.kind] === draft.id;
  const setFit = (fit: ImageFit) => setDraft((d) => ({ ...d, fit: clampFit(fit) }));
  const setLayout = <K extends keyof BoardLayout>(k: K, v: BoardLayout[K]) => setDraft((d) => ({ ...d, layout: { ...d.layout, [k]: v } }));
  const ratio = draft.imageW && draft.imageH ? draft.imageW / draft.imageH : 0;
  const rec = RECOMMENDED[draft.kind];

  async function save(): Promise<Design | null> {
    setBusy(true);
    const d = { ...draft, name: draft.name.trim() || saved.name, updatedAt: new Date().toISOString() };
    try {
      await saveDesign(db, d);
      setSaved(d);
      setDraft(d);
      return d;
    } catch (e) {
      onToast(describeError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  // What the preview shows: the draft, or (to compare) what is in the game right now.
  const shownBoard = draft.kind === 'board' ? (compare === 'new' ? draft : ACTIVE.board) : ACTIVE.board;
  const shownPage = draft.kind === 'page' ? (compare === 'new' ? draft : ACTIVE.page) : ACTIVE.page;

  return (
    <div className="scroll designer-editor">
      <div className="arena-editor-head">
        <ConfirmButton label="◀ Designs" ariaLabel="Zurück zur Liste" confirmLabel="Ungespeichert verwerfen?" onConfirm={onClose} skipConfirm={!dirty} />
        <span className={`status-pill ${live ? 'status-active' : 'status-draft'}`}>{live ? 'Im Spiel' : 'Entwurf'}</span>
      </div>
      <label className="field">
        <span>Name</span>
        <input id="design-name" className="admin-input" value={draft.name} maxLength={DESIGN_NAME_MAX} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </label>
      <p className="muted design-size">
        Dein Bild: {draft.imageW} × {draft.imageH} px{ratio ? ` (Verhältnis ${ratio.toFixed(2).replace('.', ',')})` : ''}.{' '}
        {Math.abs(ratio - rec.w / rec.h) < 0.03
          ? 'Passt genau zur Empfehlung.'
          : 'Anderes Seitenverhältnis als empfohlen – die Fläche wird trotzdem vollständig gefüllt, wähle den Ausschnitt mit dem Finger.'}
        {draft.imageW && draft.imageW < rec.w * 0.6 ? ' Hinweis: Das Bild ist recht klein und kann auf dem iPad unscharf wirken.' : ''}
      </p>

      <div className="segmented preview-switch" role="radiogroup" aria-label="Vorschau">
        {(Object.keys(DEVICES) as Device[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={device === k} className={`seg ${device === k ? 'active' : ''}`} onClick={() => setDevice(k)}>{DEVICES[k].label}</button>
        ))}
        <button type="button" role="radio" aria-checked={compare === 'new'} className={`seg ${compare === 'new' ? 'active' : ''}`} onClick={() => setCompare('new')}>Neu</button>
        <button type="button" role="radio" aria-checked={compare === 'old'} className={`seg ${compare === 'old' ? 'active' : ''}`} onClick={() => setCompare('old')}>Bisher</button>
      </div>
      {compare === 'new' ? (
        <div className="gesture-bar">
          <button type="button" className={`btn btn-small ${handMode ? 'btn-primary' : ''}`} aria-pressed={handMode} onClick={() => setHandMode(!handMode)}>
            {handMode ? '✋ Bild verschieben: an' : '✋ Bild verschieben: aus'}
          </button>
          <span className="muted">{handMode ? `Im ${draft.kind === 'board' ? 'Spielfeld' : 'Bild'}: 1 Finger verschieben, 2 Finger zoomen` : 'Seite scrollt normal'}</span>
        </div>
      ) : <p className="muted center gesture-hint">Zeigt das Design, das gerade im Spiel ist.</p>}
      <DuelPreview
        device={device}
        board={shownBoard}
        page={shownPage}
        editKind={compare === 'new' && handMode ? draft.kind : null}
        fit={draft.fit}
        onFit={setFit}
      />

      <div className="field">
        <span>Bildausschnitt</span>
        <Slider label="Zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={0.01} value={draft.fit.zoom} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setFit({ ...draft.fit, zoom: v })} />
        <Slider label="Horizontal" min={0} max={1} step={0.005} value={draft.fit.px} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setFit({ ...draft.fit, px: v })} />
        <Slider label="Vertikal" min={0} max={1} step={0.005} value={draft.fit.py} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setFit({ ...draft.fit, py: v })} />
        <button type="button" className="btn btn-small" onClick={() => setFit({ ...DEFAULT_FIT })}>Bild zurücksetzen</button>
      </div>

      {draft.kind === 'board' ? (
        <div className="field">
          <span>Spielfeldraster</span>
          <Slider label="Größe" min={LAYOUT_LIMITS.size[0]} max={LAYOUT_LIMITS.size[1]} step={0.01} value={draft.layout.size} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setLayout('size', v)} />
          <Slider label="Position" min={0} max={1} step={0.01} value={draft.layout.offsetY} format={(v) => (v < 0.05 ? 'oben' : v > 0.95 ? 'unten' : `${Math.round(v * 100)} %`)} onChange={(v) => setLayout('offsetY', v)} />
          <Slider label="Feldabstand" min={LAYOUT_LIMITS.gap[0]} max={LAYOUT_LIMITS.gap[1]} step={1} value={draft.layout.gap} format={(v) => `${v} px`} onChange={(v) => setLayout('gap', v)} />
          <Slider label="Rahmen" min={LAYOUT_LIMITS.frame[0]} max={LAYOUT_LIMITS.frame[1]} step={1} value={draft.layout.frame} format={(v) => `${v} px`} onChange={(v) => setLayout('frame', v)} />
          <Slider label="Felder deckend" min={0} max={1} step={0.01} value={draft.layout.cellAlpha} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setLayout('cellAlpha', v)} />
          <label className="toggle toggle-left">
            <input id="design-borders" type="checkbox" checked={draft.layout.cellBorders} onChange={(e) => setLayout('cellBorders', e.target.checked)} />
            <span>Feldumrandungen anzeigen</span>
          </label>
          <button type="button" className="btn btn-small" onClick={() => setDraft({ ...draft, layout: { ...DEFAULT_LAYOUT, cellAlpha: 0.35, cellBorders: true } })}>Raster zurücksetzen</button>
          <small className="muted">Nur die Darstellung ändert sich: Es bleiben immer 4 × 4 Felder an denselben Stellen der Spiellogik, alle Karten liegen auf ihren Feldern.</small>
        </div>
      ) : (
        <div className="field">
          <span>Lesbarkeit</span>
          <Slider label="Abdunklung" min={0} max={0.8} step={0.01} value={draft.page.dim} format={(v) => `${Math.round(v * 100)} %`} onChange={(v) => setDraft({ ...draft, page: { dim: v } })} />
          <small className="muted">Dunkelt das Bild ab, damit Texte und Knöpfe gut lesbar bleiben.</small>
        </div>
      )}

      <div className="editor-actions arena-actions">
        <button type="button" className="btn" disabled={!dirty || busy} onClick={async () => { if (await save()) onToast('Entwurf gespeichert ✓ – im Spiel ändert sich noch nichts'); }}>
          {busy ? 'Speichert …' : dirty ? 'Als Entwurf speichern' : 'Gespeichert ✓'}
        </button>
        <ConfirmButton
          label={live ? (dirty ? '✓ Änderungen veröffentlichen' : 'Ist veröffentlicht') : '✓ Veröffentlichen'}
          confirmLabel="Wirklich veröffentlichen?"
          ariaLabel="Design veröffentlichen"
          onConfirm={async () => {
            if (live && !dirty) return;
            const d = dirty ? await save() : saved;
            if (d) await onPublish(d);
          }}
        />
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, format, onChange }: {
  label: string; min: number; max: number; step: number; value: number; format: (v: number) => string; onChange: (v: number) => void;
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{format(value)}</output>
    </label>
  );
}

// ---------------------------------------------------------------- preview

const SAMPLE_TERRAIN: Partial<Record<number, Terrain>> = { 3: 'eis', 12: 'eis', 5: 'wald', 10: 'wald' };
const SAMPLE_ROCK = 7;

/**
 * A duel screen with sample cards in device size (scaled to the admin width). It uses the same CSS as the real duel,
 * so what you see is what players get. Gestures move/zoom the picture that is being edited.
 */
function DuelPreview({ device, board, page, editKind, fit, onFit }: {
  device: Device;
  board: Design | null;
  page: Design | null;
  editKind: DesignKind | null;
  fit: ImageFit;
  onFit: (f: ImageFit) => void;
}) {
  const dev = DEVICES[device];
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / dev.w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dev.w]);

  const cards = useMemo(() => CARDS.slice(0, 12), []);
  const boardDesign = board;
  const boardSrc = boardDesign ? imageUrl(boardDesign.displayId) : undefined;
  const pageSrc = page ? imageUrl(page.displayId) : undefined;
  const boardFit = boardDesign?.fit ?? DEFAULT_FIT;
  const pageFit = page?.fit ?? DEFAULT_FIT;
  const gestures = usePanZoom(fit, onFit, scale, editKind ? (editKind === 'board' ? boardDesign : page) : null);

  // Sample cells: a few cards for both sides, a bonus, a malus, terrain and the rock.
  const placed: Record<number, { id: string; owner: 'player' | 'cpu'; values?: number[] }> = {};
  [0, 2, 6, 9, 13, 15].forEach((cell, k) => {
    const c = cards[k % cards.length];
    if (!c) return;
    const base = [c.top, c.right, c.bottom, c.left];
    placed[cell] = { id: c.id, owner: k % 2 ? 'cpu' : 'player', values: k === 1 ? base.map((v) => Math.max(1, v - 1)) : k === 2 ? base.map((v) => Math.min(10, v + 1)) : undefined };
  });

  return (
    <div className="preview-wrap" ref={wrapRef} style={{ height: dev.h * scale }}>
      <div
        className={`preview-device app ${page ? 'has-page-art' : ''} ${editKind === 'page' ? 'editing-page' : ''}`}
        style={{ width: dev.w, height: dev.h, transform: `scale(${scale})` }}
        {...(editKind === 'page' ? gestures : {})}
      >
        {pageSrc && page && (
          <div className="preview-page-art" aria-hidden="true">
            <DesignImage src={pageSrc} fit={pageFit} />
            <div className="page-dim" style={{ opacity: page.page.dim }} />
          </div>
        )}
        <main className="screen battle">
          <header className="battle-top">
            <span className="btn btn-small" aria-hidden="true">✕</span>
            <div className="scorebar">
              <span className="score blue">Du 3</span>
              <span className="moves">Zug 7/15</span>
              <span className="score red">3 Gegner</span>
            </div>
            <div className="turn-pill player">Dein Zug</div>
          </header>
          <p className="arena-label">Vorschau: <span className="terrain-chip terrain-eis">{TERRAIN_INFO.eis.icon} Eis</span><span className="terrain-chip terrain-wald">{TERRAIN_INFO.wald.icon} Wald</span></p>
          <div className="play-area">
            <div
              className={`board ${boardSrc ? 'has-art' : ''} ${boardDesign?.layout.cellBorders ? 'cell-borders' : ''} ${editKind === 'board' ? 'editing' : ''}`}
              style={boardDesign ? (layoutVars(boardDesign.layout) as CSSProperties) : undefined}
              {...(editKind === 'board' ? gestures : {})}
            >
              {boardSrc && (
                <div className="board-art" aria-hidden="true"><DesignImage src={boardSrc} fit={boardFit} /></div>
              )}
              {Array.from({ length: 16 }, (_, i) => {
                const t = SAMPLE_TERRAIN[i];
                if (i === SAMPLE_ROCK) return <div key={i} className="cell rock">🪨</div>;
                const p = placed[i];
                return (
                  <div key={i} className={`cell terrain-${t ?? 'normal'}`}>
                    {p ? <Card id={p.id} owner={p.owner} size="sm" values={p.values} /> : t ? <span className="terrain-icon">{TERRAIN_INFO[t].icon}</span> : null}
                  </div>
                );
              })}
            </div>
            <p className="hint">Karte wählen · Feldkarte antippen = Details</p>
            <div className="hand">
              {cards.slice(6, 12).map((c) => <div key={c.id} className="hand-slot"><Card id={c.id} size="sm" /></div>)}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/** One finger moves the picture, two fingers zoom (pointer events work for touch, pen and mouse). */
function usePanZoom(fit: ImageFit, onFit: (f: ImageFit) => void, scale: number, design: Design | null) {
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ dist: number; zoom: number } | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  if (!design) return {};
  const pinchDist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers refuse capture for certain pointers – moving still works without it.
      }
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size === 2) start.current = { dist: pinchDist(), zoom: fitRef.current.zoom };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const last = pointers.current.get(e.pointerId);
      if (!last) return;
      const el = e.currentTarget;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.current.size >= 2 && start.current) {
        const z = start.current.zoom * (pinchDist() / Math.max(1, start.current.dist));
        onFit({ ...fitRef.current, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) });
      } else if (pointers.current.size === 1) {
        // Screen pixels → unscaled preview pixels (the preview is drawn smaller than the device).
        const dx = (e.clientX - last.x) / scale;
        const dy = (e.clientY - last.y) / scale;
        onFit(dragFit(fitRef.current, dx, dy, design.imageW, design.imageH, el.offsetWidth, el.offsetHeight));
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) start.current = null;
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      pointers.current.delete(e.pointerId);
      start.current = null;
    },
  };
}
