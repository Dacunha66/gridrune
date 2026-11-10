import type { ReactNode } from 'react';
import { GameIcon } from '../components/GameIcon';
import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { Coin, CoinText, Stone } from '../components/Coin';
import { Burst, useCountUp } from '../components/Effects';
import { RARITY_COLORS } from './Result';
import { Card } from '../components/Card';
import { CARDS, ownedActiveIds, RARITIES, RARITY_LABEL, RARITY_ORDER, Rarity, getCard } from '../game/cards';
import { createRng } from '../game/rng';
import { buyCoinsRemote, buyOfferRemote, buyPackRemote, buySkinRemote, freeCoinsRemote } from '../game/adventureApi';
import { claimFreeCoins, dailyOffers, euro, freeCoinsAt, isOfferBought, offerPrice, stoneConfig } from '../game/stones';
import type { CloudSave } from '../game/cloudSave';
import { DUPLICATE_REFUND, PACKS, PackCard, PackDef, PackLook, buyPack, buySkin, equipSkin, packPrice, packView } from '../game/shop';
import { CampaignImage } from './Campaign';
import { SKINS, SkinDef, getSkin } from '../game/skins';
import { SaveData } from '../game/storage';
import { Header } from './Header';

interface Props {
  save: SaveData;
  onChange: (save: SaveData) => void;
  /** Signed in: purchases happen on the server (it draws the cards); the returned save is taken over. */
  server?: { adopt: (c: CloudSave) => void } | null;
  onBack: () => void;
  /** Opened from the bottom bar: the shared top line (logo, coins, account) replaces the back button. */
  top?: ReactNode;
  /** Account id (personal card offers); null = guest. */
  player?: string | null;
  /** Admin: sees the prepared Runenstein packages (money – not for sale yet). */
  admin?: boolean;
  /** Guest: opens the sign-in (Runensteine need an account). */
  onAccount?: () => void;
}

type ShopTab = 'offers' | 'packs' | 'coins' | 'skins';
const TAB_HINT: Record<ShopTab, string> = {
  offers: 'Alle 12 Stunden Gratis-Münzen und jeden Tag neue Karten für Runensteine.',
  packs: 'Münzen verdienst du in jedem Duell – Siege bringen am meisten.',
  coins: 'Runensteine verdienst du mit Erfolgen, in der Kampagne und im Raid.',
  skins: 'Skins ändern nur das Aussehen, nie die Kartenwerte.',
};

/** Time left until `at`, counting down like a clock: "11:59" (hours:minutes, rounded down). */
export function untilText(at: Date, now: number): string {
  const min = Math.max(0, Math.floor((at.getTime() - now) / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

export function skinStyle(colors: [string, string, string]): CSSProperties {
  return { '--player': colors[0], '--player-dark': colors[1], '--player-light': colors[2] } as CSSProperties;
}

const PACK_ART: Record<string, 'gift' | 'crown'> = { abenteurer: 'gift', helden: 'crown' };

/** The booster: the admin's picture, otherwise a foil pack drawn in CSS with the pack's symbol and name. */
export function PackArt({ pack, big = false, look }: { pack: PackDef; big?: boolean; look?: PackLook }) {
  const view = look ? packView(pack, look) : packView(pack);
  return (
    <span className={`pack-art pack-${pack.id} ${big ? 'big' : ''} ${view.image ? 'has-image' : ''}`} aria-hidden="true">
      {view.image ? <CampaignImage img={view.image} /> : (
        <>
          <span className="pack-crimp top" />
          <span className="pack-emblem"><GameIcon name={PACK_ART[pack.id] ?? 'gift'} /></span>
          <span className="pack-label">{view.name}</span>
          <span className="pack-crimp bottom" />
        </>
      )}
      <span className="pack-shine" />
    </span>
  );
}

function bestRarity(cards: PackCard[]): Rarity {
  return cards.map((c) => getCard(c.cardId).rarity).sort((a, b) => RARITY_ORDER[b] - RARITY_ORDER[a])[0];
}

/** Chance per rarity for one card of the pack, as German percent text. */
function odds(pack: PackDef): { rarity: Rarity; text: string }[] {
  const total = RARITIES.reduce((sum, r) => sum + pack.weights[r], 0);
  const pct = (n: number) => {
    const v = (n / total) * 100;
    return `${v >= 1 ? Math.round(v) : v.toFixed(1).replace('.', ',')} %`;
  };
  return RARITIES.map((r) => ({ rarity: r, text: pct(pack.weights[r]) }));
}

export function Shop({ save, onChange, onBack, server = null, top, player = null, admin = false, onAccount }: Props) {
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<ShopTab>('offers');
  // Redraws the countdown every few seconds; the time itself is read fresh on every drawing (never an old value).
  const [, setTick] = useState(0);
  const now = Date.now();
  useEffect(() => {
    const t = setInterval(() => setTick((k) => k + 1), 5000);
    return () => clearInterval(t);
  }, []);
  /** flipped = which cards are already turned over (they come out of the pack face down). */
  const [opened, setOpened] = useState<{ pack: PackDef; cards: PackCard[]; key: number; stage: 'shake' | 'open'; flipped: boolean[] } | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);
  const coins = useCountUp(save.coins, 600);
  const reducedMotion = typeof document !== 'undefined' && document.documentElement.classList.contains('reduced-motion');

  // The pack shakes first, then bursts open.
  useEffect(() => {
    if (opened?.stage !== 'shake') return;
    const t = setTimeout(() => setOpened((o) => (o ? { ...o, stage: 'open' } : o)), reducedMotion ? 0 : 1300);
    return () => clearTimeout(t);
  }, [opened?.stage, opened?.key, reducedMotion]);

  useEffect(() => {
    if (!justBought) return;
    const t = setTimeout(() => setJustBought(null), 1600);
    return () => clearTimeout(t);
  }, [justBought]);
  const [message, setMessage] = useState('');
  const rng = useMemo(() => createRng(), []);
  const complete = ownedActiveIds(save.unlocked).length >= CARDS.length;

  async function openPack(pack: PackDef) {
    if (server) {
      if (busy) return;
      if (save.coins < packPrice(pack)) return setMessage(`Dir fehlen noch 🪙 ${packPrice(pack) - save.coins}.`);
      setBusy(true);
      setMessage('Kauf wird bestätigt …');
      const r = await buyPackRemote(pack.id);
      setBusy(false);
      if (r.cloud) server.adopt(r.cloud);
      if (!r.ok) return setMessage(r.reason);
      setMessage('');
      setOpened({ pack, cards: r.cards, key: Date.now(), stage: 'shake', flipped: r.cards.map(() => false) });
      return;
    }
    const r = buyPack(save, pack.id, rng);
    if (!r.ok) return setMessage(r.reason);
    setMessage('');
    onChange(r.save);
    setOpened({ pack, cards: r.cards, key: Date.now(), stage: 'shake', flipped: r.cards.map(() => false) });
  }

  /** The equipped card back (colours of the card skin) – the cards lie face down on it. */
  const back = getSkin(save.skins.card).colors;
  const allUp = !!opened && opened.flipped.every(Boolean);
  function flipCard(i: number) {
    setOpened((o) => (o && !o.flipped[i] ? { ...o, flipped: o.flipped.map((f, k) => f || k === i) } : o));
  }
  function flipAll() {
    setOpened((o) => (o ? { ...o, flipped: o.flipped.map(() => true) } : o));
  }

  const cfg = stoneConfig();
  const freeAt = freeCoinsAt(save, new Date(now));
  const offers = dailyOffers(save, player ?? 'guest', new Date(now));

  async function takeFree() {
    if (busy) return;
    if (server) {
      setBusy(true);
      const r = await freeCoinsRemote();
      setBusy(false);
      if (r.cloud) server.adopt(r.cloud);
      return setMessage(r.ok ? `🪙 ${r.coins} Gratis-Münzen abgeholt ✓` : r.reason);
    }
    const r = claimFreeCoins(save);
    if (!r.ok) return setMessage(r.reason);
    onChange(r.save);
    setMessage(`🪙 ${r.coins} Gratis-Münzen abgeholt ✓`);
  }

  async function buyBundle(id: string) {
    if (busy || !server) return;
    setBusy(true);
    const r = await buyCoinsRemote(id);
    setBusy(false);
    if (r.cloud) server.adopt(r.cloud);
    setMessage(r.ok ? `🪙 ${r.coins.toLocaleString('de-DE')} Münzen gutgeschrieben ✓` : r.reason);
  }

  async function buyCard(id: string) {
    if (busy || !server) return;
    setBusy(true);
    const r = await buyOfferRemote(id);
    setBusy(false);
    if (r.cloud) server.adopt(r.cloud);
    setMessage(r.ok ? `${getCard(id).name} ist jetzt in deiner Sammlung ✓` : r.reason);
  }

  async function skinAction(skin: SkinDef) {
    if (save.skins.owned.includes(skin.id)) {
      onChange(equipSkin(save, skin.id));
      setMessage(`${skin.name} ausgerüstet ✓`);
      return;
    }
    if (server) {
      if (busy) return;
      setBusy(true);
      setMessage('Kauf wird bestätigt …');
      const r = await buySkinRemote(skin.id);
      setBusy(false);
      if (r.cloud) server.adopt(r.cloud);
      if (!r.ok) return setMessage(r.reason);
      setJustBought(skin.id);
      setMessage(`${skin.name} gekauft und ausgerüstet ✓`);
      return;
    }
    const r = buySkin(save, skin.id);
    if (!r.ok) return setMessage(r.reason);
    onChange(r.save);
    setJustBought(skin.id);
    setMessage(`${skin.name} gekauft und ausgerüstet ✓`);
  }

  return (
    <main className="screen shop">
      {top ? <>{top}<h2 className="menu-sub-title tab-title">Shop</h2></> : <Header title="Shop" onBack={onBack} right={<span key={save.coins} className="pill coin-pill"><Coin /> {coins}</span>} />}
      <div className="segmented shop-tabs" role="tablist">
        {([['offers', 'gift', 'Angebote'], ['packs', 'cards', 'Booster'], ['coins', 'shop', 'Münzen'], ['skins', 'crown', 'Skins']] as const).map(([id, icon, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMessage(''); }}>
            <GameIcon name={icon} /> {label}
          </button>
        ))}
      </div>
      <p className="hint" aria-live="polite">{message ? <CoinText text={message} /> : TAB_HINT[tab]}</p>

      <div className="scroll">
        {tab === 'offers' && (
          <div className="shop-list">
            <section className="free-coins">
              <span className="free-coins-art" aria-hidden="true"><Coin className="big" /></span>
              <span className="free-coins-text">
                <b>Gratis-Münzen</b>
                <small>{cfg.freeCoins} Münzen alle {cfg.freeHours} Stunden</small>
              </span>
              <button type="button" className="btn btn-primary" disabled={!!freeAt || busy} onClick={takeFree}>
                {freeAt ? <>Wieder in {untilText(new Date(Math.min(freeAt.getTime(), now + cfg.freeHours * 3600_000 - 1)), now)}</> : <>Abholen <Coin /> {cfg.freeCoins}</>}
              </button>
            </section>
            <h2 className="section-title">Karten des Tages <small className="muted">neu um Mitternacht</small></h2>
            {!player && <p className="shop-note">Runensteine gibt es mit einem Konto. <button type="button" className="link-btn" onClick={onAccount}>Jetzt anmelden</button></p>}
            {offers.length === 0 ? <p className="shop-note">Du hast schon alle Karten – heute gibt es keine Angebote.</p> : (
              <div className="offer-grid">
                {offers.map((id) => {
                  const bought = isOfferBought(save, id, new Date(now));
                  const price = offerPrice(id);
                  return (
                    <article key={id} className={`offer-tile rarity-edge-${getCard(id).rarity} ${bought ? 'bought' : ''}`}>
                      <Card id={id} size="md" showName />
                      <span className={`rarity-text rarity-${getCard(id).rarity}`}>{RARITY_LABEL[getCard(id).rarity]}</span>
                      <button type="button" className="btn btn-primary btn-small offer-buy" disabled={bought || busy || !player || save.stones < price} onClick={() => buyCard(id)}>
                        {bought ? 'Gekauft ✓' : <><Stone /> {price}</>}
                      </button>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'coins' && (
          <div className="shop-list">
            <h2 className="section-title">Münzen für Runensteine</h2>
            {!player && <p className="shop-note">Runensteine gibt es mit einem Konto. <button type="button" className="link-btn" onClick={onAccount}>Jetzt anmelden</button></p>}
            <div className="bundle-grid">
              {cfg.coinBundles.map((b, i) => (
                <article key={b.id} className={`bundle-tile size-${i + 1}`}>
                  <span className="bundle-amount"><Coin className="big" /> {b.coins.toLocaleString('de-DE')}</span>
                  <span className="bundle-pile" aria-hidden="true">{Array.from({ length: i + 2 }, (_, k) => <Coin key={k} />)}</span>
                  <button type="button" className="btn btn-primary btn-small" disabled={busy || !player || save.stones < b.stones} onClick={() => buyBundle(b.id)}>
                    <Stone /> {b.stones}
                  </button>
                </article>
              ))}
            </div>
            <div className="shop-note">
              <b>Runensteine verdienen:</b> mit Wochenquests und dauerhaften Erfolgen, in der Kampagne und im Raid. Damit kaufst du Münzen
              und die Karten des Tages.
            </div>
            {admin && (
              <section className="stone-packs-preview">
                <h2 className="section-title">Runensteine kaufen <small className="muted">Vorschau – nur für Admins sichtbar</small></h2>
                <p className="muted small">Vorbereitet, aber ausgeschaltet: Es ist noch kein Zahlungsanbieter verbunden. Spieler sehen diesen Bereich nicht.</p>
                <div className="bundle-grid">
                  {cfg.stonePacks.map((p, i) => (
                    <article key={p.id} className={`bundle-tile stone-pack size-${i + 1}`}>
                      <span className="bundle-amount"><Stone className="big" /> {p.stones.toLocaleString('de-DE')}</span>
                      <button type="button" className="btn btn-small" disabled>{euro(p.cents)}</button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'packs' && (
          <div className="shop-list">
            {complete && <p className="shop-note">Du hast alle Karten! Doppelte Karten werden in Münzen umgetauscht.</p>}
            <div className="pack-grid">
              {PACKS.map((pack) => {
                const view = packView(pack);
                const missing = packPrice(pack) - save.coins;
                return (
                  <article key={pack.id} className={`pack-tile pack-${pack.id}`}>
                    {pack.guaranteed && <span className="pack-ribbon">Episch+ garantiert</span>}
                    <button type="button" className="pack-tile-art" disabled={missing > 0 || busy} onClick={() => openPack(pack)} aria-label={`${view.name} kaufen und öffnen`}>
                      <PackArt pack={pack} />
                    </button>
                    <h2>{view.name}</h2>
                    <p className="pack-size">{pack.size} Karten</p>
                    <p className="pack-desc">{view.description}</p>
                    <button type="button" className="btn btn-primary pack-buy" disabled={missing > 0 || busy} onClick={() => openPack(pack)}>
                      {missing > 0 ? <>Noch <Coin /> {missing}</> : <><Coin /> {packPrice(pack)}</>}
                    </button>
                    <details className="pack-odds">
                      <summary>Chancen pro Karte</summary>
                      <ul>
                        {odds(pack).map((o) => (
                          <li key={o.rarity}><span className={`rarity-text rarity-${o.rarity}`}>{RARITY_LABEL[o.rarity]}</span><b>{o.text}</b></li>
                        ))}
                      </ul>
                      {pack.guaranteed && <p className="muted small">Die letzte Karte ist mindestens episch.</p>}
                    </details>
                  </article>
                );
              })}
            </div>
            <div className="shop-note">
              <b>Doppelte Karten</b> werden in Münzen umgetauscht:{' '}
              {(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as Rarity[]).map((r, i) => (
                <span key={r}>{i > 0 && ' · '}<span className={`rarity-text rarity-${r}`}>{RARITY_LABEL[r]}</span> <Coin /> {DUPLICATE_REFUND[r]}</span>
              ))}
            </div>
          </div>
        )}

        {tab === 'skins' && (
          <div className="shop-list">
            {(['card', 'runner'] as const).map((kind) => (
              <section key={kind}>
                <h2 className="section-title">{kind === 'card' ? 'Kartenfarbe im Duell' : 'Figur im Lauf'}</h2>
                <div className="skin-grid">
                  {SKINS.filter((s) => s.kind === kind && (!s.rewardOnly || save.skins.owned.includes(s.id))).map((skin) => {
                    const owned = save.skins.owned.includes(skin.id);
                    const equipped = save.skins[kind] === skin.id;
                    return (
                      <article key={skin.id} className={`skin-item ${equipped ? 'equipped' : ''} ${justBought === skin.id ? 'just-bought' : ''}`} style={skinStyle(skin.colors)}>
                        {justBought === skin.id && (
                          <>
                            <span className="stamp" aria-hidden="true">GEKAUFT!</span>
                            {!reducedMotion && <Burst x="50%" y="40%" colors={[skin.colors[0], skin.colors[2], '#ffcc33']} count={18} spread={70} />}
                          </>
                        )}
                        <div className="skin-preview">
                          {kind === 'card' ? <Card id="r02" owner="player" size="md" /> : <div className="cloak-preview" aria-hidden="true"><span className="head" /><span className="cloak" /></div>}
                        </div>
                        <h3>{skin.name}</h3>
                        <p className="small muted">{skin.description}</p>
                        <button
                          type="button"
                          className={`btn btn-small ${owned ? '' : 'btn-primary'}`}
                          disabled={equipped || (!owned && save.coins < skin.price)}
                          onClick={() => skinAction(skin)}
                        >
                          {equipped ? 'Ausgerüstet ✓' : owned ? 'Ausrüsten' : <><Coin /> {skin.price}</>}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {opened && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${packView(opened.pack).name} geöffnet`}>
          <div className="modal pack-reveal" key={opened.key}>
            <h2>{packView(opened.pack).name}</h2>
            {opened.stage === 'shake' ? (
              <button
                type="button"
                className={`pack-opening glow-${bestRarity(opened.cards)} pack-${opened.pack.id}`}
                onClick={() => setOpened({ ...opened, stage: 'open' })}
                aria-label="Pack öffnen"
              >
                <PackArt pack={opened.pack} big />
                <span className="small muted">Tippen zum Öffnen</span>
              </button>
            ) : (
              <div className="reveal-row">
                {!reducedMotion && <Burst x="50%" y="50%" colors={RARITY_COLORS[bestRarity(opened.cards)]} count={26} spread={150} />}
                <span className="pack-flash" aria-hidden="true" />
                {opened.cards.map((c, i) => {
                  const rarity = getCard(c.cardId).rarity;
                  const up = opened.flipped[i];
                  const big = RARITY_ORDER[rarity] >= RARITY_ORDER.epic;
                  return (
                    <button key={`${c.cardId}-${i}`} type="button" className={`reveal-slot flip-slot hint-${rarity} ${up ? 'is-up' : ''}`}
                      style={{ animationDelay: `${0.15 + i * 0.22}s` } as CSSProperties}
                      onClick={() => flipCard(i)} aria-label={up ? `${getCard(c.cardId).name}, ${RARITY_LABEL[rarity]}` : `Karte ${i + 1} aufdecken`}>
                      {up && big && <span className="slot-rays" aria-hidden="true" />}
                      {up && big && !reducedMotion && <Burst x="50%" y="40%" colors={RARITY_COLORS[rarity]} count={22} spread={90} />}
                      <span className="flip-inner">
                        <span className="flip-face flip-back" aria-hidden="true" style={{ '--b1': back[0], '--b2': back[1], '--b3': back[2] } as CSSProperties}>
                          <span className="flip-rune">ᚱ</span>
                        </span>
                        <span className="flip-face flip-front"><Card id={c.cardId} size="md" showName /></span>
                      </span>
                      <span className={`reveal-tag ${c.isNew ? 'new' : ''}`} style={{ visibility: up ? 'visible' : 'hidden' }}>{c.isNew ? 'NEU!' : <>Doppelt +<Coin /> {c.refund}</>}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {opened.stage === 'open' && !allUp ? (
              <p className="flip-hint">Tippe auf eine Karte, um sie aufzudecken · <button type="button" className="link-btn" onClick={flipAll}>Alle aufdecken</button></p>
            ) : (
              <p className="muted small" style={{ visibility: opened.stage === 'open' ? 'visible' : 'hidden' }}>{opened.cards.filter((c) => c.isNew).map((c) => getCard(c.cardId).name).join(', ') || 'Keine neuen Karten – dafür Münzen.'}</p>
            )}
            <div className="modal-actions" style={{ visibility: opened.stage === 'open' && allUp ? 'visible' : 'hidden' }}>
              {save.coins >= packPrice(opened.pack) && (
                <button type="button" className="btn" onClick={() => openPack(opened.pack)}>Noch eins (<Coin /> {packPrice(opened.pack)})</button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setOpened(null)}>Super!</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
