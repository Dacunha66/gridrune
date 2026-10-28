import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { Burst, useCountUp } from '../components/Effects';
import { RARITY_COLORS } from './Result';
import { Card } from '../components/Card';
import { CARDS, ownedActiveIds, RARITIES, RARITY_LABEL, RARITY_ORDER, Rarity, getCard } from '../game/cards';
import { createRng } from '../game/rng';
import { PACKS, PackCard, PackDef, buyPack, buySkin, equipSkin } from '../game/shop';
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

function bestRarity(cards: PackCard[]): Rarity {
  return cards.map((c) => getCard(c.cardId).rarity).sort((a, b) => RARITY_ORDER[b] - RARITY_ORDER[a])[0];
}

function odds(pack: PackDef): string {
  const total = RARITIES.reduce((sum, r) => sum + pack.weights[r], 0);
  const pct = (n: number) => {
    const v = (n / total) * 100;
    return `${v >= 1 ? Math.round(v) : v.toFixed(1).replace('.', ',')} %`;
  };
  return RARITIES.map((r) => `${RARITY_LABEL[r]} ${pct(pack.weights[r])}`).join(' · ');
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
      <div className="chips" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'packs'} className={`chip ${tab === 'packs' ? 'active' : ''}`} onClick={() => { setTab('packs'); setMessage(''); }}>Booster-Packs</button>
        <button type="button" role="tab" aria-selected={tab === 'skins'} className={`chip ${tab === 'skins' ? 'active' : ''}`} onClick={() => { setTab('skins'); setMessage(''); }}>Skins</button>
      </div>
      <p className="hint" aria-live="polite">{message || (tab === 'packs' ? 'Münzen bekommst du für jedes Duell – am meisten für Siege.' : 'Skins ändern nur das Aussehen, nicht die Kartenwerte.')}</p>

      <div className="scroll">
        {tab === 'packs' && (
          <div className="shop-list">
            {complete && <p className="muted center">Du hast alle 40 Karten! Doppelte Karten werden in Münzen umgetauscht.</p>}
            {PACKS.map((pack) => (
              <article key={pack.id} className={`shop-item pack-${pack.id}`}>
                <div className="pack-art" aria-hidden="true">{PACK_ART[pack.id] ?? '🎴'}</div>
                <div className="shop-info">
                  <h2>{pack.name}</h2>
                  <p>{pack.description}</p>
                  <p className="odds">{odds(pack)}</p>
                </div>
                <button type="button" className="btn btn-primary" disabled={save.coins < pack.price} onClick={() => openPack(pack)}>
                  🪙 {pack.price}
                </button>
              </article>
            ))}
            <p className="muted small">Doppelte Karten werden in Münzen umgetauscht: gewöhnlich 🪙 10, selten 🪙 25, episch 🪙 60, legendär 🪙 150.</p>
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
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${opened.pack.name} geöffnet`}>
          <div className="modal pack-reveal" key={opened.key}>
            <h2>{opened.pack.name}</h2>
            {opened.stage === 'shake' ? (
              <button
                type="button"
                className={`pack-opening glow-${bestRarity(opened.cards)} pack-${opened.pack.id}`}
                onClick={() => setOpened({ ...opened, stage: 'open' })}
                aria-label="Pack öffnen"
              >
                <span className="pack-art big">{PACK_ART[opened.pack.id] ?? '🎴'}</span>
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
