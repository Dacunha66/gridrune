// Postfach: rewards waiting for the player (raid rewards, gifts from the admin), 30 days to collect. Collecting pays
// them on the server; coins and Runensteine are shown big, packs are opened like in the shop (cards face down, tap to
// turn them over; duplicates go to the Runenschmiede).
import { CSSProperties, useEffect, useState } from 'react';
import { Header } from './Header';
import { Card } from '../components/Card';
import { GameIcon } from '../components/GameIcon';
import { RevealItem, RewardReveal, revealOfGranted } from '../components/RewardReveal';
import { RARITY_LABEL, RARITY_ORDER, getCard, isCardId } from '../game/cards';
import { findEdition } from '../game/puzzles';
import { CloudSave } from '../game/cloudSave';
import { rewardText } from '../game/campaign';
import type { GrantedReward } from '../game/campaignRewards';
import { InboxItem, inboxClaim, inboxList, openCount } from '../game/inboxApi';
import { getSkin } from '../game/skins';
import { PACKS, packView } from '../game/shop';
import { PackArt } from './Shop';
import type { Reward } from '../game/campaign';

/** "1 × Helden-Pack" instead of "1 Kartenpack". */
function giftText(r: Reward | { type: 'edition'; editionId: string }): string {
  if (r.type === 'edition') {
    const e = findEdition((r as { editionId: string }).editionId);
    return e && isCardId(e.cardId) ? `Karte ${getCard(e.cardId).name} – Edition „${e.name}“` : 'Karten-Edition';
  }
  const pack = r.type === 'pack' ? PACKS.find((p) => p.id === r.packId) ?? PACKS[0] : null;
  return pack ? `${r.amount ?? 1} × ${packView(pack).name}` : rewardText(r);
}

const SENDER: Record<InboxItem['sender'], string> = { raid: 'Raid', admin: 'GridRune-Team', event: 'Puzzle-Event' };
const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400_000));

export interface OpenedPack {
  packId?: string;
  cards: { cardId: string; isNew: boolean }[];
}

/**
 * Cards from collected packs: one pack after the other. First the pack itself ("tap to open"), then its cards face
 * down, turned over like in the shop (rarest last), then the next pack.
 */
export function PackReveal({ packs, cardSkin, onClose }: { packs: OpenedPack[]; cardSkin: string; onClose: () => void }) {
  const [n, setN] = useState(0);
  const [opened, setOpened] = useState(false);
  const pack = packs[n];
  const cards = [...(pack?.cards ?? [])].sort((x, y) => RARITY_ORDER[getCard(x.cardId).rarity] - RARITY_ORDER[getCard(y.cardId).rarity]);
  const [up, setUp] = useState<boolean[]>(cards.map(() => false));
  const back = getSkin(cardSkin).colors;
  const all = up.length === cards.length && up.every(Boolean);
  const def = (pack?.packId ? PACKS.find((x) => x.id === pack.packId) : null) ?? null;
  const name = def ? packView(def).name : 'Kartenpack';
  const last = n >= packs.length - 1;
  const next = () => {
    if (last) return onClose();
    setUp(packs[n + 1].cards.map(() => false));
    setOpened(false);
    setN(n + 1);
  };
  if (!pack) return null;
  return (
    <div className="modal-backdrop pack-backdrop" role="dialog" aria-modal="true" aria-label={name}>
      <div className="modal pack-reveal">
        <h2>{name}</h2>
        {packs.length > 1 && <p className="pack-count">Pack {n + 1} von {packs.length}</p>}
        {!opened ? (
          <>
            <button type="button" className="pack-closed" key={`p${n}`} onClick={() => setOpened(true)} aria-label={`${name} öffnen`}>
              {def ? <PackArt pack={def} big /> : <span className="pack-art big" aria-hidden="true" />}
            </button>
            <p className="flip-hint">Tippe auf das Pack, um es zu öffnen</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => setOpened(true)}>Pack öffnen</button>
              {packs.length > 1 && <button type="button" className="btn" onClick={onClose}>Rest überspringen</button>}
            </div>
          </>
        ) : (
          <>
            <div className="reveal-row" key={n}>
              {cards.map((c, i) => {
                const rarity = getCard(c.cardId).rarity;
                return (
                  <button key={`${c.cardId}-${i}`} type="button" className={`reveal-slot flip-slot hint-${rarity} ${up[i] ? 'is-up' : ''}`}
                    style={{ animationDelay: `${0.1 + i * 0.15}s` } as CSSProperties}
                    onClick={() => setUp((u) => u.map((x, k) => x || k === i))} aria-label={up[i] ? `${getCard(c.cardId).name}, ${RARITY_LABEL[rarity]}` : `Karte ${i + 1} aufdecken`}>
                    <span className="flip-inner">
                      <span className="flip-face flip-back" aria-hidden="true" style={{ '--b1': back[0], '--b2': back[1], '--b3': back[2] } as CSSProperties}><span className="flip-rune">ᚱ</span></span>
                      <span className="flip-face flip-front"><Card id={c.cardId} size="md" showName /></span>
                    </span>
                    <span className={`reveal-tag ${c.isNew ? 'new' : ''}`} style={{ visibility: up[i] ? 'visible' : 'hidden' }}>{c.isNew ? 'NEU!' : 'Doppelt → Schmiede'}</span>
                  </button>
                );
              })}
            </div>
            {!all
              ? <p className="flip-hint">Tippe auf eine Karte, um sie aufzudecken · <button type="button" className="link-btn" onClick={() => setUp(cards.map(() => true))}>Alle aufdecken</button></p>
              : (
                <div className="modal-actions">
                  <button type="button" className="btn btn-primary" onClick={next}>{last ? 'Super!' : `Nächstes Pack (${n + 2}/${packs.length})`}</button>
                  {!last && <button type="button" className="btn" onClick={onClose}>Rest überspringen</button>}
                </div>
              )}
          </>
        )}
      </div>
    </div>
  );
}

/** The packs of collected rewards, one by one; answers of an older server (no pack list) are split into packs of 3. */
export function packsOf(results: readonly GrantedReward[]): OpenedPack[] {
  return results.flatMap((g) => {
    if (g.packs?.length) return g.packs;
    const all = [...g.cards.map((cardId) => ({ cardId, isNew: true })), ...g.duplicates.map((cardId) => ({ cardId, isNew: false }))];
    const out: OpenedPack[] = [];
    for (let i = 0; i < all.length; i += 3) out.push({ cards: all.slice(i, i + 3) });
    return out;
  });
}

export function Inbox({ onBack, onAdopt, onCount, reducedMotion, cardSkin }: {
  onBack: () => void;
  onAdopt: (c: CloudSave) => void;
  /** Number of open items (for the envelope). */
  onCount?: (n: number) => void;
  reducedMotion: boolean;
  cardSkin: string;
}) {
  const [items, setItems] = useState<InboxItem[] | null | 'offline'>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reveal, setReveal] = useState<RevealItem[] | null>(null);
  const [pack, setPack] = useState<OpenedPack[] | null>(null);

  useEffect(() => {
    inboxList().then((l) => {
      setItems(l ?? 'offline');
      if (l) onCount?.(openCount(l));
    });
  }, [onCount]);

  async function claim(ids?: string[]) {
    if (busy) return;
    const before = list;
    setBusy(true);
    const r = await inboxClaim(ids);
    setBusy(false);
    if (!r) return setMessage('Abholen hat nicht geklappt – bitte noch einmal versuchen.');
    if (r.cloud) onAdopt(r.cloud);
    setItems(r.items);
    onCount?.(openCount(r.items));
    const results = Object.values(r.results) as GrantedReward[];
    setMessage(results.length ? 'Abgeholt ✓' : '');
    // Coins and Runensteine first (big), then the packs to turn over; a single card comes with the big reveal.
    const isPack = (key: string) => before.find((i) => i.id === key)?.reward.type === 'pack';
    const fromPacks = results.filter((g) => isPack(g.key));
    const opened = packsOf(fromPacks);
    const rest = results.map((g) => (fromPacks.includes(g) ? { ...g, cards: [] } : g));
    // Card editions from Puzzle-Events: shown big, in their special look.
    const editions: RevealItem[] = results.flatMap((g) => (g.editions ?? []).flatMap((id) => {
      const e = findEdition(id);
      return e && isCardId(e.cardId) ? [{ kind: 'edition', cardId: e.cardId, editionId: e.id, name: e.name, source: g.source } as RevealItem] : [];
    }));
    const big = [...editions, ...revealOfGranted(rest)];
    setReveal(big.length ? big : null);
    setPack(opened.length ? opened : null);
  }

  const list = items === 'offline' || items === null ? [] : items;
  const open = list.filter((i) => !i.claimedAt && Date.parse(i.expiresAt) > Date.now());
  const done = list.filter((i) => i.claimedAt);

  return (
    <main className="screen inbox">
      <Header title="Postfach" onBack={onBack} />
      {message && <p className="hint" aria-live="polite">{message}</p>}
      <div className="scroll">
        {items === null ? <p className="muted center">Lädt …</p> : items === 'offline' ? <p className="muted center">Keine Verbindung – das Postfach braucht kurz Internet.</p> : (
          <>
            {open.length === 0 && <p className="shop-note">Dein Postfach ist leer. Raid-Belohnungen und Geschenke landen hier – du hast dann 30 Tage Zeit zum Abholen.</p>}
            {open.length > 1 && <button type="button" className="btn btn-primary btn-wide" disabled={busy} onClick={() => claim()}>Alle abholen ({open.length})</button>}
            <ul className="inbox-list">
              {open.map((i) => (
                <li key={i.id} className="inbox-item">
                  <span className={`inbox-icon sender-${i.sender}`} aria-hidden="true"><GameIcon name={i.sender === 'raid' ? 'raid' : i.sender === 'event' ? 'crown' : 'gift'} /></span>
                  <span className="inbox-text">
                    <small>{SENDER[i.sender]} · {day(i.createdAt)} · noch {daysLeft(i.expiresAt)} {daysLeft(i.expiresAt) === 1 ? 'Tag' : 'Tage'}</small>
                    <b>{i.title}</b>
                    {i.message && <span className="inbox-msg">{i.message}</span>}
                    <span className="inbox-reward"><GameIcon name="gift" /> {giftText(i.reward)}</span>
                  </span>
                  <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => claim([i.id])}>Abholen</button>
                </li>
              ))}
            </ul>
            {done.length > 0 && (
              <>
                <h2 className="section-title">Abgeholt</h2>
                <ul className="inbox-list done">
                  {done.map((i) => (
                    <li key={i.id} className="inbox-item">
                      <span className={`inbox-icon sender-${i.sender}`} aria-hidden="true"><GameIcon name="check" /></span>
                      <span className="inbox-text"><small>{SENDER[i.sender]} · abgeholt am {day(i.claimedAt!)}</small><b>{i.title}</b><span className="inbox-reward">{giftText(i.reward)}</span></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      {reveal && <RewardReveal items={reveal} reducedMotion={reducedMotion} onClose={() => setReveal(null)} />}
      {!reveal && pack && <PackReveal packs={pack} cardSkin={cardSkin} onClose={() => setPack(null)} />}
    </main>
  );
}
