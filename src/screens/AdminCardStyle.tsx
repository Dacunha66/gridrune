// Admin: card design test (Kartendesign 2.0). Switches the card layout on this device only and shows
// a fully occupied 4×4 board in phone sizes. Other players keep the current design.
import { Card } from '../components/Card';
import { CARDS, cardPower, getCard } from '../game/cards';
import { CARD_STYLES, CARD_STYLE_HINT, CARD_STYLE_LABEL, setCardStyle, useCardStyle } from '../game/cardStyle';
import type { Side } from '../game/battle';

/** 16 board cards: long names first, mixed owners, some with bonus/malus, shield or terrain glow. */
function sampleBoard() {
  const byName = [...CARDS].sort((a, b) => b.name.length - a.name.length || cardPower(b) - cardPower(a));
  const withFx = CARDS.filter((c) => c.effect);
  const ids = [...new Set([...withFx.map((c) => c.id), ...byName.map((c) => c.id)])].slice(0, 16);
  return ids.map((id, i) => {
    const c = getCard(id);
    const base = [c.top, c.right, c.bottom, c.left];
    const delta = i % 5 === 1 ? 1 : i % 7 === 3 ? -1 : 0;
    return {
      id,
      owner: (i % 3 === 0 ? 'cpu' : 'player') as Side,
      values: base.map((v) => Math.min(10, Math.max(1, v + delta))),
      shield: i === 6,
      glow: i === 9,
    };
  });
}

export function CardStyleView() {
  const style = useCardStyle();
  const board = sampleBoard();
  const hand = board.slice(0, 5);
  return (
    <div className="scroll card-style-admin">
      <p className="muted small">
        Nur auf diesem Gerät: Andere Spieler sehen weiter das aktuelle Design. Im Duell wechselst du mit dem 🎨-Knopf oben rechts.
        Spielregeln, Werte und Sammlungen bleiben unverändert.
      </p>
      <div className="segmented style-seg" role="radiogroup" aria-label="Kartendesign">
        {CARD_STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={style === s} className={`seg ${style === s ? 'active' : ''}`} onClick={() => setCardStyle(s)}>
            {CARD_STYLE_LABEL[s]}
          </button>
        ))}
      </div>
      <p className="small">{CARD_STYLE_HINT[style]}</p>
      {([['iPhone', 310], ['iPhone SE', 230]] as const).map(([label, w]) => (
        <section key={label} className="style-preview">
          <h3>{label} – volles Spielfeld</h3>
          <div className="cs-board" style={{ width: w }}>
            {board.map((b, i) => (
              <div key={i} className="cs-cell">
                <Card id={b.id} owner={b.owner} size="sm" values={b.values} shield={b.shield} terrainGlow={b.glow} />
              </div>
            ))}
          </div>
          <div className="cs-hand" style={{ width: w + 40 }}>
            {hand.map((b) => <div key={b.id} className="cs-hand-slot"><Card id={b.id} size="sm" /></div>)}
          </div>
        </section>
      ))}
    </div>
  );
}
