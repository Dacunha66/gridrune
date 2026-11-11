// Puzzle-Events for players: the running events, the archive of past ones, the puzzle with its pieces and tasks, and
// the unlock animation. Fragments are given by the server ("events" function) – this screen only shows them.
import { CSSProperties, useEffect, useState } from 'react';
import { Header } from './Header';
import { Card } from '../components/Card';
import { GameIcon } from '../components/GameIcon';
import { Burst } from '../components/Effects';
import { RARITY_LABEL, Rarity, getCard, isCardId } from '../game/cards';
import { imageUrl } from '../game/catalog';
import { CloudSave } from '../game/cloudSave';
import { EventView, StageView, fetchEvents } from '../game/puzzleApi';
import { EditionDef, PERIOD_LABEL, PHASE_LABEL, findEdition, timeLeftText } from '../game/puzzles';
import { editionImage } from '../game/editionArt';
import { RARITY_COLORS } from './Result';

/** Picture of an event's reward (edition picture, else the card picture). */
export function rewardPicture(ev: Pick<EventView, 'reward' | 'image'>): string | undefined {
  if (ev.image && imageUrl(ev.image.id)) return imageUrl(ev.image.id);
  if (!ev.reward) return undefined;
  const e: EditionDef | null = findEdition(ev.reward.editionId) ?? { id: ev.reward.editionId, cardId: ev.reward.cardId, name: ev.reward.name, image: ev.reward.image, frame: ev.reward.frame };
  return editionImage(e) ?? (isCardId(ev.reward.cardId) ? getCard(ev.reward.cardId).image : undefined);
}

export function rewardRarity(ev: Pick<EventView, 'reward'>): Rarity {
  return ev.reward && isCardId(ev.reward.cardId) ? getCard(ev.reward.cardId).rarity : 'rare';
}

// ---------- Stages: rare → epic → legendary → mythic (each stage is its own card puzzle) ----------

export function stagesOf(ev: EventView): StageView[] {
  return ev.stages?.length ? ev.stages : [{ index: 0, offset: 0, pieces: ev.pieces, cols: ev.cols, rows: ev.rows, done: !!ev.completedAt, reward: ev.reward }];
}
/** The stage being collected (or the last one when everything is complete). */
export function activeStage(ev: EventView): StageView {
  const list = stagesOf(ev);
  return list.find((st) => !st.done) ?? list[list.length - 1];
}
/** Pieces of one stage, numbered from 0 within the stage. */
export function stageHave(st: StageView, have: readonly number[]): number[] {
  return have.filter((i) => i >= st.offset && i < st.offset + st.pieces).map((i) => i - st.offset);
}
/** The event shown with one stage's card (for the board, the tile and the unlock). */
export function stageEvent(ev: EventView, st: StageView): EventView {
  return { ...ev, reward: st.reward, image: st.index === 0 ? ev.image : null, pieces: st.pieces, cols: st.cols, rows: st.rows, have: stageHave(st, ev.have), gained: stageHave(st, ev.gained), completedAt: st.done ? ev.completedAt ?? 'done' : null };
}

/** The card picture as a puzzle: collected pieces show the picture, missing ones are dark with a rune. */
export function PuzzleBoard({ picture, cols, rows, pieces, have, fresh = [], big = false, assemble = false }: {
  picture?: string; cols: number; rows: number; pieces: number; have: readonly number[]; fresh?: readonly number[]; big?: boolean; assemble?: boolean;
}) {
  const own = new Set(have);
  return (
    <div className={`puzzle-board ${big ? 'big' : ''} ${assemble ? 'assemble' : ''}`} style={{ '--cols': cols, '--rows': rows } as CSSProperties}
      role="img" aria-label={`Puzzle: ${have.length} von ${pieces} Teilen gesammelt`}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const inPuzzle = i < pieces;
        const shown = !inPuzzle || own.has(i);
        const x = i % cols;
        const y = Math.floor(i / cols);
        const style = {
          backgroundImage: picture ? `url(${picture})` : undefined,
          backgroundSize: `${cols * 100}% ${rows * 100}%`,
          backgroundPosition: `${cols > 1 ? (x / (cols - 1)) * 100 : 0}% ${rows > 1 ? (y / (rows - 1)) * 100 : 0}%`,
          '--i': i, '--dx': x - (cols - 1) / 2, '--dy': y - (rows - 1) / 2,
        } as CSSProperties;
        return (
          <span key={i} className={`puzzle-piece ${shown ? 'on' : 'off'} ${fresh.includes(i) ? 'fresh' : ''}`} style={style}>
            {!shown && <span className="puzzle-lock" aria-hidden="true">ᚱ</span>}
          </span>
        );
      })}
    </div>
  );
}

/** "Karte freigeschaltet!": the pieces come together, the card appears with a glow in its rarity's colour. */
export function UnlockReveal({ ev, reducedMotion, onCard, onCollection, onClose }: {
  ev: Pick<EventView, 'reward' | 'image' | 'cols' | 'rows' | 'pieces'>; reducedMotion: boolean; onCard: () => void; onCollection: () => void; onClose: () => void;
}) {
  const [stage, setStage] = useState<'pieces' | 'card'>(reducedMotion ? 'card' : 'pieces');
  useEffect(() => {
    if (stage !== 'pieces') return;
    const t = setTimeout(() => setStage('card'), 1700);
    return () => clearTimeout(t);
  }, [stage]);
  const rarity = rewardRarity(ev);
  const all = Array.from({ length: ev.pieces }, (_, i) => i);
  return (
    <div className={`unlock-overlay rarity-${rarity}`} role="dialog" aria-modal="true" aria-label="Karte freigeschaltet">
      <div className="unlock-stage">
        {stage === 'pieces' ? (
          <PuzzleBoard picture={rewardPicture({ ...ev, image: null })} cols={ev.cols} rows={ev.rows} pieces={ev.pieces} have={all} big assemble />
        ) : (
          <>
            <div className="unlock-rays" aria-hidden="true" />
            {!reducedMotion && <Burst x="50%" y="38%" colors={RARITY_COLORS[rarity]} count={34} spread={170} />}
            {ev.reward && <div className="unlock-card"><Card id={ev.reward.cardId} size="lg" edition={ev.reward.editionId} /></div>}
            <p className="unlock-title">Karte freigeschaltet!</p>
            {ev.reward && <p className="unlock-name">{isCardId(ev.reward.cardId) ? getCard(ev.reward.cardId).name : ''} – {ev.reward.name}</p>}
            <div className="unlock-actions">
              <button type="button" className="btn btn-primary" onClick={onCard}>Karte ansehen</button>
              <button type="button" className="btn" onClick={onCollection}>Zur Sammlung</button>
              <button type="button" className="btn" onClick={onClose}>Zurück zum Event</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EventTile({ ev: full, onOpen }: { ev: EventView; onOpen: () => void }) {
  const stages = stagesOf(full);
  const st = activeStage(full);
  const ev = stageEvent(full, st);
  const rarity = rewardRarity(ev);
  const done = stages.every((x) => x.done);
  const pct = Math.round((ev.have.length / ev.pieces) * 100);
  return (
    <article className={`event-tile rarity-edge-${rarity} ${done ? 'done' : ''}`}>
      <button type="button" className="event-tile-art" onClick={onOpen} aria-label={`${ev.name} öffnen`}>
        <PuzzleBoard picture={rewardPicture(ev)} cols={ev.cols} rows={ev.rows} pieces={ev.pieces} have={ev.have} />
      </button>
      <div className="event-tile-body">
        <h3>{ev.name}</h3>
        <p className="event-meta">
          <span className={`rarity-text rarity-${rarity}`}>{RARITY_LABEL[rarity]}</span> · Besondere Edition
        </p>
        <p className="event-meta">{ev.phase === 'active' ? <><GameIcon name="hourglass" /> noch {timeLeftText(ev.run.endsAt)}</> : PHASE_LABEL[ev.phase]}</p>
        <div className="event-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
        <p className="event-count">{done ? '✓ Alle Karten freigeschaltet' : `${stages.length > 1 ? `Stufe ${st.index + 1}/${stages.length} · ` : ''}${ev.have.length} / ${ev.pieces} Fragmente`}</p>
        <button type="button" className="btn btn-primary btn-small" onClick={onOpen}>Puzzle ansehen</button>
      </div>
    </article>
  );
}

export function EventDetail({ ev: full, reducedMotion, onBack, onCard, onCollection, test = false }: {
  ev: EventView; reducedMotion: boolean; onBack: () => void; onCard: (cardId: string, editionId: string) => void; onCollection: () => void; test?: boolean;
}) {
  const stages = stagesOf(full);
  // Stages completed with this visit (newest first): their unlock is shown once each.
  const fresh = stages.filter((st) => st.done && stageHave(st, full.gained).length > 0).reverse();
  const [reveals, setReveals] = useState(fresh.map((st) => st.index));
  const [pick, setPick] = useState(activeStage(full).index);
  const st = stages[pick] ?? activeStage(full);
  const ev = stageEvent(full, st);
  const done = st.done;
  const allDone = stages.every((x) => x.done);
  const locked = !done && st.index > activeStage(full).index;
  const rarity = rewardRarity(ev);
  const cardName = ev.reward && isCardId(ev.reward.cardId) ? getCard(ev.reward.cardId).name : '';
  const revealStage = reveals.length ? stages[reveals[0]] : null;
  const closeReveal = () => setReveals(reveals.slice(1));
  return (
    <main className="screen events">
      <Header title={full.name} onBack={onBack} right={<span className="pill">{test ? 'TEST' : PHASE_LABEL[full.phase]}</span>} />
      {revealStage?.reward && (
        <UnlockReveal key={revealStage.index} ev={stageEvent(full, revealStage)} reducedMotion={reducedMotion}
          onCard={() => { setReveals([]); onCard(revealStage.reward!.cardId, revealStage.reward!.editionId); }}
          onCollection={() => { setReveals([]); onCollection(); }} onClose={closeReveal} />
      )}
      <div className="scroll event-detail">
        {stages.length > 1 && (
          <div className="stage-track" role="tablist" aria-label="Stufen">
            {stages.map((x) => {
              const r = x.reward && isCardId(x.reward.cardId) ? getCard(x.reward.cardId).rarity : 'rare';
              const future = !x.done && x.index > activeStage(full).index;
              return (
                <button key={x.index} type="button" role="tab" aria-selected={pick === x.index} className={`stage-chip rarity-edge-${r} ${pick === x.index ? 'active' : ''} ${x.done ? 'done' : ''} ${future ? 'future' : ''}`}
                  onClick={() => setPick(x.index)} aria-label={`Stufe ${x.index + 1}: ${RARITY_LABEL[r]}${x.done ? ', freigeschaltet' : future ? ', noch gesperrt' : ''}`}>
                  {x.reward && <span className="stage-card"><Card id={x.reward.cardId} size="xs" edition={x.reward.editionId} /></span>}
                  <span className={`stage-label rarity-text rarity-${r}`}>{x.done ? '✓ ' : future ? '🔒 ' : ''}{RARITY_LABEL[r]}</span>
                </button>
              );
            })}
          </div>
        )}
        <PuzzleBoard picture={rewardPicture(ev)} cols={ev.cols} rows={ev.rows} pieces={ev.pieces} have={ev.have} fresh={ev.gained} big />
        <div className="event-progress">
          <b>{stages.length > 1 ? `Stufe ${st.index + 1}: ` : ''}{ev.have.length} / {ev.pieces} Fragmente</b>
          <div className="event-bar" aria-hidden="true"><i style={{ width: `${Math.round((ev.have.length / ev.pieces) * 100)}%` }} /></div>
          <span className="muted small">{allDone ? '✓ Alle Karten freigeschaltet' : done ? '✓ Diese Karte ist freigeschaltet' : locked ? `Vorschau – wird frei, sobald Stufe ${st.index} geschafft ist` : full.phase === 'active' ? `Event endet in ${timeLeftText(full.run.endsAt)}` : 'Event beendet – dein Fortschritt bleibt, wenn es wiederkommt.'}</span>
        </div>
        {ev.gained.length > 0 && !done && <p className="event-gained">+{ev.gained.length} neue{ev.gained.length === 1 ? 's' : ''} Fragment{ev.gained.length === 1 ? '' : 'e'}!</p>}

        <section className="event-reward">
          <h2 className="section-title">{stages.length > 1 ? `Belohnung Stufe ${st.index + 1}` : 'Belohnung'}</h2>
          {ev.reward && (
            <div className="event-reward-row">
              <span className={locked ? 'stage-preview' : ''}><Card id={ev.reward.cardId} size="sm" edition={ev.reward.editionId} locked={false} /></span>
              <div>
                <b>{cardName} – {ev.reward.name}</b>
                <p className="small"><span className={`rarity-text rarity-${rarity}`}>{RARITY_LABEL[rarity]}</span> · Besondere Edition</p>
                <p className="muted small">Eigene Illustration – gleiche Werte, Klasse und Fähigkeit wie {cardName}. Kein spielerischer Vorteil.</p>
                {done && <button type="button" className="btn btn-small" onClick={() => onCard(ev.reward!.cardId, ev.reward!.editionId)}>Karte ansehen</button>}
              </div>
            </div>
          )}
          {stages.length > 1 && !allDone && <p className="muted small">Jede geschaffte Stufe schaltet die nächste, seltenere Karte frei. Überzählige Fragmente gehen direkt in die nächste Stufe.</p>}
        </section>

        {ev.description && <p className="event-text">{ev.description}</p>}

        <section>
          <h2 className="section-title">Aufgaben</h2>
          <ul className="event-tasks">
            {ev.tasks.map((t) => (
              <li key={t.id} className={`event-task ${t.claimed ? 'claimed' : t.done ? 'done' : ''}`}>
                <span className="event-task-text">
                  <b>{t.title}</b>
                  <small>{PERIOD_LABEL[t.period]}{(t.steps ?? 1) > 1 ? ` · Stufe ${t.step}/${t.steps}` : ''}{t.description ? ` · ${t.description}` : ''}</small>
                  <span className="event-bar" aria-hidden="true"><i style={{ width: `${Math.round((t.value / t.target) * 100)}%` }} /></span>
                </span>
                <span className="event-task-side">
                  <span className="event-task-count">{t.value}/{t.target}</span>
                  <span className="event-task-reward">{t.claimed ? '✓' : `+${t.fragments}`} <GameIcon name="cards" /></span>
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">Gezählt werden nur Duelle, die der Server geprüft hat. Fragmente kommen automatisch – jedes Teil nur einmal.</p>
        </section>
      </div>
    </main>
  );
}

export function Events({ reducedMotion, onAdopt, onBack, onCard, onCollection }: {
  reducedMotion: boolean; onAdopt: (c: CloudSave) => void; onBack: () => void; onCard: (cardId: string, editionId: string) => void; onCollection: () => void;
}) {
  const [data, setData] = useState<EventView[] | null | 'offline'>(null);
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchEvents().then((r) => {
      if (!alive) return;
      if (r === 'offline') return setData('offline');
      if (r.cloud) onAdopt(r.cloud);
      setData(r.events);
      // A puzzle just completed: open it so the unlock is shown.
      const fresh = r.events.find((e) => stagesOf(e).some((st) => st.done && stageHave(st, e.gained).length > 0));
      if (fresh) setOpen(fresh.id);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ev = Array.isArray(data) ? data.find((e) => e.id === open) : null;
  if (ev) return <EventDetail ev={ev} reducedMotion={reducedMotion} onBack={() => setOpen(null)} onCard={onCard} onCollection={onCollection} />;
  const list = Array.isArray(data) ? data.filter((e) => (tab === 'active' ? e.phase === 'active' : e.phase !== 'active')) : [];
  return (
    <main className="screen events">
      <Header title="Events" onBack={onBack} />
      <div className="segmented shop-tabs events-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'active'} className={`seg ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}><GameIcon name="hourglass" /> Aktuell</button>
        <button type="button" role="tab" aria-selected={tab === 'archive'} className={`seg ${tab === 'archive' ? 'active' : ''}`} onClick={() => setTab('archive')}><GameIcon name="book" /> Archiv</button>
      </div>
      <div className="scroll">
        {data === null && <p className="muted center">Events werden geladen …</p>}
        {data === 'offline' && <p className="shop-note">Keine Verbindung – Events brauchen kurz Internet.</p>}
        {Array.isArray(data) && list.length === 0 && (
          <p className="shop-note">{tab === 'active' ? 'Gerade läuft kein Event. Schau bald wieder vorbei!' : 'Noch keine vergangenen Events.'}</p>
        )}
        <div className="event-list">{list.map((e) => <EventTile key={e.id} ev={e} onOpen={() => setOpen(e.id)} />)}</div>
      </div>
    </main>
  );
}
