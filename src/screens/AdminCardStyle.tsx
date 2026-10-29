// Admin: card design test (Kartendesign 2.0). Switches the card layout on this device only and shows
// a fully occupied 4×4 board in phone sizes. Other players keep the current design. Tapping a board card
// switches its owner colour in this preview only (nothing in any game or save changes).
import { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { CARDS, CardDef } from '../game/cards';
import { CARD_STYLES, CARD_STYLE_HINT, CARD_STYLE_LABEL, CardStyle, setCardStyle, useCardStyle } from '../game/cardStyle';
import type { Side } from '../game/battle';

interface Sample {
  id: string;
  owner: Side;
  values: number[];
  shield: boolean;
  glow: boolean;
}

/**
 * 16 board cards from the existing catalog: every card with an ability, the longest and shortest names,
 * strong cards (two-digit values), one per class – 8 red, 8 blue, some with bonus or malus.
 */
function sampleBoard(cards: readonly CardDef[]): Sample[] {
  const byLen = [...cards].sort((a, b) => b.name.length - a.name.length);
  const strong = cards.filter((c) => Math.max(c.top, c.right, c.bottom, c.left) >= 9);
  const perClass = [...new Set(cards.map((c) => c.cls))].map((cls) => cards.find((c) => c.cls === cls && !c.effect)!).filter(Boolean);
  const ids = [...new Set([
    ...cards.filter((c) => c.effect).map((c) => c.id),
    ...byLen.slice(0, 3).map((c) => c.id),
    ...byLen.slice(-3).map((c) => c.id),
    ...strong.slice(0, 2).map((c) => c.id),
    ...perClass.map((c) => c.id),
    ...cards.map((c) => c.id),
  ])].slice(0, 16);
  return ids.map((id, i) => {
    const c = cards.find((x) => x.id === id)!;
    const base = [c.top, c.right, c.bottom, c.left];
    // A 9 raised to 10 shows a two-digit bonus value; a few others get +1 / −1.
    const delta = base.includes(9) || i % 5 === 1 ? 1 : i % 7 === 3 ? -1 : 0;
    return {
      id,
      owner: ((i + Math.floor(i / 4)) % 2 === 0 ? 'player' : 'cpu') as Side,
      values: base.map((v) => Math.min(10, Math.max(1, v + delta))),
      shield: i === 6,
      glow: i === 9,
    };
  });
}

type View = 'device' | 'compare';

export function CardStyleView() {
  const style = useCardStyle();
  const [view, setView] = useState<View>('device');
  const initial = useMemo(() => sampleBoard(CARDS), []);
  const [board, setBoard] = useState<Sample[]>(initial);
  const hand = board.slice(0, 5);
  const flip = (i: number) => setBoard((b) => b.map((x, k) => (k === i ? { ...x, owner: x.owner === 'player' ? 'cpu' : 'player' } : x)));
  const reds = board.filter((b) => b.owner === 'cpu').length;

  const boardOf = (st: CardStyle | undefined, w: number) => (
    <>
      <div className="cs-board" style={{ width: w }}>
        {board.map((b, i) => (
          <div key={i} className="cs-cell">
            <Card
              id={b.id} owner={b.owner} size="sm" values={b.values} shield={b.shield} terrainGlow={b.glow} styleOverride={st}
              onClick={() => flip(i)} ariaLabel={`Besitzer wechseln (jetzt ${b.owner === 'player' ? 'Blau' : 'Rot'})`}
            />
          </div>
        ))}
      </div>
      <div className="cs-hand" style={{ width: w + 40 }}>
        {hand.map((b) => <div key={b.id} className="cs-hand-slot"><Card id={b.id} size="sm" styleOverride={st} /></div>)}
      </div>
    </>
  );

  return (
    <div className="scroll card-style-admin">
      <p className="muted small">
        Nur auf diesem Gerät: Andere Spieler sehen weiter das aktuelle Design. Im Duell wechselst du mit dem 🎨-Knopf oben rechts.
        Spielregeln, Werte und Sammlungen bleiben unverändert. <b>Karte im Beispielfeld antippen = Besitzer Rot/Blau wechseln</b> (nur hier).
      </p>
      <div className="segmented style-view-seg" role="radiogroup" aria-label="Ansicht">
        <button type="button" role="radio" aria-checked={view === 'device' && style === 'hybrid'} className={`seg ${view === 'device' && style === 'hybrid' ? 'active' : ''}`} onClick={() => { setView('device'); setCardStyle('hybrid'); }}>Bisheriger Hybrid</button>
        <button type="button" role="radio" aria-checked={view === 'device' && style === 'premium'} className={`seg ${view === 'device' && style === 'premium' ? 'active' : ''}`} onClick={() => { setView('device'); setCardStyle('premium'); }}>Hybrid Premium Fantasy</button>
        <button type="button" role="radio" aria-checked={view === 'compare'} className={`seg ${view === 'compare' ? 'active' : ''}`} onClick={() => setView('compare')}>Beide im Vergleich</button>
      </div>
      {view === 'device' && (
        <>
          <details className="upload-info">
            <summary>Alle Designs ({CARD_STYLE_LABEL[style]})</summary>
            <div className="segmented style-seg" role="radiogroup" aria-label="Kartendesign">
              {CARD_STYLES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={style === s} className={`seg ${style === s ? 'active' : ''}`} onClick={() => setCardStyle(s)}>
                  {CARD_STYLE_LABEL[s]}
                </button>
              ))}
            </div>
          </details>
          <p className="small">{CARD_STYLE_HINT[style]}</p>
          <p className="muted small">Im Feld: {16 - reds} blau, {reds} rot.</p>
          {([['iPhone', 310], ['iPhone SE', 230]] as const).map(([label, w]) => (
            <section key={label} className="style-preview">
              <h3>{label} – volles Spielfeld</h3>
              {boardOf(undefined, w)}
            </section>
          ))}
        </>
      )}
      {view === 'compare' && (
        <>
          <div className="segmented style-seg" role="radiogroup" aria-label="Premium-Variante">
            {(['premium', 'premiumLite'] as CardStyle[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={style === s} className={`seg ${style === s ? 'active' : ''}`} onClick={() => setCardStyle(s)}>{CARD_STYLE_LABEL[s]}</button>
            ))}
          </div>
          <div className="compare-wrap">
            <section className="style-preview">
              <h3>Bisheriger Hybrid</h3>
              {boardOf('hybrid', 310)}
            </section>
            <section className="style-preview">
              <h3>{CARD_STYLE_LABEL[style === 'premiumLite' ? 'premiumLite' : 'premium']}</h3>
              {boardOf(style === 'premiumLite' ? 'premiumLite' : 'premium', 310)}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
