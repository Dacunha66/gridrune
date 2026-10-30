import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { Burst, useCountUp } from '../components/Effects';
import { RARITY_COLORS } from './Result';
import { Card } from '../components/Card';
import { CARDS, ownedActiveIds, RARITIES, RARITY_LABEL, RARITY_ORDER, Rarity, getCard } from '../game/cards';
import { createRng } from '../game/rng';
import { DUPLICATE_REFUND, PACKS, PackCard, PackDef, PackLook, buyPack, buySkin, equipSkin, packView } from '../game/shop';
import { CampaignImage } from './Campaign';
import { SKINS, SkinDef } from '../game/skins';
import { SaveData } from '../game/storage';
import { Header } from './Header';

interface Props {
  save: SaveData;
  onChange: (save: SaveData) => void;
  onBack: () => void;
}

export function skinStyle(colors: [string, string, string]): CSSProperties {
  return { '--player': colors[0], '--player-dark': colors[1], '--player-light': colors[2] } as CSSProperties;
}

const PACK_ART: Record<string, string> = { abenteurer: '🎴', helden: '👑' };

/** The booster: the admin's picture, otherwise a foil pack drawn in CSS with the pack's symbol and name. */
export function PackArt({ pack, big = false, look }: { pack: PackDef; big?: boolean; look?: PackLook }) {
  const view = look ? packView(pack, look) : packView(pack);
  return (
    <span className={`pack-art pack-${pack.id} ${big ? 'big' : ''} ${view.image ? 'has-image' : ''}`} aria-hidden="true">
      {view.image ? <CampaignImage img={view.image} /> : (
        <>
          <span className="pack-crimp top" />
          <span className="pack-emblem">{PACK_ART[pack.id] ?? '🎴'}</span>
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

export function Shop({ save, onChange, onBack }: Props) {
  const [tab, setTab] = useState<'packs' | 'skins'>('packs');
  const [opened, setOpened] = useState<{ pack: PackDef; cards: PackCard[]; key: number; stage: 'shake' | 'open' } | null>(null);
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

  function openPack(pack: PackDef) {
    const r = buyPack(save, pack.id, rng);
    if (!r.ok) return setMessage(r.reason);
    setMessage('');
    onChange(r.save);
    setOpened({ pack, cards: r.cards, key: Date.now(), stage: 'shake' });
  }

  function skinAction(skin: SkinDef) {
    if (save.skins.owned.includes(skin.id)) {
      onChange(equipSkin(save, skin.id));
      setMessage(`${skin.name} ausgerüstet ✓`);
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
      <Header title="Shop" onBack={onBack} right={<span key={save.coins} className="pill coin-pill">🪙 {coins}</span>} />
      <div className="segmented deck-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'packs'} className={`seg ${tab === 'packs' ? 'active' : ''}`} onClick={() => { setTab('packs'); setMessage(''); }}>🎴 Booster</button>
        <button type="button" role="tab" aria-selected={tab === 'skins'} className={`seg ${tab === 'skins' ? 'active' : ''}`} onClick={() => { setTab('skins'); setMessage(''); }}>🎨 Skins</button>
      </div>
      <p className="hint" aria-live="polite">{message || (tab === 'packs' ? 'Münzen verdienst du in jedem Duell – Siege bringen am meisten.' : 'Skins ändern nur das Aussehen, nie die Kartenwerte.')}</p>

      <div className="scroll">
        {tab === 'packs' && (
          <div className="shop-list">
            {complete && <p className="shop-note">Du hast alle Karten! Doppelte Karten werden in Münzen umgetauscht.</p>}
            <div className="pack-grid">
              {PACKS.map((pack) => {
                const view = packView(pack);
                const missing = pack.price - save.coins;
                return (
                  <article key={pack.id} className={`pack-tile pack-${pack.id}`}>
                    {pack.guaranteed && <span className="pack-ribbon">Episch+ garantiert</span>}
                    <button type="button" className="pack-tile-art" disabled={missing > 0} onClick={() => openPack(pack)} aria-label={`${view.name} kaufen und öffnen`}>
                      <PackArt pack={pack} />
                    </button>
                    <h2>{view.name}</h2>
                    <p className="pack-size">{pack.size} Karten</p>
                    <p className="pack-desc">{view.description}</p>
                    <button type="button" className="btn btn-primary pack-buy" disabled={missing > 0} onClick={() => openPack(pack)}>
                      {missing > 0 ? `Noch 🪙 ${missing}` : `🪙 ${pack.price}`}
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
                <span key={r}>{i > 0 && ' · '}<span className={`rarity-text rarity-${r}`}>{RARITY_LABEL[r]}</span> 🪙 {DUPLICATE_REFUND[r]}</span>
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
                  {SKINS.filter((s) => s.kind === kind).map((skin) => {
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
                          {equipped ? 'Ausgerüstet ✓' : owned ? 'Ausrüsten' : `🪙 ${skin.price}`}
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
                  return (
                    <div key={c.cardId} className={`reveal-slot rarity-bg-${rarity}`} style={{ animationDelay: `${0.25 + i * 0.35}s` } as CSSProperties}>
                      {RARITY_ORDER[rarity] >= RARITY_ORDER.epic && <span className="slot-rays" aria-hidden="true" style={{ animationDelay: `${0.25 + i * 0.35}s` }} />}
                      <Card id={c.cardId} size="md" showName />
                      <span className={`reveal-tag ${c.isNew ? 'new' : ''}`}>{c.isNew ? 'NEU!' : `Doppelt +🪙 ${c.refund}`}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="muted small" style={{ visibility: opened.stage === 'open' ? 'visible' : 'hidden' }}>{opened.cards.filter((c) => c.isNew).map((c) => getCard(c.cardId).name).join(', ') || 'Keine neuen Karten – dafür Münzen.'}</p>
            <div className="modal-actions" style={{ visibility: opened.stage === 'open' ? 'visible' : 'hidden' }}>
              {save.coins >= opened.pack.price && (
                <button type="button" className="btn" onClick={() => openPack(opened.pack)}>Noch eins (🪙 {opened.pack.price})</button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setOpened(null)}>Super!</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
