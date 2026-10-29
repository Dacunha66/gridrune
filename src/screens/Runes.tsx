// Rune collection: equip one rune for the next duels. The four basic runes are owned by everyone;
// further runes are unlocked in the campaign. Using a rune in a duel never removes it from the collection.
import { Header } from './Header';
import { RuneBadge } from '../components/RuneBadge';
import { RARITY_LABEL } from '../game/cards';
import { CLASS_INFO } from '../game/effects';
import { MODE_NAME, RUNES, RuneDef, runeRules } from '../game/runes';

interface Props {
  owned: string[];
  equipped: string | null;
  onEquip: (id: string | null) => void;
  onBack: () => void;
  /** Why a locked rune is locked, e.g. "Mission „Herz des Waldes“ gewinnen". */
  lockText: (r: RuneDef) => string;
}

export function Runes({ owned, equipped, onEquip, onBack, lockText }: Props) {
  const visible = RUNES.filter((r) => r.status === 'active');
  return (
    <main className="screen runes-screen">
      <Header title="Runen" onBack={onBack} />
      <div className="scroll rune-list">
        <p className="muted small">
          Rüste eine Rune aus. Im Duell kannst du sie einmal in deinem Zug einsetzen – vor dem Legen einer Karte, ohne den Zug zu verbrauchen.
          Die Rune bleibt in deiner Sammlung. In der Rangliste hat jeder alle vier Grundrunen.
        </p>
        {visible.map((r) => {
          const have = r.unlock.kind === 'start' || owned.includes(r.id);
          const on = equipped === r.id;
          const rules = runeRules(r);
          return (
            <button key={r.id} type="button" className={`rune-row ${on ? 'equipped' : ''} ${have ? '' : 'locked'}`} disabled={!have} aria-pressed={on} onClick={() => onEquip(on ? null : r.id)}>
              <RuneBadge rune={r} />
              <span className="rune-row-main">
                <b>{r.name}</b>
                <span className="small">{r.description}</span>
                <span className="muted small">
                  {RARITY_LABEL[r.rarity]}{rules.cls ? ` · ${CLASS_INFO[rules.cls].icon} ${CLASS_INFO[rules.cls].label}` : ''} · {(Object.keys(r.modes) as (keyof typeof r.modes)[]).filter((m) => r.modes[m]).map((m) => MODE_NAME[m]).join(', ')}
                </span>
                {!have && <span className="small">🔒 {lockText(r)}</span>}
              </span>
              <span className={`rune-equip ${on ? 'on' : ''}`}>{on ? 'Ausgerüstet' : have ? 'Ausrüsten' : ''}</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
