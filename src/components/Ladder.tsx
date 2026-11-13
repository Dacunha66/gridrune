// Ranglisten-Ligen: the league emblem, the track of all 18 steps (current one highlighted, safepoints marked), the
// win points of the step and the result of a match (points filling up, promotion, safepoint, relegation).
import { useEffect, useRef } from 'react';
import { GameIcon } from './GameIcon';
import { Coin, Stone } from './Coin';
import {
  LEAGUES, LadderConfig, RANKED_SEARCH_SECONDS, LadderMove, LadderState, SAFE_USES, STEPS_PER_LEAGUE, TOTAL_STEPS, WINS_PER_STEP, isSafepoint, leagueName, leagueOf,
  safeLeft, seasonEndsIn, seasonName, stepName, stepRoman,
} from '../game/ladder';
import type { Reward } from '../game/campaign';
import { PACKS, packView } from '../game/shop';
import { LEVEL_LABEL } from '../game/stats';

/** Colours of the six leagues (own palette). */
const LEAGUE_COLOR = ['#c98a4b', '#c9d1dc', '#e8c25a', '#7fe0d0', '#8fb8ff', '#d68cff'];

/** The emblem of a step: a shield in the league colour with the step number. */
export function LeagueEmblem({ step, size = 56, dim = false }: { step: number; size?: number; dim?: boolean }) {
  const league = leagueOf(step);
  const c = LEAGUE_COLOR[league];
  return (
    <svg className={`league-emblem ${dim ? 'dim' : ''}`} width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true">
      <path d="M20 2 37 8v14c0 11-8 19-17 22C11 41 3 33 3 22V8z" fill="#0d1526" stroke={c} strokeWidth="2.5" />
      <path d="M20 6.5 33 11v11c0 8.5-6 15-13 17.6C13 37 7 30.5 7 22V11z" fill={c} opacity="0.22" />
      {league === LEAGUES.length - 1 && <path d="M12 12l3 4 5-6 5 6 3-4v5H12z" fill={c} />}
      <text x="20" y={league === LEAGUES.length - 1 ? 31 : 28} textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontWeight="700" fontSize="12" fill={c}>{stepRoman(step)}</text>
    </svg>
  );
}

/** Five pips: the win points on the step. */
export function WinPips({ points, flash }: { points: number; flash?: 'plus' | 'minus' | null }) {
  return (
    <span className="win-pips" aria-label={`${points} von ${WINS_PER_STEP} Siegpunkten`}>
      {Array.from({ length: WINS_PER_STEP }, (_, i) => (
        <span key={i} className={`pip ${i < points ? 'on' : ''} ${flash === 'plus' && i === points - 1 ? 'pop' : ''} ${flash === 'minus' && i === points ? 'lost' : ''}`} />
      ))}
    </span>
  );
}

/** The whole track, scrolled so the current step is in view. */
export function LadderTrack({ state }: { state: LadderState }) {
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('.is-current');
    if (el && box.current) box.current.scrollLeft = el.offsetLeft - box.current.clientWidth / 2 + el.clientWidth / 2;
  }, [state.step]);
  return (
    <ol className="ladder-track" ref={box} aria-label="Alle Stufen">
      {Array.from({ length: TOTAL_STEPS }, (_, step) => {
        const league = leagueOf(step);
        const cls = step === state.step ? 'is-current' : step < state.step ? 'is-done' : '';
        return (
          <li key={step} className={`ladder-node ${cls} ${step % STEPS_PER_LEAGUE === 0 ? 'league-first' : ''}`} style={{ ['--lc' as string]: LEAGUE_COLOR[league] }}>
            {step % STEPS_PER_LEAGUE === 0 && <span className="ladder-league">{leagueName(league)}</span>}
            <LeagueEmblem step={step} size={step === state.step ? 40 : 30} dim={step > state.step} />
            {isSafepoint(step) && step > 0 && <span className="ladder-safe" title="Safepoint"><GameIcon name="shield" /></span>}
          </li>
        );
      })}
    </ol>
  );
}

function rewardLine(r: Reward) {
  if (r.type === 'coins') return <><Coin /> {r.amount}</>;
  if (r.type === 'stones') return <><Stone /> {r.amount}</>;
  if (r.type === 'pack') {
    const pack = PACKS.find((p) => p.id === r.packId);
    return <>{(r.amount ?? 1) > 1 ? `${r.amount} × ` : ''}{pack ? packView(pack).name : 'Pack'}</>;
  }
  return <>Karte</>;
}

export function RewardList({ rewards }: { rewards: Reward[] }) {
  if (!rewards.length) return <span className="muted">–</span>;
  return <span className="ladder-rewards">{rewards.map((r, i) => <span key={i} className="chip-mini">{rewardLine(r)}</span>)}</span>;
}

function duration(ms: number): string {
  const h = Math.floor(ms / 3600_000);
  const d = Math.floor(h / 24);
  return d > 0 ? `${d} T ${h % 24} Std.` : `${h} Std. ${Math.floor((ms % 3600_000) / 60_000)} Min.`;
}

/** The overview: season, current step with points and safepoints, the track, rewards and the computer's strength. */
export function LadderPanel({ state, config }: { state: LadderState; config: LadderConfig }) {
  const league = leagueOf(state.step);
  const next = league + 1 < LEAGUES.length ? league + 1 : null;
  const safe = isSafepoint(state.step) && state.step > 0;
  return (
    <section className="ladder-panel" style={{ ['--lc' as string]: LEAGUE_COLOR[league] }}>
      <p className="ladder-season"><GameIcon name="hourglass" /> Saison {seasonName(state.season)} · endet in {duration(seasonEndsIn())}</p>
      <div className="ladder-now">
        <LeagueEmblem step={state.step} size={72} />
        <div>
          <h2>{stepName(state.step)}</h2>
          <WinPips points={state.points} />
          <p className="small muted">{WINS_PER_STEP} Siegpunkte = nächste Stufe · Sieg +1, Niederlage −1</p>
        </div>
      </div>
      <p className={`ladder-safe-line ${safe ? 'on' : ''}`}>
        <GameIcon name="shield" />
        <span>{safe
          ? <>Safepoint: Bei 0 Punkten fällst du hier nicht aus {leagueName(league)} – noch <b>{safeLeft(state)} von {SAFE_USES}</b> Mal.</>
          : state.step === 0 ? <>Unter Bronze I geht es nicht weiter runter.</> : <>Safepoints liegen auf Stufe I jeder Liga (je {SAFE_USES} Mal pro Saison).</>}</span>
      </p>
      <LadderTrack state={state} />
      <ul className="plain-list ladder-info">
        <li><GameIcon name="user" /><span>Gegner: zuerst ein echter Spieler mit ähnlicher Stufe. Ist nach {RANKED_SEARCH_SECONDS} Sekunden niemand da, spielst du gegen den Computer.</span></li>
        <li><GameIcon name="bot" /><span>Computer in {leagueName(league)}: <b>{LEVEL_LABEL[config.levels[league]] ?? config.levels[league]}</b></span></li>
        {next !== null && <li><GameIcon name="gift" /><span>Aufstieg nach {leagueName(next)}: <RewardList rewards={config.promotion[next]} /></span></li>}
        <li><GameIcon name="trophy" /><span>Saisonende ({leagueName(leagueOf(state.best))}): <RewardList rewards={config.season[leagueOf(state.best)]} /></span></li>
        <li className="muted small">Diese Saison: {state.wins} Siege aus {state.games} Matches · Neue Saison jeden Monatsersten – du startest dann eine Liga tiefer.</li>
      </ul>
    </section>
  );
}

const MOVE_ICON: Record<LadderMove, string> = { up: '⬆', top: '★', point: '+1', minus: '−1', safe: '🛡', down: '⬇', none: '·' };

/** After a match: before → after, with what happened. */
export function LadderResult({ before, state, move, promoted, gifts }: { before: LadderState; state: LadderState; move: LadderMove; promoted: number | null; gifts: number }) {
  const text = {
    up: promoted !== null ? `Aufstieg in die Liga ${leagueName(promoted)}!` : `Aufstieg auf ${stepName(state.step)}!`,
    top: 'Ganz oben – höchste Stufe erreicht!',
    point: `+1 Siegpunkt`,
    minus: `−1 Siegpunkt`,
    safe: `Der Safepoint hält – du bleibst in ${leagueName(leagueOf(state.step))} (noch ${safeLeft(state)} von ${SAFE_USES}).`,
    down: `Abstieg auf ${stepName(state.step)}`,
    none: 'Keine Änderung',
  }[move];
  return (
    <div className={`ladder-result move-${move}`} role="status" style={{ ['--lc' as string]: LEAGUE_COLOR[leagueOf(state.step)] }}>
      <div className="ladder-result-row">
        {before.step !== state.step && <><LeagueEmblem step={before.step} size={36} dim /><span className="ladder-arrow">→</span></>}
        <LeagueEmblem step={state.step} size={52} />
        <div>
          <b>{stepName(state.step)}</b>
          <WinPips points={state.points} flash={move === 'point' || move === 'top' ? 'plus' : move === 'minus' ? 'minus' : null} />
        </div>
        <span className="ladder-move" aria-hidden="true">{MOVE_ICON[move]}</span>
      </div>
      <p className="ladder-result-text">{text}</p>
      {gifts > 0 && <p className="small"><GameIcon name="mail" /> Deine Belohnung liegt im Postfach.</p>}
    </div>
  );
}
