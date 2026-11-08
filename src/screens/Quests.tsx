// Erfolge: daily quests, weekly quests and lasting achievements. The server counts and pays; here the player sees
// the progress, collects rewards (with a small celebration) and chooses the title shown in online duels.
import { useEffect, useMemo, useState } from 'react';
import { Header } from './Header';
import { GameIcon, GameIconName } from '../components/GameIcon';
import { Coin } from '../components/Coin';
import { Card } from '../components/Card';
import { Burst } from '../components/Effects';
import { CloudSave } from '../game/cloudSave';
import { QuestGranted, QuestItem, QuestReward, claimable, msToNextDay, rewardText } from '../game/quests';
import { QuestOverview, claimQuestRewards, equipAvatar, equipTitle, questOverview } from '../game/questApi';
import { Avatar } from '../components/Avatar';
import { AVATARS, DEFAULT_AVATAR } from '../game/avatars';

type Tab = 'daily' | 'weekly' | 'achievements';
const TABS: { id: Tab; label: string; icon: GameIconName }[] = [
  { id: 'daily', label: 'Täglich', icon: 'hourglass' },
  { id: 'weekly', label: 'Wöchentlich', icon: 'map' },
  { id: 'achievements', label: 'Erfolge', icon: 'trophy' },
];

interface Props {
  /** Signed in: quests count and can be collected. Guests see what they would get. */
  signedIn: boolean;
  reducedMotion: boolean;
  onAccount?: () => void;
  /** Rewards were paid: take over the new save. */
  onAdopt: (c: CloudSave) => void;
  /** A new avatar was chosen (the menu shows it). */
  onAvatar?: (id: string) => void;
  initialTab?: Tab;
  onBack: () => void;
}

const REWARD_ICON: Record<QuestReward['type'], GameIconName> = { coins: 'gift', card: 'cards', pack: 'gift', skin: 'deck', rune: 'scroll', title: 'crown' };

function RewardChip({ reward }: { reward: QuestReward }) {
  return (
    <span className={`quest-reward reward-${reward.type}`}>
      {reward.type === 'coins' ? <><Coin /> {reward.amount ?? 0}</> : <><GameIcon name={REWARD_ICON[reward.type]} /> {rewardText(reward)}</>}
    </span>
  );
}

function QuestRow({ item, busy, onClaim, bonus = false }: { item: QuestItem; busy: boolean; onClaim: (key: string) => void; bonus?: boolean }) {
  const pct = Math.round((item.progress / Math.max(1, item.target)) * 100);
  return (
    <article className={`quest ${item.done ? 'done' : ''} ${item.claimed ? 'claimed' : ''} ${bonus ? 'bonus' : ''}`}>
      <div className="quest-main">
        <p className="quest-text">{bonus && <GameIcon name="gift" />} {item.text}</p>
        <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={item.target} aria-valuenow={item.progress}><span style={{ width: `${pct}%` }} /></div>
        <span className="quest-count">{item.progress.toLocaleString('de-DE')}/{item.target.toLocaleString('de-DE')}</span>
      </div>
      <div className="quest-side">
        <RewardChip reward={item.reward} />
        {item.claimed ? <span className="quest-claimed"><GameIcon name="check" /> Abgeholt</span>
          : item.done ? <button type="button" className="btn btn-small btn-primary quest-claim" disabled={busy} onClick={() => onClaim(item.key)}>Abholen</button>
          : null}
      </div>
    </article>
  );
}

/** Achievements with tiers: one line per chain, showing the next tier still open. */
function chains(items: QuestItem[]): { name: string; tiers: QuestItem[]; current: QuestItem | null }[] {
  const groups = new Map<string, QuestItem[]>();
  for (const i of items) {
    const name = i.chain || i.text;
    groups.set(name, [...(groups.get(name) ?? []), i]);
  }
  return [...groups.entries()].map(([name, list]) => {
    const tiers = [...list].sort((a, b) => a.target - b.target);
    return { name, tiers, current: tiers.find((t) => !t.claimed) ?? null };
  });
}

function hoursText(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} Std. ${m} Min.` : `${m} Min.`;
}

export function Quests({ signedIn, reducedMotion, onAccount, onAdopt, onAvatar, initialTab = 'daily', onBack }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [data, setData] = useState<QuestOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ granted: QuestGranted[]; key: number } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    questOverview().then((r) => {
      if (!alive) return;
      if (r === 'offline') setError('Keine Verbindung – die Erfolge brauchen kurz Internet.');
      else setData(r);
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const ready = useMemo(() => (data ? claimable(data.board) : []), [data]);
  const readyIn = (kind: QuestItem['kind']) => ready.filter((i) => i.kind === kind).length;

  async function claim(keys: string[] | null) {
    setBusy(true);
    setError('');
    const r = await claimQuestRewards(keys);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onAdopt(r.cloud);
    if (r.overview) setData(r.overview);
    if (r.granted.length) setReveal({ granted: r.granted, key: Date.now() });
  }

  async function pickAvatar(avatar: string) {
    if (!data) return;
    setBusy(true);
    const t = await equipAvatar(avatar);
    setBusy(false);
    if (t) {
      setData({ ...data, titles: t });
      onAvatar?.(avatar);
    } else setError('Der Avatar konnte nicht gesetzt werden.');
  }

  async function pickTitle(title: string | null) {
    if (!data) return;
    setBusy(true);
    const t = await equipTitle(title);
    setBusy(false);
    if (t) setData({ ...data, titles: t });
    else setError('Der Titel konnte nicht gesetzt werden.');
  }

  const b = data?.board;
  return (
    <main className="screen quests">
      <Header title="Erfolge" onBack={onBack} right={ready.length > 0 ? <span className="pill ok">{ready.length} bereit</span> : undefined} />
      <div className="segmented quest-tabs" role="tablist">
        {TABS.map((t) => {
          const n = t.id === 'daily' ? readyIn('daily') : t.id === 'weekly' ? readyIn('weekly') : readyIn('achievement');
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`seg ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <GameIcon name={t.icon} /> {t.label}{n > 0 && <span className="quest-dot" aria-label={`${n} bereit`}>{n}</span>}
            </button>
          );
        })}
      </div>

      {!signedIn ? (
        <section className="quest-guest">
          <p className="quest-guest-icon" aria-hidden="true"><GameIcon name="trophy" /></p>
          <p><b>Erfolge gibt es mit einem Konto.</b></p>
          <p className="muted">Täglich 3 Quests, jede Woche 3 größere Aufgaben und dauerhafte Erfolge – mit Münzen, Boostern, Karten, Kartenrücken, Runen und Titeln als Belohnung. Der Server zählt nur echte, geprüfte Spiele.</p>
          {onAccount && <button type="button" className="btn btn-primary" onClick={onAccount}><GameIcon name="user" /> Anmelden / Konto erstellen</button>}
        </section>
      ) : (
        <div className="scroll quest-body">
          {error && <p className="hint warn-text" role="alert">{error}</p>}
          {!b && !error && <p className="muted center">Lade deine Erfolge …</p>}
          {b && tab === 'daily' && (
            <>
              <p className="quest-reset"><GameIcon name="hourglass" /> Neue Tagesquests in {hoursText(msToNextDay())}</p>
              {b.daily.map((i) => <QuestRow key={i.key} item={i} busy={busy} onClaim={(k) => void claim([k])} />)}
              <QuestRow item={b.dailyBonus} busy={busy} onClaim={(k) => void claim([k])} bonus />
            </>
          )}
          {b && tab === 'weekly' && (
            <>
              <p className="quest-reset"><GameIcon name="hourglass" /> Neue Wochenquests jeden Montag um Mitternacht</p>
              {b.weekly.map((i) => <QuestRow key={i.key} item={i} busy={busy} onClaim={(k) => void claim([k])} />)}
              <QuestRow item={b.weeklyBonus} busy={busy} onClaim={(k) => void claim([k])} bonus />
            </>
          )}
          {b && data && tab === 'achievements' && (
            <>
              <section className="quest-titles">
                <h2><Avatar id={data.titles.avatar} size={28} /> Dein Avatar</h2>
                <p className="muted small">Erscheint im Hauptmenü, im Online-Duell und in der Raid-Bestenliste. Neue Avatare schaltest du mit Erfolgen frei.</p>
                <div className="avatar-grid" role="group" aria-label="Avatar wählen">
                  {AVATARS.filter((av) => av.active !== false).map((av) => {
                    const open = data.avatars.includes(av.id);
                    const on = (data.titles.avatar ?? DEFAULT_AVATAR) === av.id;
                    const need = av.quest ? b.achievements.find((i) => i.key === `a:${av.quest}`) : null;
                    return (
                      <button key={av.id} type="button" className={`avatar-pick ${on ? 'on' : ''}`} disabled={!open || busy || on} aria-pressed={on}
                        onClick={() => void pickAvatar(av.id)} aria-label={open ? `${av.name}${on ? ', gewählt' : ''}` : `${av.name}, gesperrt${need ? `: ${need.text}` : ''}`}>
                        <Avatar id={av.id} size={52} locked={!open} />
                        <span>{av.name}</span>
                        {!open && need && <small>{need.chain ? `${need.chain}: ` : ''}{need.text}</small>}
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="quest-titles">
                <h2><GameIcon name="crown" /> Dein Titel</h2>
                {data.titles.owned.length === 0 ? (
                  <p className="muted small">Noch keine Titel – manche Erfolge schenken dir einen. Er erscheint im Online-Duell neben deinem Namen.</p>
                ) : (
                  <div className="chips" role="group" aria-label="Titel wählen">
                    <button type="button" className={`chip ${data.titles.equipped === null ? 'active' : ''}`} disabled={busy} onClick={() => void pickTitle(null)}>Kein Titel</button>
                    {data.titles.owned.map((t) => (
                      <button key={t} type="button" className={`chip ${data.titles.equipped === t ? 'active' : ''}`} disabled={busy} onClick={() => void pickTitle(t)}>{t}</button>
                    ))}
                  </div>
                )}
              </section>
              {chains(b.achievements).map((c) => (
                <section key={c.name} className="quest-chain">
                  <h3>
                    {c.name}
                    <span className="quest-pips" aria-label={`${c.tiers.filter((t) => t.claimed).length} von ${c.tiers.length} Stufen`}>
                      {c.tiers.map((t) => <span key={t.key} className={`pip ${t.claimed ? 'on' : t.done ? 'ready' : ''}`} />)}
                    </span>
                  </h3>
                  {c.current ? <QuestRow item={c.current} busy={busy} onClaim={(k) => void claim([k])} />
                    : <p className="quest-all-done"><GameIcon name="check" /> Alle Stufen geschafft</p>}
                </section>
              ))}
            </>
          )}
        </div>
      )}

      {signedIn && ready.length > 1 && (
        <div className="row-buttons">
          <button type="button" className="btn btn-primary btn-wide" disabled={busy} onClick={() => void claim(null)}><GameIcon name="gift" /> Alle abholen ({ready.length})</button>
        </div>
      )}

      {reveal && (
        <div className="quest-reveal-backdrop" role="dialog" aria-modal="true" aria-label="Belohnung erhalten" onClick={() => setReveal(null)}>
          <div key={reveal.key} className="quest-reveal" onClick={(e) => e.stopPropagation()}>
            {!reducedMotion && <Burst x="50%" y="30%" colors={['#ffd34d', '#45e3cf', '#fff']} count={22} spread={90} />}
            <h2>Belohnung erhalten!</h2>
            {(() => {
              const coins = reveal.granted.reduce((n, g) => n + g.coins, 0);
              const cards = reveal.granted.flatMap((g) => g.cards);
              const items = reveal.granted.flatMap((g) => g.items);
              return (
                <>
                  {coins > 0 && <p className="quest-reveal-coins"><Coin /> +{coins}</p>}
                  {items.map((t) => <p key={t} className="quest-reveal-item"><GameIcon name="crown" /> {t}</p>)}
                  {cards.length > 0 && (
                    <div className="quest-reveal-cards">
                      {cards.map((id, k) => <div key={id} className="quest-reveal-card" style={{ animationDelay: `${0.15 * k}s` }}><Card id={id} size="sm" showName /></div>)}
                    </div>
                  )}
                </>
              );
            })()}
            <button type="button" className="btn btn-primary" onClick={() => setReveal(null)}>Super!</button>
          </div>
        </div>
      )}
    </main>
  );
}
