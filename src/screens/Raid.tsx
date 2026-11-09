// Weltboss-Raid for players: overview (boss, shared life points, phase, attacks left, own damage), choosing the
// 8 cards, the fight (the normal duel against the boss AI – continued after reloading), the server-confirmed
// result, the leaderboard and the rewards. Everything that counts comes from the server function "raid".
import { Avatar } from '../components/Avatar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClassGlyph } from '../components/GlyphIcons';
import { GameIcon } from '../components/GameIcon';
import { ResultIcon } from '../components/ResultIcon';
import { Header } from './Header';
import { Card } from '../components/Card';
import { Battle, BattleSetup, DuelRecord } from './Battle';
import { Coin, CoinText } from '../components/Coin';
import { Confetti } from '../components/Effects';
import { DesignImage } from '../components/DesignArt';
import { RuneBadge } from '../components/RuneBadge';
import { CARDS, DECK_SIZE, ownedActiveIds } from '../game/cards';
import { DRAW_HAND_SIZE, toHand } from '../game/battle';
import { CLASS_INFO } from '../game/effects';
import { imageUrl, repairDeck } from '../game/catalog';
import { LEVEL_LABEL, REWARD_ICON, Reward, rewardText } from '../game/campaign';
import { grantedText } from '../game/campaignRewards';
import { findRune } from '../game/runes';
import { Pick } from '../game/runner';
import { RaidConfig, checkRaid, raidAi, raidRngs, raidSnapshot, resumeRaid } from '../game/raid';
import { deriveRng, newMatchSeed } from '../game/league';
import {
  LeaderRow, OpenTicket, RaidInfo, RaidMe, RaidOverview, RaidResult, raidErrorText, raidFinishFight, raidLeaderboard, raidOverview, raidStartFight,
  readFight, writeFight,
} from '../game/raidApi';

const HAND_KEY = 'gridrune/raid-hand';
const fmt = (n: number) => n.toLocaleString('de-DE');

function timeLeft(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return 'vorbei';
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return d > 0 ? `${d} T ${h} Std` : h > 0 ? `${h} Std ${m} Min` : `${m} Min`;
}

const STATUS_TEXT: Record<RaidInfo['status'], string> = {
  upcoming: 'Startet bald', active: 'Läuft', paused: 'Pausiert', ended: 'Beendet', defeated: 'Besiegt!', expired: 'Vorbei',
};

/** The raid is fought with the player's deck (20 cards: 5 on the hand, the rest drawn). */
function savedHand(owned: readonly string[], deck: readonly string[]): string[] {
  return repairDeck([...deck], [...owned], CARDS).deck;
}

export function HpBar({ current, max, phases }: { current: number; max: number; phases?: { threshold: number }[] }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  return (
    <div className="raid-hp" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={current} aria-label={`Lebenspunkte ${fmt(current)} von ${fmt(max)}`}>
      <span className="raid-hp-fill" style={{ width: `${pct}%` }} />
      {phases?.slice(1).map((p, i) => <span key={i} className="raid-hp-mark" style={{ left: `${p.threshold}%` }} aria-hidden="true" />)}
      <span className="raid-hp-text">{fmt(current)} / {fmt(max)} LP</span>
    </div>
  );
}

interface Props {
  /** The player's collection and deck (the 8 cards are chosen from the collection). */
  unlocked: string[];
  deck: string[];
  /** The rune taken into the raid (null = none). */
  rune: string | null;
  reducedMotion: boolean;
  /** Rewards were paid into the account: load the save again. */
  onSaveChanged: () => void;
  onExit: () => void;
}

type View =
  | { k: 'overview' }
  | { k: 'hand' }
  | { k: 'fight'; ticket: OpenTicket }
  | { k: 'sending'; ticket: OpenTicket }
  | { k: 'result'; result: RaidResult; bossName: string }
  | { k: 'leaderboard' }
  | { k: 'rewards' };

export function Raid({ unlocked, deck, rune, reducedMotion, onSaveChanged, onExit }: Props) {
  const [data, setData] = useState<RaidOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ k: 'overview' });
  const [busy, setBusy] = useState(false);
  const hand = useMemo(() => savedHand(ownedActiveIds(unlocked), deck), [unlocked, deck]);

  const sendResult = useCallback(async (ticket: OpenTicket, record: { first: 'player' | 'cpu'; moves: DuelRecord['moves'] }, bossName: string) => {
    setView({ k: 'sending', ticket });
    const r = await raidFinishFight(ticket.id, { duel: { first: record.first, moves: record.moves } });
    if ('error' in r) {
      setError(raidErrorText(r.error));
      setView({ k: 'overview' });
      return;
    }
    writeFight(ticket.id, null);
    if (r.granted.length) onSaveChanged();
    setView({ k: 'result', result: r, bossName });
  }, [onSaveChanged]);

  const load = useCallback(async () => {
    const r = await raidOverview();
    if (r === 'offline') {
      setError(raidErrorText('offline'));
      return;
    }
    setData(r);
    if (r.granted?.length) onSaveChanged();
    // A finished fight that could not be sent yet: send it now.
    if (r.open) {
      const stored = readFight(r.open.id);
      if (stored?.done && r.raid) void sendResult(r.open, stored, r.raid.bossName);
    }
  }, [onSaveChanged, sendResult]);

  useEffect(() => {
    void load();
  }, [load]);

  const raid = data?.raid ?? null;
  const me = data?.me;

  async function challenge() {
    if (!raid) return;
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(HAND_KEY, JSON.stringify(hand));
    } catch {
      // not saved
    }
    const r = await raidStartFight(raid.id, hand, rune);
    setBusy(false);
    if ('error' in r) {
      setError(raidErrorText(r.error));
      return;
    }
    setView({ k: 'fight', ticket: r.ticket });
  }

  // ---------- Fight ----------
  if (view.k === 'fight' && raid) {
    return (
      <RaidFight key={view.ticket.id} ticket={view.ticket} reducedMotion={reducedMotion}
        onDone={(record) => {
          writeFight(view.ticket.id, { first: record.start.turn, moves: record.moves, done: true });
          void sendResult(view.ticket, { first: record.start.turn, moves: record.moves }, raid.bossName);
        }}
        onQuit={() => { setView({ k: 'overview' }); void load(); }} />
    );
  }

  if (view.k === 'sending') {
    return (
      <main className="screen raid">
        <div className="admin-empty"><p>Der Server prüft deinen Kampf …</p></div>
      </main>
    );
  }

  // ---------- Result ----------
  if (view.k === 'result') {
    const r = view.result;
    const title = r.outcome === 'win' ? `Sieg gegen ${view.bossName}!` : r.outcome === 'draw' ? 'Unentschieden' : r.outcome === 'expired' ? 'Kampf abgelaufen' : `Niederlage gegen ${view.bossName}`;
    return (
      <main className={`screen result raid-result result-${r.outcome === 'expired' ? 'loss' : r.outcome}`}>
        {r.outcome === 'win' && !reducedMotion && <Confetti count={60} />}
        <div className="scroll result-body">
          <ResultIcon outcome={r.outcome} />
          <h1>{title}</h1>
          <ul className="raid-facts">
            <li><span>Kontrollierte Felder</span><b>{r.fields}</b></li>
            <li><span>Verursachter Schaden</span><b className="raid-dmg">{fmt(r.damage)}</b></li>
            {r.applied < r.damage && <li><span>Davon vom Boss abgezogen</span><b>{fmt(r.applied)}</b></li>}
            <li><span>Dein Gesamtschaden</span><b>{fmt(r.totalDamage)}</b></li>
            {r.rank && <li><span>Dein Platz</span><b>{r.rank}.</b></li>}
            <li><span>Angriffe heute übrig</span><b>{r.attacksLeft}</b></li>
          </ul>
          <HpBar current={r.currentHp} max={r.maxHp} />
          {r.granted.length > 0 && <p className="reward-line"><GameIcon name="gift" /> <CoinText text={grantedText(r.granted)} /></p>}
          <p className="muted small">Vom Server geprüft und gewertet.</p>
        </div>
        <div className="menu-buttons">
          {r.attacksLeft > 0 && r.currentHp > 0 && <button type="button" className="btn btn-primary btn-big" onClick={() => setView({ k: 'hand' })}><GameIcon name="swords" /> Erneut angreifen</button>}
          <button type="button" className="btn" onClick={() => { setView({ k: 'overview' }); void load(); }}>Zur Raid-Übersicht</button>
          <button type="button" className="btn" onClick={() => setView({ k: 'leaderboard' })}><GameIcon name="trophy" /> Rangliste ansehen</button>
        </div>
      </main>
    );
  }

  if (view.k === 'leaderboard') return <RaidLeaderboard raid={raid} onBack={() => setView({ k: 'overview' })} />;
  if (view.k === 'rewards' && raid && me) return <RaidRewards raid={raid} me={me} onBack={() => setView({ k: 'overview' })} />;

  // ---------- The deck before the attack ----------
  if (view.k === 'hand' && raid) {
    const runeDef = findRune(rune);
    return (
      <main className="screen raid">
        <Header title="Dein Deck" onBack={() => setView({ k: 'overview' })} right={<span className={`pill ${hand.length === DECK_SIZE ? 'ok' : 'warn'}`}>{hand.length}/{DECK_SIZE}</span>} />
        <p className="pick-rune">{runeDef ? <>Deine Rune: <RuneBadge rune={runeDef} className="small" /> <b>{runeDef.name}</b></> : 'Ohne Rune'}</p>
        <div className="scroll">
          <p className="muted small center">Du kämpfst mit deinem Deck: Es wird gemischt, {DRAW_HAND_SIZE} Karten hast du auf der Hand, vor jedem Zug ziehst du nach. Ändern unter „Deck bearbeiten“.</p>
          <div className="hand-grid pool">
            {hand.map((id) => <div key={id} className="hand-pick"><Card id={id} size="sm" /></div>)}
          </div>
        </div>
        {error && <p className="hint warn-text" role="alert">{error}</p>}
        <div className="row-buttons">
          <button type="button" className="btn btn-primary btn-wide" disabled={hand.length !== DECK_SIZE || busy} onClick={() => void challenge()}>
            {busy ? '…' : <><GameIcon name="swords" /> {raid.bossName} angreifen</>}
          </button>
        </div>
      </main>
    );
  }

  // ---------- Overview ----------
  return (
    <main className="screen raid">
      <Header title="Raid" onBack={onExit} />
      <div className="scroll raid-body">
        {!data && !error && <p className="muted center">Lade den Raid …</p>}
        {error && <p className="hint warn-text" role="alert">{error}</p>}
        {data && !raid && (
          <section className="raid-empty">
            <p className="raid-empty-icon" aria-hidden="true"><GameIcon name="raid" /></p>
            <h2>Gerade ist kein Weltboss erwacht.</h2>
            <p className="muted">Sobald ein Raid startet, findest du ihn hier.</p>
          </section>
        )}
        {raid && me && (
          <>
            <section className={`raid-boss ${raid.status}`}>
              <div className="raid-boss-art">
                {raid.image && imageUrl(raid.image.id)
                  ? <DesignImage src={imageUrl(raid.image.id)!} fit={raid.image.fit} />
                  : <span className="raid-boss-emoji" aria-hidden="true"><GameIcon name="raid" /></span>}
                <span className="raid-status-pill">{STATUS_TEXT[raid.status]}</span>
              </div>
              <h2 className="raid-boss-name">{raid.bossName}</h2>
              <p className="raid-sub">
                {raid.cls && <><ClassGlyph cls={raid.cls} /> {CLASS_INFO[raid.cls].label} · </>}
                Phase {raid.phase + 1}: <b>{raid.phases[raid.phase]?.name}</b> · KI {LEVEL_LABEL[raid.phases[raid.phase]?.level ?? 'medium']}
              </p>
              {raid.phases[raid.phase]?.mechanic && <p className="raid-mechanic">✦ {raid.phases[raid.phase].mechanic}</p>}
              <HpBar current={raid.currentHp} max={raid.maxHp} phases={raid.phases} />
              <p className="raid-sub">
                {raid.status === 'upcoming' ? `Startet in ${timeLeft(raid.startsAt)}` : raid.status === 'active' ? `Noch ${timeLeft(raid.endsAt)}` : STATUS_TEXT[raid.status]}
                {' · '}{raid.participants} {raid.participants === 1 ? 'Teilnehmer' : 'Teilnehmer'}
              </p>
              {raid.description && <p className="raid-desc">{raid.description}</p>}
            </section>

            <section className="raid-me">
              <div><span>Angriffe heute</span><b>{me.attacksLeft} / {raid.dailyLimit}</b></div>
              <div><span>Dein Schaden</span><b>{fmt(me.totalDamage)}</b></div>
              <div><span>Dein Platz</span><b>{me.rank ? `${me.rank}.` : '–'}</b></div>
            </section>

            {data.open && !readFight(data.open.id)?.done && (
              <p className="raid-open"><GameIcon name="hourglass" /> Du hast einen begonnenen Kampf – er zählt als Niederlage, wenn du ihn nicht bis {new Date(data.open.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr beendest.</p>
            )}
            {data.granted && data.granted.length > 0 && <p className="reward-line"><GameIcon name="gift" /> Gutgeschrieben: <CoinText text={grantedText(data.granted)} /></p>}
          </>
        )}
      </div>
      {raid && me && (
        <div className="menu-buttons raid-actions">
          {data?.open
            ? <button type="button" className="btn btn-primary btn-big" onClick={() => setView({ k: 'fight', ticket: data.open! })}><GameIcon name="swords" /> Kampf fortsetzen</button>
            : <button type="button" className="btn btn-primary btn-big" disabled={raid.status !== 'active' || me.attacksLeft <= 0}
              onClick={() => { setError(null); setView({ k: 'hand' }); }}>
              {raid.status !== 'active' ? STATUS_TEXT[raid.status] : me.attacksLeft <= 0 ? 'Heute keine Angriffe mehr' : 'Boss herausfordern'}
            </button>}
          <div className="row-buttons">
            <button type="button" className="btn" onClick={() => setView({ k: 'rewards' })}><GameIcon name="gift" /> Belohnungen</button>
            <button type="button" className="btn" onClick={() => setView({ k: 'leaderboard' })}><GameIcon name="trophy" /> Rangliste</button>
          </div>
        </div>
      )}
    </main>
  );
}

/** The fight: the normal duel against the boss's frozen setup; moves are kept on the device after every action. */
function RaidFight({ ticket, reducedMotion, onDone, onQuit, test = false }: {
  ticket: OpenTicket; reducedMotion: boolean; onDone: (record: DuelRecord) => void; onQuit: () => void; test?: boolean;
}) {
  const [setup] = useState<BattleSetup>(() => {
    const rngs = raidRngs(ticket.seed);
    const s = ticket.snapshot;
    return {
      cpuHand: toHand(s.deck), first: null, rocks: [], arena: { id: 'raid', name: s.arenaName, cells: s.cells, status: 'active', ranked: false, updatedAt: '' },
      label: `${test ? 'TEST · ' : ''}${s.bossName} · Phase ${s.phase + 1}: ${s.phaseName}`, tossRng: rngs.toss, rng: rngs.ai, finishLabel: 'Ergebnis', ai: raidAi(s),
      badgeText: '', runes: { player: ticket.playerRune, cpu: s.bossRune }, deal: () => deriveRng(ticket.seed, 'raid-deal'),
    };
  });
  // Continue where the fight stopped (moves kept on this device).
  const [resume] = useState(() => {
    const stored = test ? null : readFight(ticket.id);
    return stored && !stored.done && stored.moves.length > 0 ? resumeRaid(ticket, stored) ?? undefined : undefined;
  });
  const [picks] = useState<Pick[]>(() => ticket.hand.map((cardId, i) => ({ cardId, kind: 'deck', gate: i, mod: 0 })));
  return (
    <Battle picks={picks} unlocked={ticket.hand} reducedMotion={reducedMotion} setup={setup} resume={resume}
      onProgress={test ? undefined : (rec) => writeFight(ticket.id, { first: rec.start.turn, moves: rec.moves, done: false })}
      onEnd={(_o, _s, _f, record) => record && onDone(record)} onQuit={onQuit} />
  );
}

function RaidLeaderboard({ raid, onBack }: { raid: RaidInfo | null; onBack: () => void }) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [me, setMe] = useState<{ rank: number; totalDamage: number; attacks: number } | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadPage = useCallback(async (offset: number) => {
    const r = await raidLeaderboard(offset);
    if (r === 'offline') return setError(raidErrorText('offline'));
    setRows((prev) => [...(offset ? prev ?? [] : []), ...r.rows]);
    setMe(r.me);
    setMore(r.rows.length === 50);
  }, []);
  useEffect(() => {
    void loadPage(0);
  }, [loadPage]);
  return (
    <main className="screen raid">
      <Header title="Raid-Rangliste" onBack={onBack} />
      <div className="scroll raid-body">
        {raid && <p className="muted center small">{raid.bossName} · nach Gesamtschaden</p>}
        {error && <p className="hint warn-text">{error}</p>}
        {me && <p className="raid-myrank">Dein Platz: <b>{me.rank}.</b> · {fmt(me.totalDamage)} Schaden in {me.attacks} Angriffen</p>}
        {rows && rows.length === 0 && <p className="muted center">Noch hat niemand angegriffen – sei der Erste!</p>}
        {rows && rows.length > 0 && (
          <table className="raid-table">
            <thead><tr><th>#</th><th>Spieler</th><th>Schaden</th><th>Angr.</th><th>Ø</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.rank} className={r.me ? 'me' : ''}>
                  <td>{r.rank}</td><td className="lb-name">{r.avatar && <Avatar id={r.avatar} size={22} />}{r.name}</td><td>{fmt(r.totalDamage)}</td><td>{r.attacks}</td><td>{fmt(r.average)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {more && <button type="button" className="btn" onClick={() => void loadPage(rows?.length ?? 0)}>Mehr anzeigen</button>}
      </div>
    </main>
  );
}

function RewardLine({ reward }: { reward: Reward }) {
  return <>{reward.type === 'coins' ? <><Coin /> {fmt(reward.amount ?? 0)}</> : <>{REWARD_ICON[reward.type]} {rewardText(reward)}</>}</>;
}

function RaidRewards({ raid, me, onBack }: { raid: RaidInfo; me: RaidMe; onBack: () => void }) {
  const removed = raid.maxHp > 0 ? ((raid.maxHp - raid.currentHp) / raid.maxHp) * 100 : 0;
  const eligible = me.attacks >= Math.max(1, raid.minAttacksForGlobal);
  return (
    <main className="screen raid">
      <Header title="Raid-Belohnungen" onBack={onBack} />
      <div className="scroll raid-body">
        <h2 className="raid-h2">Persönlich – dein Schaden: {fmt(me.totalDamage)}</h2>
        {raid.milestones.length === 0 && <p className="muted">Keine persönlichen Belohnungen.</p>}
        <ul className="raid-rewards">
          {raid.milestones.map((m) => {
            const done = me.claimed.includes(`p:${m.damage}:${m.reward.type}`);
            const reached = me.totalDamage >= m.damage;
            return (
              <li key={`${m.damage}-${m.reward.type}`} className={done ? 'done' : reached ? 'reached' : ''}>
                <span className="raid-rw-goal">{fmt(m.damage)} Schaden</span>
                <span className="raid-rw-prize"><RewardLine reward={m.reward} /></span>
                <span className="raid-rw-state">{done ? '✓ erhalten' : reached ? 'wird gutgeschrieben' : `noch ${fmt(m.damage - me.totalDamage)}`}</span>
              </li>
            );
          })}
        </ul>
        <h2 className="raid-h2">Gemeinschaft – {Math.floor(removed)} % geschafft</h2>
        <p className="muted small">Für alle, die mindestens {Math.max(1, raid.minAttacksForGlobal)} {raid.minAttacksForGlobal > 1 ? 'Kämpfe' : 'Kampf'} abgeschlossen haben.{!eligible && ' Du bist noch nicht dabei – greif einmal an!'}</p>
        <ul className="raid-rewards">
          {raid.globalRewards.map((g) => {
            const done = me.claimed.includes(`g:${g.percent}:${g.reward.type}`);
            const reached = removed >= g.percent;
            return (
              <li key={`${g.percent}-${g.reward.type}`} className={done ? 'done' : reached ? 'reached' : ''}>
                <span className="raid-rw-goal">{g.percent >= 100 ? 'Boss besiegt' : `${g.percent} % LP abgezogen`}</span>
                <span className="raid-rw-prize"><RewardLine reward={g.reward} /></span>
                <span className="raid-rw-state">{done ? '✓ erhalten' : reached ? (eligible ? 'wird gutgeschrieben' : 'nur mit Teilnahme') : 'offen'}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Raid-Belohnungen machen nie stärker als andere Spieler: Münzen, Booster und später Kosmetik.</p>
        <h2 className="raid-h2">Schaden pro Kampf</h2>
        <p className="small">Niederlage {raid.damage.loss} · Unentschieden {raid.damage.draw} · Sieg {raid.damage.win} + {raid.damage.perField} je Feld über 8 · höchstens {raid.damage.max}</p>
      </div>
    </main>
  );
}

/**
 * Admin test fight: the raid as it is in the editor, on this device only. Nothing is sent – no attack is used, no
 * damage reaches the boss, no ranking, no reward. The damage is calculated with the same check the server uses.
 */
export function RaidTestFight({ config, phase, unlocked, deck, rune, reducedMotion, onExit }: {
  config: RaidConfig; phase: number; unlocked: string[]; deck: string[]; rune: string | null; reducedMotion: boolean; onExit: () => void;
}) {
  const [hand] = useState(() => savedHand(ownedActiveIds(unlocked), deck));
  const [ticket, setTicket] = useState<OpenTicket | null>(() => {
    const snapshot = raidSnapshot(config, phase);
    return snapshot ? { id: 'test', seed: newMatchSeed(), hand, playerRune: rune, snapshot, expiresAt: '' } : null;
  });
  const [result, setResult] = useState<{ text: string; damage: number; fields: number } | null>(null);
  if (!ticket) return <main className="screen raid"><Header title="Testkampf" onBack={onExit} /><p className="hint">Diese Phase ist noch nicht vollständig (Bossdeck oder Arena fehlt).</p></main>;
  if (result) {
    return (
      <main className="screen result raid-result">
        <div className="scroll result-body">
          <div className="result-icon" aria-hidden="true"><GameIcon name="gear" /></div>
          <h1>Testkampf: {result.text}</h1>
          <ul className="raid-facts">
            <li><span>Phase</span><b>{phase + 1}: {config.phases[phase]?.name}</b></li>
            <li><span>Kontrollierte Felder</span><b>{result.fields}</b></li>
            <li><span>Schaden (so würde der Server rechnen)</span><b className="raid-dmg">{fmt(result.damage)}</b></li>
          </ul>
          <p className="muted small">Nur ein Test – nichts wurde gespeichert, kein Angriff verbraucht, keine Belohnung.</p>
        </div>
        <div className="menu-buttons">
          <button type="button" className="btn btn-primary btn-big" onClick={() => { setResult(null); setTicket({ ...ticket, seed: newMatchSeed() }); }}>Noch ein Testkampf</button>
          <button type="button" className="btn" onClick={onExit}>Zurück zum Admin</button>
        </div>
      </main>
    );
  }
  return (
    <RaidFight key={ticket.seed} ticket={ticket} reducedMotion={reducedMotion} test onQuit={onExit}
      onDone={(record) => {
        const check = checkRaid(ticket, { duel: { first: record.start.turn, moves: record.moves } });
        if (!check.ok) setResult({ text: `Prüfung fehlgeschlagen (${check.error})`, damage: 0, fields: 0 });
        else setResult({ text: check.outcome === 'win' ? 'Sieg' : check.outcome === 'draw' ? 'Unentschieden' : 'Niederlage', damage: check.damage, fields: check.fields });
      }} />
  );
}
