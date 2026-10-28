// Details of a card on the board: class, effect, terrain and every active value change.
import { BoardCell, cellBreakdown } from '../game/battle';
import { RARITY_LABEL, getCard } from '../game/cards';
import { CLASS_INFO, EFFECTS, TERRAIN_INFO, Terrain } from '../game/effects';
import { Card } from './Card';
import { CLASS_ICON, Icon } from './cardIcons';

interface Props {
  board: readonly (BoardCell | null)[];
  terrain: readonly Terrain[];
  cell: number;
  onClose: () => void;
}

const ARROWS = ['⬆', '➡', '⬇', '⬅'];

export function CardInspect({ board, terrain, cell, onClose }: Props) {
  const card = board[cell]!;
  const def = getCard(card.cardId);
  const info = cellBreakdown(board, terrain, cell);
  const cls = def.cls ? CLASS_INFO[def.cls] : null;
  const effect = def.effect ? EFFECTS[def.effect] : null;
  const here = terrain[cell] ?? 'normal';
  return (
    <div className="inspect-backdrop" role="dialog" aria-modal="true" aria-label={`Details: ${def.name}`} onClick={onClose}>
      <div className="inspect" onClick={(e) => e.stopPropagation()}>
        <div className="inspect-head">
          <Card id={card.cardId} owner={card.owner} size="md" values={info.values} shield={info.barrier} mod={card.mod} />
          <div>
            <h2>{def.name}</h2>
            <p className={`rarity-text rarity-${def.rarity}`}>{RARITY_LABEL[def.rarity]}</p>
            <p>{card.owner === 'player' ? '🔵 Deine Karte' : '🔴 Gegnerkarte'}</p>
            {cls && def.cls && <p className="inspect-cls"><Icon path={CLASS_ICON[def.cls].path} color={CLASS_ICON[def.cls].color} /> {cls.label}</p>}
            {here !== 'normal' && <p>Feld: {TERRAIN_INFO[here].icon} {TERRAIN_INFO[here].label}</p>}
          </div>
        </div>
        <div className="inspect-effect">
          {effect ? (
            <>
              <strong>✨ {effect.name}</strong>
              <p>{effect.text}</p>
            </>
          ) : (
            <p>Kein Spezialeffekt</p>
          )}
        </div>
        <table className="inspect-values">
          <thead>
            <tr><th></th>{ARROWS.map((a) => <th key={a}>{a}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td>Grundwerte</td>{info.base.map((v, i) => <td key={i}>{v}</td>)}</tr>
            {info.parts.map((p, k) => (
              <tr key={k} className={p.d.some((x) => x < 0) ? 'minus' : 'plus'}>
                <td>{p.source}{p.kind === 'aura' ? ' (solange aktiv)' : ''}</td>
                {p.d.map((v, i) => <td key={i}>{v === 0 ? '' : `${v > 0 ? '+' : ''}${v}`}</td>)}
              </tr>
            ))}
            <tr className="total"><td>Jetzt</td>{info.values.map((v, i) => <td key={i}>{v}</td>)}</tr>
          </tbody>
        </table>
        {info.parts.length === 0 && <p className="fineprint">Keine Änderungen – es gelten die Grundwerte.</p>}
        {info.barrier && <p className="fineprint">🛡 Schild aktiv: Die nächste Schwächung durch einen gegnerischen Effekt wird abgewehrt.</p>}
        <p className="fineprint">Werte bleiben immer zwischen 1 und 10. Änderungen gelten nur in diesem Duell.</p>
        <button type="button" className="btn btn-primary btn-wide" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}
