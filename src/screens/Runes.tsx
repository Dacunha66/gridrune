// Rune choice (tab "Rune" in the deck editor): one rune for the next duels. Runes are unlocked in the
// campaign; without any rune the player plays without. Using a rune in a duel never removes it from the collection.
import { RuneBadge } from '../components/RuneBadge';
import { RARITY_LABEL } from '../game/cards';
import { CLASS_INFO } from '../game/effects';
import { MODE_NAME, RUNES, RuneDef, runeRules } from '../game/runes';

export interface RuneChoiceProps {
  owned: string[];
  /** The rune taken into duels (always one of the owned runes, or null when none is owned). */
  equipped: string | null;
  onEquip: (id: string) => void;
  /** Why a locked rune is locked, e.g. "Mission „Herz des Waldes“ gewinnen". */
  lockText: (r: RuneDef) => string;
}

export function RunePicker({ owned, equipped, onEquip, lockText }: RuneChoiceProps) {
  const visible = RUNES.filter((r) => r.status === 'active');
  const have = (r: RuneDef) => r.unlock.kind === 'start' || owned.includes(r.id);
  const anyOwned = visible.some(have);
  return (
    <div className="rune-list">
      <p className="muted small">
        {anyOwned
          ? 'Wähle die Rune für deine Duelle. Im Duell setzt du sie einmal in deinem Zug ein – vor dem Legen einer Karte, ohne den Zug zu verbrauchen. Die Rune bleibt in deiner Sammlung. In der Liga sind nur freigespielte Grundrunen erlaubt.'
          : 'Du besitzt noch keine Rune – du spielst ohne Rune. Runen spielst du in der Kampagne frei.'}
      </p>
      {visible.map((r) => {
        const own = have(r);
        const on = equipped === r.id;
        const rules = runeRules(r);
        return (
          <button key={r.id} type="button" className={`rune-row ${on ? 'equipped' : ''} ${own ? '' : 'locked'}`} disabled={!own} aria-pressed={on} onClick={() => onEquip(r.id)}>
            <RuneBadge rune={r} />
            <span className="rune-row-main">
              <b>{r.name}</b>
              <span className="small">{r.description}</span>
              <span className="muted small">
                <span className={`rarity-text rarity-${r.rarity}`}>{RARITY_LABEL[r.rarity]}</span>{rules.cls ? ` · ${CLASS_INFO[rules.cls].icon} ${CLASS_INFO[rules.cls].label}` : ''} · {(Object.keys(r.modes) as (keyof typeof r.modes)[]).filter((m) => r.modes[m]).map((m) => MODE_NAME[m]).join(', ')}
              </span>
              {!own && <span className="small">🔒 {lockText(r)}</span>}
            </span>
            <span className={`rune-equip ${on ? 'on' : ''}`}>{on ? 'Gewählt ✓' : own ? 'Wählen' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}
