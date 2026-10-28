// Admin dashboard: strength overview (balancing) and runner settings.
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { RARITIES, RARITY_LABEL, RARITY_ORDER, RARITY_POWER, Rarity } from '../game/cards';
import { CardRecord, OUTLIER_THRESHOLD, STATUS_LABEL, balanceReport, cardSum, recordToCard } from '../game/catalog';
import { Db, describeError, saveCardRecord, saveGameSettings } from '../game/cardStore';
import { DEFAULT_DISCOVERY_SHARES, GameSettings, sharePercents } from '../game/settings';

type SortKey = 'sum-desc' | 'sum-asc' | 'rarity' | 'diff';

const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

// ---------------------------------------------------------------- balancing

export function BalanceView({ records, db, onToast, onOpen }: {
  records: CardRecord[];
  db: Db;
  onToast: (m: string) => void;
  onOpen: (rec: CardRecord) => void;
}) {
  const [sort, setSort] = useState<SortKey>('sum-desc');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const report = useMemo(() => balanceReport(records), [records]);
  const flaggedCount = [...report.cards.values()].filter((c) => c.flag).length;

  const shown = useMemo(() => {
    const list = records.filter((r) => (rarity === 'all' || r.rarity === rarity) && (!onlyFlagged || report.cards.get(r.id)?.flag));
    const sum = (r: CardRecord) => cardSum(r);
    const diff = (r: CardRecord) => Math.abs(report.cards.get(r.id)?.diff ?? 0);
    const cmp: Record<SortKey, (a: CardRecord, b: CardRecord) => number> = {
      'sum-desc': (a, b) => sum(b) - sum(a) || RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity],
      'sum-asc': (a, b) => sum(a) - sum(b) || RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity],
      rarity: (a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || sum(b) - sum(a),
      diff: (a, b) => diff(b) - diff(a) || sum(b) - sum(a),
    };
    return list.sort(cmp[sort]);
  }, [records, rarity, onlyFlagged, sort, report]);

  async function toggleInGame(rec: CardRecord) {
    const status = rec.status === 'active' ? 'disabled' : 'active';
    setBusy(rec.id);
    try {
      await saveCardRecord(db, { ...rec, status, updatedAt: new Date().toISOString() });
      onToast(status === 'active' ? `„${rec.name}“ ist wieder im Spiel` : `„${rec.name}“ vorübergehend aus dem Spiel genommen`);
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scroll admin-balance">
      <section className="stats-table" aria-label="Stärke je Seltenheit">
        <div className="stats-row stats-head">
          <span>Seltenheit</span><span>Aktiv</span><span>Ø Σ</span><span>Min–Max</span><span>Empfohlen</span>
        </div>
        {RARITIES.map((r) => {
          const st = report.stats[r];
          return (
            <div key={r} className="stats-row">
              <span className={`rarity-text rarity-${r}`}>{RARITY_LABEL[r]}</span>
              <span>{st.count}</span>
              <span>{st.count ? fmt(st.avg) : '–'}</span>
              <span>{st.count ? `${st.min}–${st.max}` : '–'}</span>
              <span className="muted">{RARITY_POWER[r][0]}–{RARITY_POWER[r][1]}</span>
            </div>
          );
        })}
      </section>
      <p className="muted small">
        Σ = Gesamtpunktzahl (Summe der vier Werte). ⚠️ markiert Karten, die {OUTLIER_THRESHOLD} oder mehr Punkte stärker oder schwächer sind als der Durchschnitt der anderen aktiven Karten ihrer Seltenheit.
      </p>

      <div className="admin-filters">
        <label>
          <span>Sortierung</span>
          <select id="balance-sort" className="admin-input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="sum-desc">Stärkste zuerst</option>
            <option value="sum-asc">Schwächste zuerst</option>
            <option value="rarity">Seltenheit</option>
            <option value="diff">Größte Abweichung</option>
          </select>
        </label>
        <label>
          <span>Seltenheit</span>
          <select id="balance-rarity" className="admin-input" value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
            <option value="all">Alle</option>
            {RARITIES.map((r) => <option key={r} value={r}>{RARITY_LABEL[r]}</option>)}
          </select>
        </label>
      </div>
      <label className="toggle toggle-left">
        <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
        <span>Nur auffällige Karten ({flaggedCount})</span>
      </label>

      {shown.length === 0 && <p className="muted center">{onlyFlagged ? 'Keine auffälligen Karten – das Balancing passt. ✓' : 'Keine Karten.'}</p>}
      <ul className="admin-list balance-list">
        {shown.map((r) => {
          const b = report.cards.get(r.id)!;
          return (
            <li key={r.id} className={`balance-row ${b.flag ? `flag-${b.flag}` : ''}`}>
              <button type="button" className="balance-open" onClick={() => onOpen(r)} aria-label={`${r.name} bearbeiten`}>
                <span className="admin-thumb"><Card id={r.id} def={recordToCard(r)} size="xs" /></span>
                <span className="admin-row-main">
                  <strong>{r.name}</strong>
                  <span className="admin-row-meta">
                    <span className={`rarity-text rarity-${r.rarity}`}>{RARITY_LABEL[r.rarity]}</span>
                    {b.avg !== null && <> · Ø {fmt(b.avg)} · {b.diff > 0 ? '+' : ''}{fmt(b.diff)}</>}
                  </span>
                  <span className="flag-chips">
                    {b.flag && <span className={`chip-mini warn`}>⚠️ {b.flag === 'strong' ? 'auffällig stark' : 'auffällig schwach'}</span>}
                    {!r.inRunner && <span className="chip-mini">🚫 nicht im Lauf</span>}
                    {r.rewardOnly && <span className="chip-mini">🏆 nur Belohnung</span>}
                    {r.status !== 'active' && <span className={`chip-mini status-${r.status}`}>{STATUS_LABEL[r.status]}</span>}
                  </span>
                </span>
                <span className="sum-badge">Σ {b.sum.toLocaleString('de-DE')}</span>
              </button>
              {r.status !== 'draft' && (
                <button type="button" className="btn btn-small btn-pause" disabled={busy === r.id} onClick={() => toggleInGame(r)}>
                  {r.status === 'active' ? '⏸ Aus dem Spiel nehmen' : '▶ Wieder ins Spiel'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- runner settings

export function RunnerSettingsView({ records, db, saved, onToast, onSaved }: {
  records: CardRecord[];
  db: Db;
  saved: GameSettings;
  onToast: (m: string) => void;
  onSaved: (s: GameSettings) => void;
}) {
  const [shares, setShares] = useState<Record<Rarity, number>>({ ...saved.discoveryShares });
  const [busy, setBusy] = useState(false);
  const percents = sharePercents(shares);
  const allZero = RARITIES.every((r) => shares[r] === 0);
  const dirty = RARITIES.some((r) => shares[r] !== saved.discoveryShares[r]);
  const isDefault = RARITIES.every((r) => shares[r] === DEFAULT_DISCOVERY_SHARES[r]);

  const active = records.filter((r) => r.status === 'active');
  const eligible = Object.fromEntries(RARITIES.map((r) => [r, active.filter((c) => c.rarity === r && c.inRunner).length])) as Record<Rarity, number>;
  const notInRunner = active.filter((r) => !r.inRunner).length;
  const rewardOnly = active.filter((r) => r.rewardOnly).length;
  const unobtainable = active.filter((r) => r.rewardOnly && !r.inRunner);
  // Rough chance for at least one card of a rarity among the 3 new cards of the final gate.
  const perRun = (r: Rarity) => Math.round((1 - Math.pow(1 - percents[r] / 100, 3)) * 1000) / 10;

  async function save() {
    if (allZero || busy) return;
    setBusy(true);
    const next: GameSettings = { discoveryShares: { ...shares } };
    try {
      await saveGameSettings(db, next);
      onSaved(next);
      onToast('Lauf-Einstellungen gespeichert ✓');
    } catch (e) {
      onToast(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scroll admin-runner">
      <section className="runner-info">
        <h2>So läuft ein Lauf</h2>
        <p>8 Tore: In <b>Tor 1–7</b> wählt der Spieler Karten aus seinem <b>Deck</b>. Im <b>Finaltor (Tor 8)</b> erscheinen <b>3 neue Karten</b> – die gewählte bekommt er nur bei einem <b>Sieg</b>.</p>
        <p className="muted small">Hier stellst du ein, wie oft welche Seltenheit im Finaltor vorkommt. Die Zahlen sind Gewichte: doppelt so hoch = doppelt so häufig.</p>
      </section>

      <section className="share-list" aria-label="Häufigkeit je Seltenheit">
        {RARITIES.map((r) => (
          <div key={r} className="share-row">
            <div className="share-head">
              <span className={`rarity-text rarity-${r}`}>{RARITY_LABEL[r]}</span>
              <strong>{fmt(percents[r])} %</strong>
            </div>
            <div className="share-controls">
              <input
                id={`share-${r}`}
                type="range" min={0} max={100} step={1}
                value={Math.min(100, shares[r])}
                aria-label={`Gewicht ${RARITY_LABEL[r]}`}
                onChange={(e) => setShares({ ...shares, [r]: Number(e.target.value) })}
              />
              <input
                className="admin-input share-input"
                type="number" inputMode="decimal" min={0} max={100} step={0.5}
                value={shares[r]}
                aria-label={`Gewicht ${RARITY_LABEL[r]} als Zahl`}
                onChange={(e) => setShares({ ...shares, [r]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
              />
            </div>
            <small className={shares[r] > 0 && eligible[r] === 0 ? 'field-warn' : 'muted'}>
              {eligible[r]} {eligible[r] === 1 ? 'Karte' : 'Karten'} im Lauf erlaubt · pro Lauf ca. {fmt(perRun(r))} % Chance auf mind. eine
              {shares[r] > 0 && eligible[r] === 0 ? ' – keine Karte verfügbar, dieser Anteil fällt weg' : ''}
            </small>
          </div>
        ))}
      </section>
      {allZero && <p className="admin-warning">Mindestens eine Seltenheit braucht ein Gewicht über 0.</p>}

      <section className="runner-info">
        <h2>Karten-Regeln</h2>
        <ul className="plain-list">
          <li>🚫 <b>{notInRunner}</b> aktive Karten erscheinen nicht als neue Karte im Lauf.</li>
          <li>🏆 <b>{rewardOnly}</b> aktive Karten gibt es nur als Belohnung (nicht in Booster-Packs).</li>
          {unobtainable.length > 0 && (
            <li className="field-warn">⚠️ {unobtainable.length} Karte(n) sind „nur Belohnung“, dürfen aber nicht in den Lauf – Spieler können sie so nie bekommen: {unobtainable.map((r) => r.name).join(', ')}</li>
          )}
        </ul>
        <p className="muted small">Diese Einstellungen änderst du pro Karte im Karten-Editor oder im Reiter „Balancing“ (Karte antippen).</p>
      </section>

      <footer className="bottombar editor-actions">
        <button type="button" className="btn btn-primary" disabled={!dirty || allZero || busy} onClick={save}>
          {busy ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert ✓'}
        </button>
        <button type="button" className="btn" disabled={isDefault} onClick={() => setShares({ ...DEFAULT_DISCOVERY_SHARES })}>Standardwerte</button>
      </footer>
    </div>
  );
}
