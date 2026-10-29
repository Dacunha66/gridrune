import { AbilityMedallion, ClassShield } from '../components/cardIcons';
import { Header } from './Header';
import { CLASSES, CLASS_INFO, CLASS_TERRAIN, EFFECT_IDS, EFFECTS, TERRAINS, TERRAIN_INFO } from '../game/effects';

export function Rules({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen rules">
      <Header title="Regeln" onBack={onBack} />
      <div className="scroll prose">
        <h2>1 · Der Lauf</h2>
        <p>Deine Figur rennt von allein. Wische nach links/rechts oder tippe auf ◀ ▶, um die Spur zu wechseln.</p>
        <p>Du kommst durch <b>8 Tore</b> mit je 3 Karten und nimmst die Karte auf deiner Spur:</p>
        <ul>
          <li><b>Tor 1–7</b> – Karten aus <b>deinem Deck</b>. Stell dir dein Deck vorher gut zusammen!</li>
          <li><b>Tor 8 (Finale)</b> – <b>3 neue Karten</b> mit „NEU“. Die gewählte spielst du im Duell; <b>gewinnst du, gehört sie dir</b>.</li>
        </ul>
        <p><b>Stolpersteine</b> halten dich nicht auf, aber die <b>nächste Karte</b>, die du danach nimmst, ist im Duell um <b>1 schwächer</b> (alle vier Werte, mindestens 1). Weiche ihnen aus! Mit ⏩ läufst du schneller.</p>

        <h2>2 · Das Duell</h2>
        <p>Ein 4×4-Feld, du und der Computer habt je 8 Karten und legt abwechselnd eine Karte auf ein freies Feld.</p>
        <p>Jede Karte hat 4 Werte (oben, rechts, unten, links). Liegt daneben eine gegnerische Karte, wird verglichen: <b>deine Seite gegen die zugewandte Seite</b> der Nachbarkarte.</p>
        <p>Ist dein Wert <b>höher</b>, gehört die Karte jetzt dir. Gleichstand übernimmt nicht. Diagonal zählt nicht, und es gibt keine Kettenreaktionen.</p>
        <p>Nach 16 Zügen gewinnt, wer mehr Felder besitzt. 8:8 ist unentschieden.</p>
        <p>Vor dem Duell entscheidet ein <b>Münzwurf</b>: Wer gewinnt, wählt, wer beginnt. Tipp: Wer die <b>letzte</b> Karte legt, hat oft einen Vorteil.</p>

        <h2>Klassen, Effekte und Gelände</h2>
        <p>Jede Karte gehört zu einer <b>Klasse</b> (Symbol im Zahnrad oben links): {CLASSES.map((c) => `${CLASS_INFO[c].icon} ${CLASS_INFO[c].label}`).join(' · ')}. Jede Klasse hat ein <b>Element</b>: 🌿 Natur → 🌲 Wald, 🔥 Feuer → 🌋 Lava, ❄️ Frost → ❄️ Eis, 🌑 Schatten → 🌑 Schatten, 🔮 Magier → ᚱ Runenfeld, ⚔️ Krieger → ⚔️ Schlachtfeld.</p>
        <p>Manche Karten haben einen <b>Spezialeffekt</b> – erkennbar am <b style={{ color: 'var(--accent)' }}>goldenen Symbol</b> unten rechts (große Ansicht: Effekttext auf dem Pergament). Effekte gelten nur im laufenden Duell; im nächsten Duell ist alles wieder normal.</p>
        <ul>
          {EFFECT_IDS.map((id) => <li key={id}>{EFFECTS[id].cls ? CLASS_INFO[EFFECTS[id].cls!].icon : '✦'} <b>{EFFECTS[id].name}</b>: {EFFECTS[id].text}</li>)}
        </ul>
        <p>„Beim Ausspielen“-Effekte wirken <b>vor</b> dem Vergleich und nur einmal. Bedingungen (z. B. „solange eine eigene Karte angrenzt“) werden laufend neu geprüft: Wird eine Nachbarkarte erobert, ändert sich der Bonus sofort – aber es wird dadurch nie nachträglich etwas erobert.</p>
        <p><b>Gelände</b> (farbiger Rand): {TERRAINS.filter((t) => t !== 'normal').map((t) => `${TERRAIN_INFO[t].icon} ${TERRAIN_INFO[t].label}`).join(' · ')}. Liegt eine Karte auf dem Gelände ihres Elements, bekommt sie <b>+1 auf alle Werte</b> (das Feld leuchtet beim Auswählen). Mehr als +1 gibt Gelände nie: Geländeeffekte wie Wurzelkraft wirken nicht zusätzlich zum Element. Der Fels liegt immer auf einem normalen Feld.</p>
        <p>Die Werte stehen in Tintenklecksen. Auf dem Spielfeld zeigt ein dünner Ring, wem die Karte gehört: <b style={{ color: 'var(--player)' }}>blau</b> (deine Karte) oder <b style={{ color: '#ff6b6b' }}>rot</b> (Gegner). <b style={{ color: '#4ade80' }}>Grüner Klecks</b> = gerade verstärkt, <b style={{ color: '#ffb15c' }}>orange Zahl</b> = geschwächt, 🛡 unten links = Schild. Werte bleiben immer zwischen 1 und 10. <b>Tippe eine Karte auf dem Feld an</b>, um Klasse, Effekt und alle Änderungen zu sehen. <b>Halte eine Handkarte gedrückt</b> für eine große Vorschau.</p>

        <h2>Symbole auf den Karten</h2>
        <p>Halte den Finger auf ein Symbol einer Karte, um die Erklärung zu sehen. <b>Wappenschild oben links</b> = Klasse mit ihrem Element, <b>goldenes Medaillon oben rechts</b> = Fähigkeit.</p>
        <ul className="symbol-legend">
          {CLASSES.map((c) => (
            <li key={c}>
              <span className="legend-icon"><ClassShield cls={c} /></span>
              <span><b>{CLASS_INFO[c].label}</b> · Element {TERRAIN_INFO[CLASS_TERRAIN[c]].icon} {TERRAIN_INFO[CLASS_TERRAIN[c]].label}: dort +1 auf alle Werte</span>
            </li>
          ))}
          {EFFECT_IDS.map((id) => (
            <li key={id}>
              <span className="legend-icon"><AbilityMedallion effect={id} /></span>
              <span><b>{EFFECTS[id].name}</b> · {EFFECTS[id].short}</span>
            </li>
          ))}
        </ul>

        <h2>3 · Belohnung</h2>
        <p>Sieg: 🪙 100 und die seltenste neue <b>Entdeckung</b> aus deinem Lauf wird dauerhaft freigeschaltet. Hattest du sie schon, gibt es 🪙 50 extra.</p>
        <p>Unentschieden: 🪙 40 · Niederlage: 🪙 15</p>

        <h2>Shop</h2>
        <p>Im Shop kaufst du mit Münzen <b>Booster-Packs</b> (3 Karten, neue Karten werden sofort freigeschaltet, doppelte in Münzen umgetauscht) und <b>Skins</b>, die nur das Aussehen ändern.</p>

        <h2>Symbole auf Karten</h2>
        <p><b style={{ color: 'var(--accent)' }}>★</b> in der Ecke = Entdeckung (gold leuchtend: neue Karte) · <b style={{ color: '#22d3ee' }}>◆</b> = neutrale Entdeckung in der Liga · orange Zahl = geschwächt (Stolperstein) · Zahnrad oben links = Klasse · Edelstein = Seltenheit · goldenes Symbol unten rechts = Spezialeffekt.</p>

        <h2>Deck</h2>
        <p>Dein Deck besteht aus genau 20 verschiedenen Karten aus deiner Sammlung.</p>
        <p>Es gibt 100 Karten. Der Edelstein zeigt die Seltenheit (oben rechts, in der großen Ansicht unter dem Bild) – je seltener, desto stärker: <b>silber</b> gewöhnlich, <b style={{ color: 'var(--uncommon)' }}>grün</b> ungewöhnlich, <b style={{ color: 'var(--rare)' }}>türkis</b> selten, <b style={{ color: 'var(--epic)' }}>lila</b> episch, <b style={{ color: 'var(--legendary)' }}>gold</b> legendär und <b className="rarity-text rarity-mythic">regenbogen</b> mystisch (sehr selten!). Ab episch leuchtet der Edelstein.</p>
      </div>
    </main>
  );
}
