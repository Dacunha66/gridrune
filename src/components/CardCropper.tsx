// Choosing the part of a card picture: the picture in the 3:4 card frame, one finger (or the mouse) moves it, two
// fingers zoom, plus a zoom slider. Only the chosen part is uploaded (see prepareCardImage).
import { PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { CARD_ZOOM_MAX, CardCrop, cardCrop } from '../game/cardStore';

export function CardCropper({ file, onDone, onCancel }: { file: Blob; onDone: (crop: CardCrop) => void; onCancel: () => void }) {
  const [url, setUrl] = useState('');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<CardCrop>({ zoom: 1, cx: 0.5, cy: 0.5 });
  const frame = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // The part shown, with the centre kept inside the picture (also stored that way).
  const part = size ? cardCrop(size.w, size.h, crop) : null;
  const fix = (c: CardCrop): CardCrop => {
    if (!size) return c;
    const p = cardCrop(size.w, size.h, c);
    return { zoom: Math.min(CARD_ZOOM_MAX, Math.max(1, c.zoom)), cx: (p.sx + p.sw / 2) / size.w, cy: (p.sy + p.sh / 2) / size.h };
  };
  const update = (c: CardCrop) => setCrop(fix(c));

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function down(e: ReactPointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not every browser allows capturing every pointer; moving still works inside the frame.
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) pinch.current = { dist: dist(), zoom: cropRef.current.zoom };
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    const before = pointers.current.get(e.pointerId);
    if (!before || !size || !frame.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = cropRef.current;
    if (pointers.current.size >= 2 && pinch.current) {
      update({ ...c, zoom: pinch.current.zoom * (dist() / Math.max(1, pinch.current.dist)) });
      return;
    }
    // Moving the finger right shows more of the left side: the centre moves the other way, in picture pixels.
    const p = cardCrop(size.w, size.h, c);
    const perPx = p.sw / frame.current.clientWidth;
    update({ ...c, cx: c.cx - ((e.clientX - before.x) * perPx) / size.w, cy: c.cy - ((e.clientY - before.y) * perPx) / size.h });
  }
  function up(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  const fw = frame.current?.clientWidth ?? 0;
  const scale = part && fw ? fw / part.sw : 0;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Bildausschnitt wählen">
      <div className="modal card-cropper">
        <h2>Bildausschnitt</h2>
        <div ref={frame} className="crop-frame" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {url && (
            <img src={url} alt="" draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={part && scale ? { width: size!.w * scale, height: size!.h * scale, left: -part.sx * scale, top: -part.sy * scale } : { visibility: 'hidden' }} />
          )}
        </div>
        <label className="slider-row">
          <span>Zoom</span>
          <input type="range" min={1} max={CARD_ZOOM_MAX} step={0.01} value={crop.zoom} onChange={(e) => update({ ...crop, zoom: Number(e.target.value) })} />
          <output>{Math.round(crop.zoom * 100)} %</output>
        </label>
        <p className="muted small">1 Finger verschiebt das Bild, 2 Finger zoomen. Was im Rahmen ist, kommt auf die Karte.</p>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>Abbrechen</button>
          <button type="button" className="btn" onClick={() => update({ zoom: 1, cx: 0.5, cy: 0.5 })}>Zurücksetzen</button>
          <button type="button" className="btn btn-primary" disabled={!size} onClick={() => onDone(fix(crop))}>Übernehmen</button>
        </div>
      </div>
    </div>
  );
}
