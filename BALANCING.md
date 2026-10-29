# Balancing – Ergebnisse und Entscheidungen

Alle Zahlen stammen aus automatischen Testpartien mit dem echten Kartenbestand (101 Karten, Stand 27.10.2026).
„Einfach“ = gieriger Computerspieler, „Vorausschauend“ = Computerspieler, der die beste Antwort des Gegners einrechnet.
Menschen spielen anders – die Zahlen zeigen Richtungen, keine exakten Werte.

## Startvorteil im Duell

| Variante | Spielstärke | Startspieler | Zweiter | Unentschieden |
|---|---|---|---|---|
| Standard (16 Felder) | einfach | 20,3 % | 60,0 % | 19,8 % |
| Standard (16 Felder) | vorausschauend | 23,5 % | 52,8 % | 23,7 % |
| Startbonus +1 Punkt | einfach / vorausschauend | 40,1 % / 47,2 % | 60,0 % / 52,8 % | 0 % |
| Startbonus +3 Punkte | einfach / vorausschauend | 62,9 % / 69,5 % | 37,1 % / 30,5 % | 0 % |
| **Felsfeld (15 Felder)** | einfach / vorausschauend | **43,9 % / 53,3 %** | **56,1 % / 46,7 %** | **0 %** |

**Entscheidung:** In der Collection League blockiert in jedem Duell ein zufälliger Fels ein Feld.
Der Startspieler legt dann die letzte Karte; je nach Spielstärke liegt er knapp über oder unter 50 %, und
ein Unentschieden ist unmöglich. Das Abenteuer behält vorerst die alten Regeln (16 Felder).

## Match-Format (Collection League)

Zwei Runden mit derselben Hand und getauschtem Start. 2:0 gewinnt, bei 1:1 entscheidet ein Entscheidungsduell
(neuer Münzwurf, Felsfeld). Automatischer Test: Im Entscheidungsduell gewinnt der Startspieler 40–60 % (bestanden).

## Deckregeln (Collection League)

20 Karten, höchstens 2 gleiche, höchstens 1 legendäre, 1 mystische und 4 epische Karten.

## Karten-Stärke

Siegquote einer Karte in zufälligen Händen: gewöhnlich 34 %, ungewöhnlich 38 %, selten 43 %, episch 45 %,
legendär 46 %, mystisch 48 %. „Alba“ (vorher 9/9/9/9, Σ 36, stärkste Karte) wurde auf 8/7/8/7 (Σ 30) gesetzt.

## Faire Lauf-Angebote

Ein Match-Seed erzeugt alles Zufällige; vor dem Match wird nur sein SHA-256-Fingerabdruck gezeigt.
Deckkarten werden wie von einem gemischten Stapel gezogen (2 pro Tor, 16 von 20), die neutrale Entdeckung ist für
beide Spieler gleich (gewöhnlich bis selten, Σ 17–21). Steine sind für beide Spieler identisch.
Spurwechsel werden aufgezeichnet; der Lauf lässt sich exakt nachspielen (Grundlage für die Server-Prüfung).

## Klassen, Effekte und Arenen (Version 1.7)

Effektstärke in Σ-Punkten, gemessen mit gepaarten Testduellen (6000 Duelle je Effekt, zwei unabhängige Läufe;
1 Σ ≈ 2,1–2,5 Prozentpunkte Siegquote): Kampfgeist 2,1 · Schildwall 3,5 · Arkane Kraft gemessen ≈ 5, eingetragen
**4** (so entschieden) · Magische Barriere 1 · Naturbund 0,9 · Schwächender Blick 3,1. Gelände-Effekte hängen von der
Arena ab: Wurzelkraft 0,9, Flammenherz/Frostpanzer/Schattenmantel je 0,3. Im Admin-Editor und im Balancing zählt
„Summe der Werte + Effektstärke“.

Arenen: Startspieler-Siegquote mit Fels, alle Karten mit Effekt, je 3000 Duelle: Klassisch 46,6 % · Waldlichtung
45,9 % · Vulkankrater 46,6 % · Frostsee 46,5 % · Schattenhain 46,4 % · Grenzland 46,0 % (kein Unentschieden).
Ranglisten-Arenen müssen spiegelgleich sein (Feld i = Feld 15 − i), jedes Gelände 0× oder ≥2×, höchstens 8
Geländefelder; der Fels liegt nur auf normalen Feldern.

**Element-Bonus (v1.13):** Karten auf dem Gelände ihres Elements (Natur→Wald, Feuer→Lava, Frost→Eis, Schatten→Schatten) bekommen +1 auf alle Werte; Krieger und Magier haben kein Element. Simulation Naturkarten gegen Krieger: Waldlichtung 24 % → 47 %, Grenzland 24 % → 40 %, Klassische Arena unverändert 24 %. Seit v1.15 haben auch Magier (ᚱ Runenfeld) und Krieger (⚔️ Schlachtfeld) ein Element. Seit v1.14 gibt Gelände höchstens +1: Geländeeffekte wirken nicht zusätzlich zum Element.


## Runen, Wirbelwind, Kettenübernahme (v1.20, Simulation)

Je 400 Duelle, mittlere KI auf beiden Seiten, zufällige Hände aus gewöhnlichen/ungewöhnlichen Karten. Ausgangslage ohne Neuerungen: 40 % Sieg / 37 % Niederlage (Rest unentschieden).

| Variante | Sieg | Niederlage | Hinweis |
|---|---|---|---|
| 2 Karten mit Wirbelwind | 46 % | 32 % | mäßiger Vorteil; mit Werten je −1 (Σ −4) schon 33 % → Stärke ≈ Σ 2 |
| 2 Karten mit Kettenübernahme (max. 2 Stufen) | 69 % | 15 % | sehr stark; ~1,5 Kettenzüge und ~1,6 zusätzliche Übernahmen pro Duell |
| 4 Karten mit Kettenübernahme | 83 % | 9 % | |
| Kettenübernahme unbegrenzt | 69 % | 15 % | Ketten werden auf 4×4 selten länger als 2 Stufen |
| Kettenübernahme mit Werten je −1 / −2 | 58 % / 41 % | 25 % / 40 % | ausgeglichen bei Σ −8 → Stärke ≈ Σ 7 |
| Rune der Verdrehung | 40 % | 36 % | KI nutzt sie selten (26 %); wirkt vor allem verteidigend |
| Rune des Nachhalls | 59 % | 20 % | stark (ein zusätzlicher Angriff) |
| Rune der Glut | 40 % | 37 % | nur mit Feuerkarten auf dem Feld nützlich (gemischte Decks: selten) |
| Rune des Fluchs | 51 % | 26 % | mittel |
| Nachhall gegen Fluch | 48 % | 31 % | |

Folgerungen: Stärke-Werte für die Balancing-Hinweise im Karteneditor: Wirbelwind Σ 2, Kettenübernahme Σ 7 (eine Karte mit Kettenübernahme braucht etwa 2 Punkte weniger pro Seite als eine Karte gleicher Seltenheit ohne Fähigkeit). Offene Entscheidung: Nachhall eventuell auf „höchstens 1 Übernahme“ begrenzen; Glut ist nur in Feuer-Decks stark.
