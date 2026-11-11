// Runenschmiede (a tab of the collection): melt duplicate cards into essences, refine essences, make a wished-for
// card, editions of ended events, missing puzzle fragments and card frames. Signed-in players: every step is done by
// the server (game / events); guests play with the same rules in the browser (no puzzle fragments – events need an account).
import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { CARDS, RARITIES, RARITY_LABEL, Rarity, getCard } from '../game/cards';
import { SaveData } from '../game/storage';
import { CloudSave } from '../game/cloudSave';
import {
  ESSENCE_NAME, FORGE_FRAMES, buyFrame, craftCard, craftEdition, craftableCards, craftableEditions, equipFrame, forgeConfig, frameCost, meltCards,
  meltCount, meltPreview, refineEssence,
} from '../game/forge';
import { forgeRemote } from '../game/adventureApi';
import { EventView, fetchEvents, forgeFragmentRemote } from '../game/puzzleApi';
import { editionThumb } from '../game/editionArt';
import { findEdition } from '../game/puzzles';

const ESSENCE_COLOR: Record<Rarity, [string, string]> = {
  common: ['#e5e7eb', '#6b7280'], uncommon: ['#6ee7b7', '#047857'], rare: ['#67e8f9', '#0e7490'],
  epic: ['#d8b4fe', '#7e22ce'], legendary: ['#fde68a', '#b45309'], mythic: ['#f9a8d4', '#6d28d9'],
};

/** A small glowing essence drop in the colour of its rarity (mythic: rainbow). */
export function Essence({ rarity, className = '' }: { rarity: Rarity; className?: string }) {
  const [light, dark] = ESSENCE_COLOR[rarity];
  const gid = `ess-${rarity}`;
  return (
    <svg className={`essence-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        {rarity === 'mythic' ? (
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fda4af" /><stop offset=".35" stopColor="#fde68a" /><stop offset=".65" stopColor="#67e8f9" /><stop offset="1" stopColor="#c084fc" />
          </linearGradient>
        ) : (
          <radialGradient id={gid} cx=".4" cy=".35" r=".75"><stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor={light} /><stop offset="1" stopColor={dark} /></radialGradient>
        )}
      </defs>
      <path d="M12 2.5c3.6 4.6 6.5 8 6.5 11.6a6.5 6.5 0 0 1-13 0C5.5 10.5 8.4 7.1 12 2.5z" fill={`url(#${gid})`} stroke="rgba(255,255,255,.55)" strokeWidth="1" />
      <ellipse cx="9.6" cy="12.6" rx="1.6" ry="2.4" fill="rgba(255,255,255,.7)" />
    </svg>
  );
}

const Cost = ({ rarity, n }: { rarity: Rarity; n: number }) => <span className="ess-cost"><Essence rarity={rarity} /> {n}</span>;

type Tab = 'melt' | 'craft' | 'more';

export function Forge({ save, onChange, server, onCard }: {
  save: SaveData;
  /** Guests: the new save (the rules run here). */
  onChange: (s: SaveData) => void;
  /** Signed-in: the server does every step and hands back the save. */
  server: { adopt: (c: CloudSave) => void } | null;
  /** Show a card in the collection (after making it). */
  onCard?: (cardId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('melt');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<Rarity>('common');
  const [pick, setPick] = useState<string | null>(null);
  const [melting, setMelting] = useState<{ key: number; gained: Record<Rarity, number> } | null>(null);
  const [events, setEvents] = useState<EventView[] | null>(null);
  const cfg = forgeConfig();
  const e = save.forge.essence;
  const pot = Object.entries(save.forge.melt).filter(([id]) => CARDS.some((c) => c.id === id));
  const potCount = meltCount(save);
  const preview = meltPreview(save);
  const craftable = useMemo(() => craftableCards(save), [save]);
  const editions = craftableEditions(save);

  useEffect(() => {
    if (!melting) return;
    const t = setTimeout(() => setMelting(null), 2200);
    return () => clearTimeout(t);
  }, [melting]);

  // Running events (for fragments) – only with an account, loaded when the "Mehr" tab opens.
  useEffect(() => {
    if (tab !== 'more' || !server || events) return;
    let live = true;
    fetchEvents().then((r) => {
      if (!live) return;
      if (r === 'offline') return setEvents([]);
      if (r.cloud) server.adopt(r.cloud);
      setEvents(r.events.filter((x) => x.phase === 'active'));
    });
    return () => {
      live = false;
    };
  }, [tab, server, events]);

  /** Runs one forge step: on the server for accounts, here for guests. */
  async function run(action: string, args: Record<string, unknown>, local: () => { ok: true; save: SaveData } | { ok: false; reason: string }, done: (result: Record<string, unknown>) => string) {
    if (busy) return;
    if (server) {
      setBusy(true);
      setMessage('Die Schmiede arbeitet …');
      const r = await forgeRemote(action, args);
      setBusy(false);
      if (r.cloud) server.adopt(r.cloud);
      return setMessage(r.ok ? done(r.result) : r.reason);
    }
    const r = local();
    if (!r.ok) return setMessage(r.reason);
    onChange(r.save);
    setMessage(done(r as unknown as Record<string, unknown>));
  }

  const gainedText = (g: Record<Rarity, number>) => RARITIES.filter((r) => g[r] > 0).map((r) => `+${g[r]} ${ESSENCE_NAME[r]}`).join(' · ');

  function meltAll() {
    const gained = preview;
    run('forge-melt', {}, () => meltCards(save), (res) => {
      const g = (res.gained as Record<Rarity, number>) ?? gained;
      setMelting({ key: Date.now(), gained: g });
      return `Eingeschmolzen: ${gainedText(g)}`;
    });
  }
  function meltOne(id: string) {
    run('forge-melt', { cardIds: [id] }, () => meltCards(save, [id]), (res) => `Eingeschmolzen: ${gainedText(res.gained as Record<Rarity, number>)}`);
  }
  function refine(r: Rarity) {
    const to = RARITIES[RARITIES.indexOf(r) + 1];
    run('forge-refine', { rarity: r, times: 1 }, () => refineEssence(save, r, 1), () => `Veredelt: ${cfg.refine} ${ESSENCE_NAME[r]} → 1 ${ESSENCE_NAME[to]}`);
  }
  function craft(id: string) {
    run('forge-craft', { cardId: id }, () => craftCard(save, id), () => {
      setPick(null);
      onCard?.(id);
      return `${getCard(id).name} geschmiedet ✓`;
    });
  }
  function edition(id: string) {
    const ed = findEdition(id);
    run('forge-edition', { editionId: id }, () => craftEdition(save, id), () => `Edition ${ed?.name ?? ''} geschmiedet ✓ – wähle sie in der Kartenansicht.`);
  }
  function frame(id: string) {
    const f = FORGE_FRAMES.find((x) => x.id === id)!;
    if (save.forge.frames.includes(id)) {
      // Owned: only the choice – a setting of this device, saved with the normal sync.
      onChange(equipFrame(save, save.forge.frame === id ? null : id));
      return setMessage(save.forge.frame === id ? 'Rahmen abgelegt' : `${f.name} angelegt ✓`);
    }
    run('forge-frame', { frameId: id }, () => buyFrame(save, id), () => `${f.name} geschmiedet und angelegt ✓`);
  }
  async function fragment(ev: EventView) {
    if (busy) return;
    setBusy(true);
    setMessage('Die Schmiede arbeitet …');
    const r = await forgeFragmentRemote(ev.id);
    setBusy(false);
    if (r.cloud) server?.adopt(r.cloud);
    if (!r.ok) return setMessage(r.reason);
    setEvents((list) => (list ?? []).map((x) => (x.id === ev.id ? r.event : x)));
    setMessage(`Fragment für „${ev.name}“ geschmiedet ✓`);
  }

  const shown = craftable.filter((id) => getCard(id).rarity === filter);

  return (
    <div className="forge">
      <div className="essence-bar" aria-label="Deine Essenzen">
        {RARITIES.map((r) => (
          <span key={r} className={`essence-chip rarity-${r} ${melting && melting.gained[r] > 0 ? 'pop' : ''}`} title={ESSENCE_NAME[r]}>
            <Essence rarity={r} /> <b>{e[r]}</b>
            {melting && melting.gained[r] > 0 && <i key={melting.key} className="ess-plus">+{melting.gained[r]}</i>}
          </span>
        ))}
      </div>
      <div className="segmented forge-tabs" role="tablist">
        {([['melt', 'Schmelzen'], ['craft', 'Wunschkarte'], ['more', 'Mehr']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMessage(''); }}>
            {label}{id === 'melt' && potCount > 0 && <span className="seg-badge">{potCount}</span>}
          </button>
        ))}
      </div>
      <p className="hint" aria-live="polite">{message || {
        melt: 'Doppelte Karten landen hier. Schmilz sie zu Essenzen ein – je seltener die Karte, desto wertvoller die Essenz.',
        craft: 'Wähle eine Karte, die dir noch fehlt, und schmiede sie aus Essenz ihrer Seltenheit.',
        more: 'Verpasste Editionen, fehlende Puzzle-Fragmente und Kartenrahmen.',
      }[tab]}</p>

      <div className="scroll">
        {tab === 'melt' && (
          <>
            <section className={`crucible ${melting ? 'melting' : ''}`} key={melting?.key ?? 0}>
              <div className="crucible-art" aria-hidden="true">
                <span className="crucible-glow" />
                <span className="crucible-pot" />
                {melting && <span className="crucible-sparks" />}
              </div>
              <div className="crucible-text">
                <b>Schmelztiegel</b>
                <small>{potCount === 0 ? 'Leer – doppelte Karten aus Boostern und Belohnungen kommen hierher.' : `${potCount} doppelte Karte${potCount === 1 ? '' : 'n'} · ergibt ${gainedText(preview)}`}</small>
              </div>
              <button type="button" className="btn btn-primary" disabled={potCount === 0 || busy} onClick={meltAll}>Alle einschmelzen</button>
            </section>
            {pot.length > 0 && (
              <div className="card-grid melt-grid">
                {pot.map(([id, n]) => (
                  <div key={id} className="grid-item">
                    <Card id={id} size="md" showName frame={null} edition={null} onClick={() => meltOne(id)} ariaLabel={`${getCard(id).name}, ${n} doppelt – einschmelzen`} />
                    <span className="melt-count">×{n}</span>
                    <span className="melt-gain"><Essence rarity={getCard(id).rarity} /> {n}</span>
                  </div>
                ))}
              </div>
            )}
            <h2 className="section-title">Veredeln <small className="muted">{cfg.refine} → 1 der nächsten Stufe</small></h2>
            <div className="refine-list">
              {RARITIES.slice(0, -1).map((r, i) => {
                const to = RARITIES[i + 1];
                return (
                  <button key={r} type="button" className="refine-row" disabled={busy || e[r] < cfg.refine} onClick={() => refine(r)}>
                    <Cost rarity={r} n={cfg.refine} /> <span className="refine-arrow" aria-hidden="true">→</span> <Cost rarity={to} n={1} />
                    <small>{ESSENCE_NAME[r]} → {ESSENCE_NAME[to]}</small>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {tab === 'craft' && (
          <>
            <div className="chips" role="tablist">
              {RARITIES.map((r) => (
                <button key={r} type="button" role="tab" aria-selected={filter === r} className={`chip ${filter === r ? 'active' : ''}`} onClick={() => setFilter(r)}>
                  {RARITY_LABEL[r]} <span className="muted small">{craftable.filter((id) => getCard(id).rarity === r).length}</span>
                </button>
              ))}
            </div>
            <p className="craft-price">Preis: <Cost rarity={filter} n={cfg.craft[filter]} /> <span className="muted">– du hast {e[filter]}</span></p>
            {shown.length === 0 ? <p className="shop-note">Du hast alle {RARITY_LABEL[filter].toLowerCase()}en Karten.</p> : (
              <div className="card-grid">
                {shown.map((id) => (
                  <div key={id} className={`grid-item blueprint ${e[filter] >= cfg.craft[filter] ? 'affordable' : ''}`}>
                    <Card id={id} size="md" showName frame={null} edition={null} onClick={() => setPick(id)} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'more' && (
          <>
            <h2 className="section-title">Verpasste Editionen <small className="muted">aus beendeten Events</small></h2>
            {editions.length === 0 ? <p className="shop-note">Gerade gibt es keine verpassten Editionen.</p> : (
              <div className="forge-list">
                {editions.map((ed) => (
                  <article key={ed.id} className="forge-item">
                    <span className="forge-thumb">{editionThumb(ed) ? <img src={editionThumb(ed)} alt="" /> : <Card id={ed.cardId} size="sm" edition={ed.id} />}</span>
                    <span className="forge-item-text"><b>{ed.name}</b><small>{getCard(ed.cardId).name}{save.unlocked.includes(ed.cardId) ? '' : ' · Karte fehlt dir noch'}</small></span>
                    <button type="button" className="btn" disabled={busy || e[cfg.edition.rarity] < cfg.edition.cost} onClick={() => edition(ed.id)}><Cost rarity={cfg.edition.rarity} n={cfg.edition.cost} /></button>
                  </article>
                ))}
              </div>
            )}

            <h2 className="section-title">Puzzle-Fragmente <small className="muted">höchstens {cfg.fragment.perStage} pro Stufe</small></h2>
            {!server ? <p className="shop-note">Puzzle-Events gibt es mit einem Konto.</p> : events === null ? <p className="shop-note">Lade Events …</p> : events.length === 0 ? <p className="shop-note">Gerade läuft kein Event.</p> : (
              <div className="forge-list">
                {events.map((ev) => {
                  const left = ev.forge?.left ?? 0;
                  const total = ev.total ?? ev.pieces;
                  return (
                    <article key={ev.id} className="forge-item">
                      <span className="forge-thumb puzzle-mini" aria-hidden="true">🧩</span>
                      <span className="forge-item-text"><b>{ev.name}</b><small>{ev.have.length}/{total} Teile · noch {left} zum Schmieden in dieser Stufe</small></span>
                      <button type="button" className="btn" disabled={busy || left <= 0 || e[cfg.fragment.rarity] < cfg.fragment.cost} onClick={() => fragment(ev)}><Cost rarity={cfg.fragment.rarity} n={cfg.fragment.cost} /></button>
                    </article>
                  );
                })}
              </div>
            )}

            <h2 className="section-title">Kartenrahmen <small className="muted">nur Optik, auf deinen Karten</small></h2>
            <div className="frame-grid">
              {FORGE_FRAMES.map((f) => {
                const own = save.forge.frames.includes(f.id);
                const on = save.forge.frame === f.id;
                const sample = save.deck[0] ?? save.unlocked[0];
                return (
                  <article key={f.id} className={`frame-item ${on ? 'on' : ''}`}>
                    <Card id={sample} size="md" frame={f.id} edition={null} />
                    <b>{f.name}</b>
                    <small className="muted">{f.description}</small>
                    <button type="button" className={`btn ${on ? '' : own ? 'btn-primary' : ''}`} disabled={busy || (!own && e[f.rarity] < frameCost(f))} onClick={() => frame(f.id)}>
                      {own ? (on ? 'Ablegen' : 'Anlegen') : <Cost rarity={f.rarity} n={frameCost(f)} />}
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>

      {pick && (
        <div className="modal-backdrop" onClick={() => setPick(null)} role="dialog" aria-modal="true" aria-label="Wunschkarte schmieden">
          <div className="modal forge-modal" onClick={(ev) => ev.stopPropagation()}>
            <Card id={pick} size="lg" frame={null} edition={null} />
            <h2>{getCard(pick).name}</h2>
            <p className="muted"><span className={`rarity-text rarity-${getCard(pick).rarity}`}>{RARITY_LABEL[getCard(pick).rarity]}</span> · kostet <Cost rarity={getCard(pick).rarity} n={cfg.craft[getCard(pick).rarity]} /> (du hast {e[getCard(pick).rarity]})</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setPick(null)}>Abbrechen</button>
              <button type="button" className="btn btn-primary" disabled={busy || e[getCard(pick).rarity] < cfg.craft[getCard(pick).rarity]} onClick={() => craft(pick)}>Schmieden</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const essenceStyle = (r: Rarity) => ({ '--ess': ESSENCE_COLOR[r][0] }) as CSSProperties;
