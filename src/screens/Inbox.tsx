// Postfach: rewards waiting for the player (raid rewards, gifts from the admin), 30 days to collect. Collecting pays
// them on the server; coins and Runensteine are shown big, packs are opened like in the shop (cards face down, tap to
// turn them over; duplicates go to the Runenschmiede).
import { CSSProperties, useEffect, useState } from 'react';
import { Header } from './Header';
import { Card } from '../components/Card';
import { GameIcon } from '../components/GameIcon';
import { RevealItem, RewardReveal, revealOfGranted } from '../components/RewardReveal';
import { RARITY_LABEL, RARITY_ORDER, getCard } from '../game/cards';
import { CloudSave } from '../game/cloudSave';
import { rewardText } from '../game/campaign';
import type { GrantedReward } from '../game/campaignRewards';
import { InboxItem, inboxClaim, inboxList, openCount } from '../game/inboxApi';
import { getSkin } from '../game/skins';
import { PACKS, packView } from '../game/shop';
import type { Reward } from '../game/campaign';

/** "1 × Helden-Pack" instead of "1 Kartenpack". */
function giftText(r: Reward): string {
  const pack = r.type === 'pack' ? PACKS.find((p) => p.id === r.packId) ?? PACKS[0] : null;
  return pack ? `${r.amount ?? 1} × ${packView(pack).name}` : rewardText(r);
}

const SENDER: Record<InboxItem['sender'], string> = { raid: 'Raid', admin: 'GridRune-Team' };
const day = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400_000));

/** Cards from collected packs, turned over one by one like in the shop. */
export function PackReveal({ cards, cardSkin, onClose }: { cards: { cardId: string; isNew: boolean }[]; cardSkin: string; onClose: () => void }) {
  const [up, setUp] = useState<boolean[]>(cards.map(() => false));
  const back = getSkin(cardSkin).colors;
  const all = up.every(Boolean);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Pack geöffnet">
      <div className="modal pack-reveal">
        <h2>Pack geöffnet</h2>
        <div className="reveal-row">
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
          : <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Super!</button></div>}
      </div>
    </div>
  );
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
  const [pack, setPack] = useState<{ cardId: string; isNew: boolean }[] | null>(null);

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
    // Like in the shop: from the most common to the rarest, the best card is turned over last.
    const packCards = fromPacks.flatMap((g) => [...g.cards.map((cardId) => ({ cardId, isNew: true })), ...g.duplicates.map((cardId) => ({ cardId, isNew: false }))])
      .sort((x, y) => RARITY_ORDER[getCard(x.cardId).rarity] - RARITY_ORDER[getCard(y.cardId).rarity]);
    const rest = results.map((g) => (fromPacks.includes(g) ? { ...g, cards: [] } : g));
    const big = revealOfGranted(rest);
    setReveal(big.length ? big : null);
    setPack(packCards.length ? packCards : null);
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
                  <span className={`inbox-icon sender-${i.sender}`} aria-hidden="true"><GameIcon name={i.sender === 'raid' ? 'raid' : 'gift'} /></span>
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
      {!reveal && pack && <PackReveal cards={pack} cardSkin={cardSkin} onClose={() => setPack(null)} />}
    </main>
  );
}
