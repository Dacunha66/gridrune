// Admin-Statistik: active players per day, how cards and modes do, coins and Runensteine in circulation.
// Only sums over all players (server function "stats"); the verdicts on cards are hints for the balancing.
import { useEffect, useMemo, useState } from 'react';
import { RARITY_LABEL, RARITY_ORDER } from '../game/cards';
import {
  AdminStats, CARD_DELTA, CardRow, LEVEL_LABEL, MIN_CARD_GAMES, cardRows, fetchStats, totalResult, unusedCards, winRate,
} from '../game/stats';

const num = (n: number) => Math.round(n).toLocaleString('de-DE');
const pct = (r: number | null) => (r === null ? '–' : `${Math.round(r * 100)} %`);
const dayLabel = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
};

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <b className="stat-value">{value}</b>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

/** One series as bars over the days; tap (or hover) a bar to read its value. */
function DayBars({ title, points, unit }: { title: string; points: { day: string; value: number }[]; unit: (n: number) => string }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  const shown = sel !== null ? points[sel] : points[points.length - 1];
  return (
    <figure className="day-bars">
      <figcaption>
        <span>{title}</span>
        {shown && <span className="day-bars-read">{dayLabel(shown.day)}: <b>{unit(shown.value)}</b></span>}
      </figcaption>
      <div className="day-bars-plot" role="img" aria-label={`${title}: höchstens ${unit(max)} an einem Tag`}>
        <span className="day-bars-max">{num(max)}</span>
        {points.map((p, i) => (
          <button key={p.day} type="button" className={`day-bar ${sel === i ? 'is-sel' : ''}`} title={`${dayLabel(p.day)}: ${unit(p.value)}`}
            onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} aria-label={`${dayLabel(p.day)}: ${unit(p.value)}`}>
            <span style={{ height: `${(p.value / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div className="day-bars-axis"><span>{points[0] && dayLabel(points[0].day)}</span><span>{points.length > 0 && dayLabel(points[points.length - 1].day)}</span></div>
    </figure>
  );
}

const VERDICT: Record<CardRow['verdict'], string> = { strong: 'evtl. zu stark', weak: 'evtl. zu schwach', normal: 'unauffällig', few: 'zu wenige Spiele' };

/** `load` can be replaced for tests; normally the server function "stats". */
export function StatsAdminView({ load = fetchStats }: { load?: typeof fetchStats } = {}) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AdminStats | 'forbidden' | 'offline' | null>(null);
  const [cardFilter, setCardFilter] = useState<'notable' | 'all'>('notable');
  const [sort, setSort] = useState<'delta' | 'games'>('delta');

  useEffect(() => {
    let alive = true;
    setStats(null);
    load(days).then((s) => {
      if (alive) setStats(s ?? 'offline');
    });
    return () => {
      alive = false;
    };
  }, [days, load]);

  const ready = stats && typeof stats === 'object' ? stats : null;
  const base = useMemo(() => (ready ? totalResult(ready.modes) : null), [ready]);
  const rows = useMemo(() => (ready && base ? cardRows(ready.cards, base) : []), [ready, base]);
  const unused = useMemo(() => (ready ? unusedCards(ready.cards) : []), [ready]);

  const period = (
    <span className="segmented" role="group" aria-label="Zeitraum">
      {[7, 30, 90].map((d) => <button key={d} type="button" className={`seg ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>{d} Tage</button>)}
    </span>
  );

  if (stats === null) return <div className="admin-stats">{period}<p className="muted center">Lädt …</p></div>;
  if (stats === 'forbidden') return <p className="muted center">Die Statistik ist nur für Administratoren.</p>;
  if (stats === 'offline' || !ready || !base) return <div className="admin-stats">{period}<p className="muted center">Die Statistik konnte nicht geladen werden – bitte später noch einmal versuchen.</p></div>;

  const s = ready;
  const shownCards = rows
    .filter((r) => cardFilter === 'all' || r.verdict === 'strong' || r.verdict === 'weak')
    .sort((x, y) => (sort === 'games' ? y.games - x.games : Math.abs(y.delta) - Math.abs(x.delta)) || y.games - x.games);
  const notable = rows.filter((r) => r.verdict === 'strong' || r.verdict === 'weak').length;
  const BUCKETS = ['unter 500', '500 – 1.999', '2.000 – 4.999', 'ab 5.000'];
  const bucketMax = Math.max(1, ...s.economy.buckets);

  return (
    <div className="admin-stats">
      {period}

      <section className="admin-card">
        <h3>Spieler</h3>
        <div className="stat-tiles">
          <Tile label="Konten" value={num(s.players.total)} />
          <Tile label="Heute aktiv" value={num(s.players.today)} />
          <Tile label="Letzte 7 Tage" value={num(s.players.week)} />
          <Tile label="Letzte 30 Tage" value={num(s.players.month)} />
        </div>
        <DayBars title="Aktive Spieler pro Tag" points={s.daily.map((d) => ({ day: d.day, value: d.active }))} unit={(n) => `${num(n)} Spieler`} />
        <DayBars title="Geprüfte Spiele pro Tag" points={s.daily.map((d) => ({ day: d.day, value: d.games }))} unit={(n) => `${num(n)} ${n === 1 ? 'Spiel' : 'Spiele'}`} />
        <p className="muted small">Aktiv = mit Konto gespielt, gechattet, Erfolge abgeholt oder (ab heute gezählt) das Spiel geöffnet. Neue Konten im Zeitraum: {num(s.daily.reduce((n, d) => n + d.new, 0))}.</p>
      </section>

      <section className="admin-card">
        <h3>Modi und KI-Stufen</h3>
        <p className="muted small">Siegquote der Spieler (Unentschieden zählen halb). Liegt sie gegen die KI auf „Schwer“ sehr hoch, ist die KI vielleicht zu leicht.</p>
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead><tr><th>Modus</th><th className="n">Spiele</th><th className="n">S / U / N</th><th className="n">Siegquote</th></tr></thead>
            <tbody>
              {s.modes.map((m) => (
                <tr key={`${m.mode}-${m.level}`}>
                  <td>{m.mode}{m.mode === 'Einfaches Spiel' ? ` · ${m.level ? LEVEL_LABEL[m.level] ?? m.level : 'ältere Spiele'}` : ''}</td>
                  <td className="n">{num(m.games)}</td>
                  <td className="n">{m.wins} / {m.draws} / {m.losses}</td>
                  <td className="n">{pct(winRate(m))}</td>
                </tr>
              ))}
              <tr className="total"><td>Alle</td><td className="n">{num(base.games)}</td><td className="n">{base.wins} / {base.draws} / {base.losses}</td><td className="n">{pct(winRate(base))}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <h3>Karten</h3>
        <p className="muted small">
          Gezählt wird jedes geprüfte Spiel, in dem die Karte auf der Hand war (sonst im Deck). Verglichen wird mit dem Durchschnitt aller Spiele ({pct(winRate(base))}).
          ▲ rot = evtl. zu stark, ▼ blau = evtl. zu schwach: mindestens {CARD_DELTA} Prozentpunkte darüber/darunter, bei mindestens {MIN_CARD_GAMES} Spielen. Das ist ein Hinweis, kein Beweis –
          starke Spieler mit guten Decks heben auch ihre Karten.
        </p>
        <div className="stats-controls">
          <span className="segmented">
            <button type="button" className={`seg ${cardFilter === 'notable' ? 'active' : ''}`} onClick={() => setCardFilter('notable')}>Auffällig ({notable})</button>
            <button type="button" className={`seg ${cardFilter === 'all' ? 'active' : ''}`} onClick={() => setCardFilter('all')}>Alle ({rows.length})</button>
          </span>
          <span className="segmented">
            <button type="button" className={`seg ${sort === 'delta' ? 'active' : ''}`} onClick={() => setSort('delta')}>Nach Abweichung</button>
            <button type="button" className={`seg ${sort === 'games' ? 'active' : ''}`} onClick={() => setSort('games')}>Nach Spielen</button>
          </span>
        </div>
        {shownCards.length === 0
          ? <p className="muted center">{cardFilter === 'notable' ? 'Keine Karte fällt auf – oder es gibt noch zu wenige Spiele.' : 'Noch keine Spiele im Zeitraum.'}</p>
          : (
            <div className="stats-table-wrap">
              <table className="stats-table">
                <thead><tr><th>Karte</th><th className="n">Spiele</th><th className="n">Siegquote</th><th className="n">± Schnitt</th></tr></thead>
                <tbody>
                  {shownCards.map((r) => (
                    <tr key={r.id}>
                      <td><span className={`rarity-dot r-${r.rarity}`} aria-hidden="true" />{r.name} <small className="muted">{RARITY_LABEL[r.rarity]}</small></td>
                      <td className="n">{num(r.games)}</td>
                      <td className="n">{pct(r.rate)}</td>
                      <td className="n"><span className={`verdict v-${r.verdict}`} title={VERDICT[r.verdict]}>
                        {r.verdict === 'strong' ? '▲ ' : r.verdict === 'weak' ? '▼ ' : ''}{r.delta > 0 ? '+' : ''}{r.delta.toLocaleString('de-DE')}
                      </span>{r.verdict === 'few' && <small className="muted block">wenige Spiele</small>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {unused.length > 0 && (
          <details className="stats-unused">
            <summary>{unused.length} Karten waren in keinem Spiel des Zeitraums</summary>
            <p className="small">{[...unused].sort((x, y) => RARITY_ORDER[y.rarity] - RARITY_ORDER[x.rarity] || x.name.localeCompare(y.name, 'de'))
              .map((c) => `${c.name} (${RARITY_LABEL[c.rarity]})`).join(', ')}</p>
          </details>
        )}
      </section>

      <section className="admin-card">
        <h3>Münzen und Runensteine</h3>
        <div className="stat-tiles">
          <Tile label="Münzen im Umlauf" value={num(s.economy.coins)} sub={`${num(s.economy.players)} Spielstände`} />
          <Tile label="Münzen pro Spieler" value={num(s.economy.coinsMedian)} sub={`mittlerer Spieler (Median) · höchster Stand ${num(s.economy.coinsMax)}`} />
          <Tile label="Runensteine im Umlauf" value={num(s.economy.stones)} />
          <Tile label="Runensteine pro Spieler" value={num(s.economy.stonesMedian)} sub="Median" />
        </div>
        <figure className="bucket-bars">
          <figcaption>Spieler nach Münzstand</figcaption>
          {s.economy.buckets.map((n, i) => (
            <div key={BUCKETS[i]} className="bucket-row">
              <span className="bucket-label">{BUCKETS[i]}</span>
              <span className="bucket-track"><span style={{ width: `${(n / bucketMax) * 100}%` }} /></span>
              <b className="bucket-n">{num(n)}</b>
            </div>
          ))}
        </figure>
        {s.economy.history.length >= 2
          ? <DayBars title="Münzen im Umlauf (Verlauf)" points={s.economy.history.map((h) => ({ day: h.day, value: h.coins }))} unit={(n) => `${num(n)} Münzen`} />
          : <p className="muted small">Der Verlauf der Münzen wird ab heute täglich aufgezeichnet und erscheint hier ab dem zweiten Tag.</p>}
        <p className="muted small">Wächst die Summe deutlich schneller als die Zahl der Spieler, gibt es vermutlich zu viele Münzen im Spiel (Belohnungen zu hoch oder zu wenig zum Ausgeben).</p>
      </section>
    </div>
  );
}
