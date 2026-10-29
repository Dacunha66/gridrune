# Testprotokoll

## Version 1.22 – Runen für alle, Nachhall ab Spielmitte, Runen in der Liga

Neu (nach deiner Freigabe):
- **Freigabe für alle Spieler:** Runen sowie Wirbelwind und Kettenübernahme sind jetzt standardmäßig für alle freigegeben. Im Admin-Reiter „Runen“ kannst du jederzeit wieder auf „Nur Admin“ oder „Aus“ stellen.
- **Nachhall ab Spielmitte:** erst einsetzbar, wenn mindestens 8 Karten auf dem Spielfeld liegen. Vorher zeigt die Runen-Erklärung „Einsetzbar ab der Spielmitte: x/8 Karten“. Die Schwelle ist im Admin je Rune einstellbar („Einsetzbar ab“: Duellbeginn bis 12 Karten); Varianten übernehmen sie. Die anderen Runen gelten weiter ab Duellbeginn.
- **Runen in der Liga:** Du nutzt deine ausgerüstete Grundrune, der Gegner bekommt pro Match eine Grundrune (fest durch den Match-Seed, in jeder Runde gleich). Jede Rune einmal pro Duell. Das Liga-Intro zeigt beide Runen; eine Kampagnen-Rune wird in der Liga mit Hinweis nicht verwendet.
- **Runen-Buttons überall:** im Hauptmenü (mit ausgerüsteter Rune), im Kampagnen-Briefing, im Liga-Intro und in den Regeln (neuer Abschnitt „Runen“ mit den vier Grundrunen).
- **Regeln-Text korrigiert:** „keine Kettenreaktionen“ → Kettenreaktionen nur mit Kettenübernahme (Stufenzahl wie im Admin eingestellt).

**Automatische Tests (219, alle bestanden), neu:** Nachhall mit 7 Karten gesperrt (keine Ziele, Fehlermeldung, KI ohne Optionen), ab 8 Karten einsetzbar; andere Runen ab Duellbeginn; Schwelle im Admin änderbar, für Varianten übernommen, ältere gespeicherte Runen behalten die eingebaute Schwelle.

**Simulation (400 Duelle, mittlere KI):** ohne Rune 41 % Siege, Nachhall 65 % (vorher 63 %), Fluch 55 %, Verdrehung 41 %, Nachhall gegen Fluch 52 % : 26 %. Die Spielmitte-Schwelle schwächt Nachhall also **nicht**: Die KI hat Nachhall ohnehin meist spät eingesetzt, wenn mehr Karten zum Angreifen daliegen.

**Browser (iPhone, Spieler ohne Admin-Rechte):** Menü-Knopf „Runen“ mit Runen-Button und Name der ausgerüsteten Rune; Regeln mit Runen-Abschnitt (4 Buttons) und richtigem Ketten-Text; Kampagnen-Briefing mit Buttons „Deine Rune“/„Gegner“; Liga: Intro mit beiden Runen, Runenleiste im Liga-Duell, Nachhall bei 0 Karten gesperrt („0/8 Karten“), später eingesetzt, ganzes Match (Lauf + Runden) ohne Fehler.

## Version 1.21 – Nachhall höchstens 1 Übernahme (Freigabe: nur Admin)

Neu (nach deiner Entscheidung): Die **Rune des Nachhalls** übernimmt pro Einsatz höchstens **eine** Gegnerkarte. Könnten mehrere benachbarte Gegnerkarten übernommen werden, wählt der Spieler nach seiner eigenen Karte die Gegnerkarte aus (hervorgehoben, „Welche Gegnerkarte übernehmen? Antippen“); ✓ erst nach der Wahl. Ist nur eine Übernahme möglich, gibt es keine Auswahl. Nie eine Kettenreaktion – auch nicht, wenn die angreifende Karte Kettenübernahme hat. Die Höchstzahl ist im Admin (Reiter „Runen“ → Nachhall → „Höchstens Übernahmen pro Einsatz“, 1–3, Standard 1) einstellbar. Kettenübernahme unverändert: für alle sechs Klassen im Karteneditor vergebbar, keine Bindung an Seltenheit, höchstens 2 weitere Stufen (Reiter „Runen“ → Kettenlänge). Freigabe bleibt „Nur Admin“. Spielregeln und Kartendaten sonst unverändert.

**Automatische Tests (217, alle bestanden), neu:** Nachhall verlangt bei mehreren Möglichkeiten eine Wahl und übernimmt nur die gewählte Karte; Angreifer mit Kettenübernahme löst über Nachhall keine Kette aus; bei nur einer Möglichkeit keine Wahl nötig; Admin-Höchstzahl 2 erlaubt 2; alle KI-Optionen gültig; Kette beim Legen bleibt unabhängig davon erhalten.

**Simulation (400 Duelle, mittlere KI):** ohne Rune 41 % Siege, Nachhall 63 % (mit Höchstzahl 3 ebenfalls 63 %), Fluch 55 %. Mehrfach-Übernahmen kommen nur selten vor (6 von 400 Duellen) – Nachhall bleibt vor allem durch den zusätzlichen Angriff stark.

**Browser (iPhone, Admin):** Nachhall ausgerüstet; eigene Karte mit 2 übernehmbaren Nachbarn gewählt → Hinweis „Welche Gegnerkarte übernehmen?“, ✓ gesperrt; Gegnerkarte gewählt → ✓ aktiv; nach dem Einsatz hat sich genau das gewählte Feld geändert; Protokoll „greift erneut an – erobert 1 (C1)“; keine Fehler.

## Version 1.20 – Runen, Wirbelwind, Kettenübernahme (Freigabe: nur Admin)

Neu (nach deinen Entscheidungen): klassenübergreifende Fähigkeiten **Wirbelwind** (Ausrichtung beim Legen in 90°-Schritten, Vorschau auf dem Feld mit ↺ ↻, „Legen“ und ✕, keine versehentliche Platzierung) und **Kettenübernahme** (eroberte Karten greifen weiter an, Welle für Welle, höchstens 2 weitere Stufen – im Admin einstellbar, 0 = unbegrenzt; jede Karte greift höchstens einmal an; Animation mit Energielinien und „KETTENÜBERNAHME ×N“). **Runen**: eine Rune pro Duell ausrüsten (Menü „Runen“), einmal im eigenen Zug vor dem Legen einsetzen, ohne den Zug zu verbrauchen, bleibt in der Sammlung; Runenleiste mit eigener und gegnerischer Rune (verfügbar/verbraucht), Beschreibung per Antippen, Zielwahl mit Bestätigen/Abbrechen, Spielprotokoll 📜. Vier Grundrunen (Verdrehung, Nachhall, Glut bis zu 2 Feuerkarten +1, Fluch Klasse + bis zu 2 Karten −1) für alle; weitere Runen per Kampagne (Mission/Sterne); Varianten nie stärker; Rangliste nur Grundrunen. Gegner: Abenteuer zufällige Grundrune, Kampagne im Editor wählbar (Elite/Boss mit Rune). Admin: Reiter „Runen“ (Freigabe Aus / Nur Admin / Alle, Kettenlänge, Runen anlegen/bearbeiten/deaktivieren, Bild und Symbol, Seltenheit, Effektart, Stärke, Ziele, Modi, Freischaltung), Karteneditor bietet die beiden Fähigkeiten für alle Klassen. Kartendetails: Ausrichtung, ⏳ bis Duellende / 📍 solange aktiv. KI: dreht Wirbelwind-Karten, rechnet Ketten mit, setzt Runen nur bei klarem Vorteil ein (Schwelle sinkt gegen Ende) und nutzt **keine verdeckten Infos** mehr (deine Handkarten kennt sie nicht). Supabase-Migration 006 vorbereitet, nicht ausgeführt. Standard-Freigabe „Nur Admin“: Spieler spielen unverändert.

**Automatische Tests (211, alle bestanden), neu:** Drehung (Werte, Kampf mit Ausrichtung, nur Wirbelwind-Karten, Boni wandern mit und werden nicht verdoppelt), Kette (Wellen, ohne Fähigkeit keine Kette, Stufengrenze 1/2/unbegrenzt, volles Feld ohne Endlosschleife, gleiches Ergebnis), Runen (einmal pro Duell, Zug bleibt, keine Platzierung verbraucht, nicht nach Spielende, Ziele/Klassen/Höchstzahl, Wertgrenzen 1–10, später gelegte Karten unberührt, Barriere blockt Fluch, Fluch + Element, Varianten nie stärker, Rangliste nur Grundrunen, Nachspielen mit Runen).

**Simulation:** siehe BALANCING.md – Kettenübernahme sehr stark (2 Karten: 69 % statt 40 % Siege), Stärke-Hinweis im Karteneditor daher Σ 7; Wirbelwind Σ 2; Nachhall stark (59 %), Fluch mittel (51 %), Verdrehung/Glut situativ. KI „schwer“ ohne verdeckte Infos: 69:60 gegen „mittel“ (vorher mit Einblick 92:39).

**Browser (iPhone):** Admin: Menü „Runen“, Fluch ausgerüstet, Runenleiste beidseitig, Wirbelwind-Vorschau dreht (oben 5/rechts 5/unten 5/links 4 → 4/5/5/5), gelegt mit ↻90°-Marke, Rune eingesetzt → verbraucht, Zug bleibt beim Spieler, Gegner-Kette sichtbar, Protokoll vollständig; Spieler ohne Freigabe: kein Runen-Menü, keine neuen Fähigkeiten, keine Runenleiste. iPhone SE: Hand vollständig sichtbar. Abenteuer, Kampagne, Liga und Kampagnen-Editor ohne Fehler.

## Version 1.19 – Hybrid Premium für alle, Symbol-Erklärungen

Neu: „Hybrid Premium“ ist jetzt das Kartendesign für alle Spieler. Im Admin-Reiter „Kartendesign“ bleiben nur „Hybrid Premium“ und „Standard (Steampunk)“ (nur auf dem eigenen Gerät, zum Vergleich) sowie „Beide im Vergleich“; die übrigen Testvarianten sind entfernt. Symbol-Erklärungen: Finger auf das Klassen-Wappen oder das Fähigkeits-Medaillon halten (oder antippen, wo die Karte selbst nichts tut, z. B. große Ansicht) → Erklärung mit Klasse, Element und Bonus bzw. Fähigkeitstext; Antippen woanders schließt sie. In der Hand wird beim Halten eines Symbols weder die Karte gewählt noch die große Vorschau geöffnet. Regeln-Seite mit Symbol-Legende (6 Klassen mit Element, 10 Fähigkeiten); Kartendetails zeigen das Element. Spielregeln, Werte und Daten unverändert.

**Automatische Tests:** 186, alle bestanden.

**Browser (iPhone):** Spieler ohne Admin-Rechte sieht Hybrid Premium, kein 🎨-Knopf. Halten des Klassen-Wappens → „Magier · Klasse / Element Runenfeld …“, Karte nicht gewählt, keine große Vorschau; Halten des Medaillons → Naturbund-Text; Tippen woanders schließt; normales Tippen wählt die Karte weiterhin, Halten auf dem Bild öffnet weiterhin die große Vorschau. Legende mit 16 Einträgen. Abenteuer und Kampagne (Tutorial, Boss, Lauf-Mission) ohne Fehler.

## Version 1.18 – Hybrid Premium Fantasy (Test, nur Admin-Gerät)

Neu im Admin-Reiter „Kartendesign (Test)“: zwei weitere Varianten auf Basis des Hybrid-Designs – „Hybrid Premium Fantasy“ (Werte als plastische Metall-Medaillons) und „Hybrid Premium (dezente Werte)“ (flache, halbtransparente Plaketten). Äußerer Rahmen = Spielerfarbe Rot/Blau (oberste Ebene, wechselt bei Übernahme mit kurzer Animation), innerer Rahmen = Material der Klasse (Holz, glühendes Eisen, Silber, Obsidian, Stahl, arkane Runen), Klasse oben links (Wappenschild), Fähigkeit oben rechts (Medaillon), Namensleiste bis zwei Zeilen mit Silbentrennung, Seltenheit als farbige Linie unter dem Namen. Auf sehr kleinen Karten (iPhone SE) ohne Namensleiste. Ansichten: „Bisheriger Hybrid“, „Hybrid Premium Fantasy“, „Beide im Vergleich“; Beispielfeld mit 8 roten und 8 blauen Karten, Antippen wechselt die Besitzerfarbe (nur in der Vorschau). Bisherige Designs, Spielregeln, Werte und Datenbank unverändert.

**Automatische Tests:** 186, alle bestanden.

**Browser:** Voll gespieltes Duell (16 Karten) je Variante auf iPhone, iPhone SE und iPad: 0 verdeckte oder abgeschnittene Werte/Symbole, 0 Fehler. Werte iPhone 12,3 px (bisheriger Hybrid 12), SE 12, iPad 22,1; „10“ passt vollständig. Namensgröße: Messung aller 101 Kartennamen bei 73 px Kartenbreite – 9,5 / 10,5 / 11,5 Einheiten: 90 / 81 / 66 einzeilig, keiner abgeschnitten; gewählt 10,5 (7,7 px), 20 Namen zweizeilig. Besitzerwechsel per Antippen: Blau → Rot, Klassenrahmen und Inhalt unverändert. Klassenrahmen auf dem iPhone nur als schmaler Streifen erkennbar, Ornamente erst auf dem iPad / in der großen Ansicht.

## Version 1.17 – Kartendesign 2.0 (Test, nur Admin-Gerät)

Neu: Vier umschaltbare Kartendesigns als Vorschau – Design 2 klassisch, Design 2 kompakt (auf dem Spielfeld ohne Namen), Design 3 geteilt, Design 4 hybrid – plus das aktuelle Design zum Vergleich. Umschalten im Admin-Reiter „Kartendesign (Test)“ (mit vollem Beispielfeld in iPhone- und SE-Größe) und im Duell mit dem 🎨-Knopf (nur für Admins). Die Wahl gilt nur für dieses Gerät; alle Spieler sehen weiter das aktuelle Design. Neue Symbolsprache: Klasse = Wappenschild in Klassenfarbe, Fähigkeit = goldenes Medaillon mit eigenem Symbol; Bonus/Malus zusätzlich mit ▲/▼; Seltenheit als Rahmenfarbe (eisengrau, bronze, silberblau, violett, gold, regenbogen). Spielregeln, Werte, Sammlungen und Spielstände unverändert.

**Automatische Tests:** 186, alle bestanden.

**Browser (je Design ein voll gespieltes Duell mit 16 Karten, iPhone 390 × 664, iPhone SE 375 × 548, iPad 820 × 1050 – 15 Durchläufe):** 0 Werte oder Symbole verdeckt oder außerhalb der Karte, 0 Fehler. Gemessen (iPhone / SE / iPad, Pixel): Werte aktuell 12 / 12 / 18,2 · klassisch 12,7 / 11,5 / 21,4 · kompakt 14,1 / 11,5 / 25,3 · geteilt 11,5 / 11,5 / 19,5 · hybrid 12 / 11,5 / 21,4. Namen klassisch 8–8,9 / 6,2 / 14,3–14,9 · geteilt und hybrid 7,5–7,6 / 5,6 / 13,6 · kompakt im Spielfeld ohne Namen. Symbole 12–16 px (iPhone).

## Version 1.16 – Jede Deckkarte nur einmal pro Lauf

Neu: Im Lauf (Abenteuer und Kampagnen-Lauf) kann jede Karte aus dem 20er-Deck nur einmal genommen werden. Die Tore 1–7 verteilen zuerst alle 20 Deckkarten, bevor sich eine wiederholt; wird eine Karte genommen, wird sie in den späteren Toren durch eine noch nicht genommene Deckkarte ersetzt. Die Liga bleibt unverändert (dort sind 2 Kopien einer Karte erlaubt, die Bahn ist fest).

**Automatische Tests:** 186, alle bestanden (neu: 50 Bahnen – 21 Plätze, 20 verschiedene Karten; 300 Läufe mit zufälligen Spuren – nie eine Karte doppelt; Liga-Bahnen bleiben unverändert).

**Browser:** 12 Läufe mit zufälligen Spurwechseln: jedes Mal 8 verschiedene Karten auf der Hand, 0 Fehler.

## Version 1.15 – Runenfeld und Schlachtfeld

Neu: Zwei Geländearten, damit jede Klasse ein Element hat – ᚱ Runenfeld (Magier, blau) und ⚔️ Schlachtfeld (Krieger, rot). Gleiche Regel wie bei allen Elementen: +1 auf alle Werte, nie mehr. Im Arena-Editor als Pinsel wählbar; Ranglisten-Regeln unverändert (spiegelgleich, höchstens 8 Geländefelder, jedes Gelände 0× oder ≥ 2×). Bestehende Arenen unverändert. Supabase-Änderung (neue Geländearten und Arena-Status „Nur Kampagne“) als Migration 005 vorbereitet, noch nicht ausgeführt.

**Automatische Tests:** 183, alle bestanden (neu: Magier auf Runenfeld und Krieger auf Schlachtfeld +1, Krieger nur dort).

**Browser:** Arena-Editor (iPhone): neue Pinsel, Felder in Blau mit ᚱ und Rot mit ⚔️, spiegelgleiche Arena ohne Ranglisten-Hinweis, 0 Fehler.

## Version 1.14 – Gelände gibt höchstens +1

Auf deinen Wunsch: Gelände gibt nie mehr als +1. Liegt eine Karte auf dem Gelände ihres Elements, zählt nur der Element-Bonus (+1 auf alle Werte); Geländeeffekte (Wurzelkraft, Flammenherz, Frostpanzer, Schattenmantel) wirken dort nicht zusätzlich. Effekttexte, Effekt-Vorschau im Admin, Regeln und Kampagnen-Prüfung („Effekt auslösen“ mit Geländeeffekt wird als nicht erreichbar gemeldet) angepasst.

**Automatische Tests:** 182, alle bestanden (Geländeeffekte jetzt „insgesamt nur +1“).

## Version 1.13 – Element-Bonus auf Gelände

Neue Regel (von dir freigegeben): Jede Karte bekommt auf dem Gelände ihres Elements +1 auf alle Werte – 🌿 Natur auf 🌲 Wald, 🔥 Feuer auf 🌋 Lava, ❄️ Frost auf ❄️ Eis, 🌑 Schatten auf 🌑 Schatten. Krieger und Magier haben kein Element. Geländeeffekte (Wurzelkraft, Flammenherz, Frostpanzer, Schattenmantel) bleiben unverändert und wirken zusätzlich. Beim Auswählen einer Karte leuchten die Felder, auf denen sie ihren Bonus bekommt; der Hinweis unter dem Spielfeld nennt den Bonus, die Kartendetails zeigen „Element … (auf diesem Feld)“. Regeln-Seite, Effekt-Vorschau im Admin und Kampagnen-Ziele „Geländeboni“ angepasst (Mooslichtung jetzt 2, Herz des Waldes 3 Geländeboni).

**Automatische Tests (182, alle bestanden), neu:** Element-Bonus für alle vier Elemente nur auf dem passenden Gelände, kein Bonus für Krieger/Magier, Bonus auch bei der Verteidigung, Element + Geländeeffekt addieren sich, Geländeziel zählt Naturkarten auf Wald; Fairness-Test der Arenen (Startspieler 38–62 %) besteht weiterhin.

**Simulation (je 120 Duelle, mittlere KI, gewöhnliche/ungewöhnliche Naturkarten gegen Krieger):** Klassische Arena 24 % (unverändert), Waldlichtung 24 % → 47 %, Grenzland 24 % → 40 %. Das Gelände zählt also spürbar.

**Browser:** Mooslichtung auf dem iPhone: Schwanenmaid (5/3/7/4) liegt auf Wald mit 6/4/8/5 und leuchtet; Sumpfechse (4/4/3/4) mit Element und Wurzelkraft 6/6/5/6; 6 Waldfelder leuchten beim Auswählen.

## Version 1.12 – Kampagne (Vorschau ohne Belohnungen)

Neu: Hauptmenü „Kampagne“ mit Weltauswahl und Weltkarte (Stationen: erledigt ✓, verfügbar leuchtend, gesperrt 🔒, Boss groß, 3 Sterne je Station, Fortschritt in %, Sternbalken mit Meilensteinen). Missions-Briefing (Gegner, KI-Stufe, Arena, Sterne-Ziele, geplante Belohnungen als Vorschau, Tipps, Kartenwahl mit 8 Karten aus dem Deck, Leihkarten nur gewöhnlich), Boss-Intro, Ergebnis mit animierten neuen Sternen. KI-Stufen leicht/mittel/schwer (mittel = bisherige KI). Testwelt „Flüsterwald“ mit 10 Missionen und 10 Gegnern aus bestehenden Karten, neue Arenen „Mooslichtung“ und „Herz des Waldes“ (Status „Nur Kampagne“, nie zufällig im Abenteuer oder in der Liga). Admin-Reiter „Kampagnen-Editor“ (Welten, Missionen, Gegner, Prüfen, Test-Start, Bild-Upload mit Größenangaben und Finger-Ausschnitt). Fortschritt vorerst nur auf dem Gerät (eigener Speicherschlüssel `gridrune/campaign-v1`, normaler Spielstand unverändert). Spielregeln, Kartenwerte und Effekte unverändert.

**Automatische Tests (insgesamt 178, alle bestanden), neu:** Flüsterwald ohne Fehler (nur bestehende Karten, 30 Sterne, Meilenstein 30 erreichbar); feste Ziel-IDs; Meldung fehlender Karten, falscher Deckgröße, unmöglicher Ziele (z. B. 2 Geländeboni, wenn nur 1 Karte Wurzelkraft hat), Kreis- und unerreichbarer Freischalt-Bedingungen; alle Zusatzziele brauchen einen Sieg; Nachspielen der Züge ergibt dieselben Felder/Eroberungen wie das Duell; Geländebonus und Naturbund werden genau gezählt; Sterne gehen nie verloren (schlechteres Ergebnis, geändertes Ziel); neue Sterne nur einmal gemeldet; Missionen öffnen sich nacheinander (Entwürfe werden übersprungen); Speicherstand robust und getrennt; Leihkarten nur gewöhnlich und von der verlangten Klasse; Kartenvorschlag erfüllt Klassenziele und meidet verbotene Klassen; ungültige Datenbank-Dokumente werden bereinigt; jede KI-Stufe spielt nur erlaubte Züge, „mittel“ ist exakt die bisherige KI, „schwer“ schlägt „leicht“ deutlich. Simulation: „schwer“ gewinnt mit gleichen Karten 92 : 39 gegen „mittel“ (160 Duelle).

**Browser-Durchlauf (Spieler, iPhone 390 × 664):** Menü → Kampagne → Weltkarte (nur Mission 1 offen) → Briefing → Kartenwahl → Duell (Tutorial-Gegner, Arena-Anzeige) → Ergebnis mit Zielen und Fortschritt → gespeichert. Boss: Briefing → Intro → Duell im Herz des Waldes → eigener Sieg-/Niederlagen-Bildschirm. Lauf-Mission „Verwunschener Pfad“: Lauf → Duell → Ergebnis. Weltkarte und Briefing zusätzlich auf iPhone SE und iPad. 0 Fehler.

**Browser-Durchlauf (Admin):** Kampagnen-Editor öffnen, Prüfen (mit den echten Kartendaten: Flüsterwald vollständig), Mission bearbeiten (Ziel geändert → neue Ziel-ID, Icon hochgeladen und per Finger verschoben, Station auf der Karte gesetzt), speichern, duplizieren (als Entwurf), Kopie im Testmodus starten, zurück in den Editor. Gegner- und Welt-Editor geöffnet. Als Spieler danach: Änderungen sichtbar. 0 Fehler. Abenteuer und Liga laufen unverändert.

## Version 1.11 – Name und Logo „GridRune“

Neu: Spielname GridRune, Logo im Hauptmenü (Symbol + Schriftzug, „Grid“ hell für den dunklen Hintergrund), Seitentitel, Symbol für Browser-Tab und Home-Bildschirm. Der Speicherschlüssel des Spielstands bleibt unverändert (bestehende Spielstände bleiben erhalten).

**Geprüft:** alle 159 automatischen Tests; Hauptmenü auf iPhone, iPhone SE und iPad ohne Fehler, Titel „GridRune“, beide Symbole eingebunden.

## Version 1.10 – Steampunk-Karten

Neu: Kartendesign im Steampunk-Stil (Bronze-Rahmen mit Nieten, Werte in Tintenklecksen, Zahnrad mit Klassensymbol, geschliffener Seltenheits-Edelstein, Effekt- und Schild-Symbol in Messingkreisen, große Ansicht mit Pergament für Name und Effekt). Besitzer-Ring, Bonus/Malus-Anzeige, Geländeleuchten, Spielfeld-Designer, Spielregeln und Kartendaten unverändert.

**Automatische Tests:** alle 159 bestehen unverändert.

**Browser-Durchlauf:** Spielfeldkarten iPhone 73 × 97 px, iPhone SE 54 × 72, iPad 130 × 173. Sichtbarkeitsprüfung auf 4 Bildschirmgrößen (Abenteuer, Lauf-Vorschau, Liga): 0 verdeckte oder abgeschnittene Werte. Effekt-Duell (iPhone, SE, iPad) 0 Probleme. Spielfeld-Designer inkl. extremer Raster-Einstellungen: alle 16 Felder antippbar, 0 verdeckte Werte. Große Ansicht (Gedrückthalten) zeigt Pergament mit Name und Effekt, Edelstein unter dem Bild. Abenteuer, Admin-Dashboard und Liga ohne Fehler.

## Version 1.9 – Spielfeld-Designer und Seitenhintergrund

Neu: Admin-Reiter „Spielfeld-Designer“ (Upload mit Größenempfehlung, Original unverändert + verkleinerte Kopie, Ausschnitt per Finger/zwei Finger/Regler, Raster-Einstellungen mit festen Grenzen, Vorschau iPhone/iPad mit Beispielkarten, Neu/Bisher-Vergleich, Entwurf, Veröffentlichen mit Bestätigung, zurück zum vorherigen bzw. Standard-Design), eigener Seitenhintergrund mit Abdunklung, Wert-Rauten ohne Flügel, Schild-Symbol oben links. Spielregeln, Karten, Effekte, Gelände und Runner unverändert.

**Automatische Tests (insgesamt 159, alle bestanden), neu:** Grenzen aller Einstellungen, Prüfung ungültiger Datenbank-Dokumente, fortlaufende IDs, Veröffentlichen/Zurück (Spielfeld und Hintergrund unabhängig), Kopie fürs Spiel nie vergrößert oder beschnitten, Verschieben mit dem Finger (Richtung, Grenzen), Zoom um den gewählten Bildpunkt.

**Browser-Durchlauf (Designer):** Upload eines Querformat-Bilds (2400 × 1200) → Original und Kopie gespeichert, Hinweis „anderes Seitenverhältnis“; Ziehen verschiebt den Ausschnitt, Zwei-Finger-Geste zoomt; Regler wirken sofort in der Vorschau; Entwurf speichern ändert das veröffentlichte Design nicht; Veröffentlichen erst nach Bestätigung; Hintergrund sofort sichtbar. Als Spieler auf iPhone, iPhone SE und iPad: Spielfeldbild und Hintergrund sichtbar, alle 16 Felder antippbar, Karten landen auf dem gewählten Feld, 0 verdeckte Werte, Spielfeld und Hand vollständig im Bild – auch mit den extremen Einstellungen (kleinstes/größtes Feld, ganz unten, größte/kleinste Abstände). Kartenverwaltung, Abenteuer und Liga unverändert ohne Fehler.

**Supabase:** Tabellen `designs` und `design_state` (mit Wertgrenzen) und Bildspeicher `design-images` angelegt; alle dürfen lesen, nur Admins schreiben; ein Besucher ohne Anmeldung kann nichts anlegen. Das Spiel speichert vorerst über die Claude-Seite und zieht nach der Netlify-Einrichtung um.

## Version 1.8 – Neues Kartendesign

Neu: Karten mit großem Bild und Metall-Rauten für die Werte (Besitzer am Ring und an den Rauten, Bonus = grüne Mitte, Malus = dunkle Mitte mit oranger Zahl), Seltenheit am Kartenrand (ab episch Juwelen, ab legendär Holo-Glanz und Funkeln), Klassen- und Effekt-Symbol unten, kompakte Kopfzeile, größeres Spielfeld, Hand als wischbare Reihe, große Vorschau beim Gedrückthalten. Spielmechanik, Kartenwerte, Effekte und Daten unverändert.

**Automatische Tests:** alle 151 bestehen unverändert.

**Browser-Durchlauf:** Kartengröße auf dem Spielfeld iPhone 390×664 77×103 px (vorher 58×77), iPhone SE 53×71 (vorher 43×57), iPad 130×173 (vorher 109×145); Zahlen mindestens 11 px. Sichtbarkeitsprüfung auf 4 Bildschirmgrößen: 0 verdeckte oder abgeschnittene Werte (Handkarten außerhalb des sichtbaren Bereichs der wischbaren Reihe werden nicht gezählt). Gedrückthalten zeigt die Vorschau und wählt die Karte nicht aus. Abenteuer, Admin-Dashboard, Liga-Match und Effekt-Duell ohne Fehler.

## Version 1.7 – Klassen, Effekte, Gelände, Arenen

Neu: 6 Klassen, 10 Effekte aus zentralen Vorlagen, 5 Geländearten, 6 Arenen, Admin-Felder (Klasse, Effekt, Vorschau, Stärke) und Reiter „Arenen“, Duell-Anzeige (grün/rot, 🛡, Klassensymbol, Detailansicht, Zielwahl, Effekt-Einblendungen), Computer berücksichtigt Effekte. Grundwerte werden nie verändert; alles gilt nur im laufenden Duell.

**Automatische Tests (insgesamt 151, alle bestanden), neu:** jeder Effekt mit den Beispielen aus dem Auftrag (Kampfgeist inkl. Gleichstand-Reihenfolge, Schildwall/Naturbund nur mit passendem Nachbarn und sofortiger Wegfall bei Eroberung, keine rückwirkende Eroberung, Arkane Kraft nie über 10, Barriere auf alle niedrigsten + Schild blockt genau einmal, Gelände-Effekte, Schwächender Blick mit Pflicht-Zielwahl und Prüfung ungültiger Ziele, nie unter 1), Effekte wirken genau einmal, Stolperstein + Effekte, neues Duell ohne Effekte, gleiche Züge = gleiches Ergebnis, Computer wählt immer gültige Ziele, Admin-Vorschau = Duell-Engine, Kartendaten (alte Karten bekommen eine Klasse, unpassende Effekte werden verworfen), Effektstärke im Balancing, Arenen (Regeln für Rangliste, ungültige Daten, Liga-Arena aus dem Match-Code, Fels nur auf normalen Feldern, Fairness je Arena 38–62 %).

**Browser-Durchlauf (iPhone 390×664, iPhone SE 375×548, iPad 820×1050):** Duell in Arena „Grenzland“ mit Effektkarten – 0 verdeckte oder abgeschnittene Werte, grüne/rote Werte, Schild und Klassensymbole sichtbar, Detailansicht öffnet und schließt. Admin: Klassenfilter, Effekt-Auswahl nur passend zur Klasse, Vorschau, Klassenwechsel entfernt unpassenden Effekt, Speichern; Arena anlegen, Fairness-Hinweise, Rangliste erst nach spiegelgleicher Korrektur, Speichern. Abenteuer, Admin-Dashboard, Liga-Match und Sichtbarkeitsprüfung (4 Bildschirmgrößen) ohne Fehler.

## Version 1.6 – Liga-Grundlagen

Neu: Deckregeln je Modus, Felsfeld, Match-Format (2 Runden + Entscheidungsduell), faire Lauf-Angebote mit Match-Seed, Aufzeichnen/Nachspielen des Laufs, Collection-League-Testmodus. Das Abenteuer ist unverändert.

**Automatische Tests (insgesamt 113, alle bestanden), neu:** Deckregeln (Kopien, Legendär/Mystisch/Episch, Besitz), automatisches Deck, Felsfeld (15 Züge, nie spielbar, kein Unentschieden, Fairness 40–60 % über 3000 Partien), Match-Format (Münzwurf, Tausch, 2:0, Entscheidungsduell und dessen Fairness), Lauf-Angebote (gleicher Seed = gleiche Angebote, 2 Deck + 1 neutral, ohne Zurücklegen, gleiche Entdeckungen und Steine für beide, mittlere Stärke), SHA-256-Fingerabdruck, Nachspielen ergibt exakt dieselben Karten/Strafen (40 Läufe), gefälschte Eingaben werden erkannt.

**Browser-Durchlauf:** Liga-Deck (Grenzen greifen), Match-Code und Fingerabdruck, Lauf ohne Vorspulen (ca. 32 s), Runden mit Fels, Ergebnis „Lauf-Prüfung: ✓ nachgespielt und bestätigt“. Abenteuer und Admin-Dashboard unverändert ohne Fehler.

**Supabase:** Tabellen `cards`, `game_settings`, `profiles`, `admins`, Bild-Speicher `card-images` mit Zeilen-Sicherheit. 101 Karten übernommen. Geprüft: Besucher lesen Karten, sehen keine Admins/Profile; ein angemeldeter Nicht-Admin ändert 0 Zeilen und kann keine Karte anlegen.

## Version 1.5 – Balancing, Lauf-Verwaltung, neuer Lauf

Neue Lauf-Regeln (vom Auftraggeber gewünscht): Tor 1–7 nur Deckkarten, Tor 8 (Finale) drei neue Karten; Lauf ca. 30 s statt 40 s; 15 Steinreihen statt 7 (eine Reihe kann zwei Spuren sperren, eine Spur bleibt immer frei). Alle anderen Regeln unverändert; neue Einstellungen starten mit den bisherigen Werten.

**Automatische Tests (insgesamt 89, alle bestanden), neu/angepasst:**
- Tor 1–7: drei verschiedene Deckkarten; Finaltor: drei verschiedene Karten, die der Spieler noch nicht besitzt
- Mehr Hindernisse, immer eine Spur frei; Ausweichen ⇒ keine Schwächung; Treffer ⇒ höchstens −1 pro Karte; immer genau 8 Karten; Dauer 25–35 s
- Häufigkeiten: Standard = bisherige Werte; ungültige Einstellungen ⇒ Standard; „nur Legendär“ ⇒ nur legendäre Karten im Finaltor; höheres Gewicht ⇒ häufiger; Speichern/Laden; Spieler können Einstellungen nicht ändern
- „Nicht im Lauf“: erscheint nie als neue Karte, eigene Deckkarten bleiben nutzbar
- „Nur Belohnung“: nie in Booster-Packs, aber im Finaltor gewinnbar; wird nicht verschenkt
- Stärke-Übersicht: die 100 vorhandenen Karten sind unauffällig; ±3 Punkte vom Schnitt ⇒ Warnung; Vergleich nur mit aktiven Karten

**Browser-Durchlauf mit nachgebauter Plattform:** Balancing-Reiter (Sortierung, Auffällige, Karte pausieren ⇒ verschwindet für Spieler), Lauf-Reiter (Gewicht ändern, speichern), Editor-Schalter mit Warnung „kann niemand bekommen“, neuer Lauf (Tor 1 „aus deinem Deck“, Finaltor mit neuen Karten, Gesamtdauer ca. 31 s). Keine Fehler.

## Version 1.4 – Admin-Dashboard

Sicherung vor dem Umbau: Stand v1.3 = Commit `2ab6b82` (auf GitHub) und Version 4 der Spielseite.

**Automatische Tests (insgesamt 74, alle bestanden), neu:**
- Datenprüfung: Werte werden auf 1–10 begrenzt; Karten ohne Namen, mit falscher Seltenheit, fehlenden Werten oder unsicherer ID/Bild-ID werden verworfen
- Automatische IDs k001, k002 … ohne Kollision; Duplizieren (neue ID, „(Kopie)“, Entwurf); Stärke-Hinweis je Seltenheit
- Übernahme aller 100 vorhandenen Karten ohne Verlust (Namen und Werte identisch)
- Nur aktive Karten kommen ins Spiel (Tore, Packs, Gegner); Entwürfe/deaktivierte nicht; neue aktive Karten erscheinen
- Unter 30 aktiven Karten nutzt das Spiel die eingebauten Karten; der Gegner findet immer 8 Karten
- Deck-Reparatur, wenn Deckkarten deaktiviert werden; freigeschaltete Datenbank-Karten bleiben im Spielstand erhalten
- Datenbank (nachgebaut mit derselben Regel wie der Server): Admin speichert/lädt/ändert/löscht; **Nicht-Admins werden abgelehnt**; kaputte Dokumente werden übersprungen
- Bildzuschnitt auf 3:4 (Quer-, Hochformat, kleine Bilder)

**Browser-Durchlauf mit nachgebauter Plattform (Chromium):**
- Admin auf iPhone-Größe: 100 Karten übernehmen, Suche, Filter, neue Karte mit Bild-Upload, Werten, Beschreibung, Status Aktiv speichern, duplizieren, Duplikat löschen (gemeinsames Bild bleibt erhalten), neue Karte erscheint in der Sammlung des Spiels
- Admin am PC (1280 px): zweispaltiger Editor mit Live-Vorschau
- Normaler Spieler: kein Admin-Knopf, sieht die neue Karte im Spiel, direkter Schreibversuch über die Plattform wird abgelehnt, kein Zugriff auf den Bild-Speicher
- Kompletter Spiel-Durchlauf (Lauf, Münzwurf, Duell, Belohnung, Neuladen) unverändert ohne Fehler

**Nicht lokal testbar:** die echte claude.ai-Datenbank und der echte Bild-Speicher. Nach dem Veröffentlichen wurden die Kartendaten direkt in der echten Datenbank geprüft (siehe Abschluss-Nachricht).

## Version 1.3 (Feedback-Runde 3)

Änderungen: rechteckige Karten (3:4) mit Bildbereich, Seltenheit als Rahmenfarbe mit Leuchten/Glanz/Regenbogen, Münzwurf mit Wahl, Animationen beim Einsammeln, Legen, Kämpfen, Ergebnis und im Shop.

**Automatische Tests (insgesamt 51, alle bestanden)**
- Münzwurf: beide Seiten etwa gleich oft (2000 Würfe)
- Gewinnt der Computer den Münzwurf, lässt er dich beginnen (Simulation von 4000 Duellen: wer als Zweites legt, gewinnt etwa 4× so oft)
- Jeder Zug speichert alle Vergleiche (übernommen und gehalten) für die Kampfanimation

**Browser-Durchläufe (Chromium):** iPhone 390×844 und 375×667. Lauf mit Einsammel-Animation, Münzwurf (Werfen, Ergebnis, Wahl), Duell mit Vergleichs-Blasen und Übernahmen, Sieg mit Konfetti und neuer Karte, Niederlage, Shop (Pack-Öffnung, Skin-Kauf mit Stempel), Sammlung. Zusätzlich ein komplettes Duell mit „Animationen reduzieren“. Keine JavaScript-Fehler. Dabei gefundene und behobene Darstellungsfehler: Wert-Plaketten lagen über dem Ergebnis-Banner, Lichtstrahlen ragten aus dem Pack-Fenster, „NEU“ verdeckte den oberen Wert, der Siegbildschirm war oben abgeschnitten.

**Nicht getestet:** echte Geräte (Safari auf iPhone/iPad). Der drehende Regenbogenrahmen mystischer Karten braucht Safari 16.4 oder neuer; auf älteren Geräten bleibt er stehen.

## Version 1.2 (Feedback-Runde 2)

Änderungen: 100 Karten in 6 Seltenheiten (gewöhnlich, ungewöhnlich, selten, episch, legendär, mystisch) mit fester Stärke-Skala; Vorschau des nächsten Tors im Lauf; Gegner neu abgestimmt.

**Automatische Tests (insgesamt 48, alle bestanden)**
- 100 Karten mit eindeutigen IDs und Namen; jede Karte liegt im Stärkebereich ihrer Seltenheit; Anzahl je Seltenheit 30/24/20/14/8/4; jede höhere Seltenheit ist im Schnitt stärker
- Mystische Entdeckungen kommen bei etwa 1 % der Tore vor (16 000 simulierte Tore)
- Gegner ist ungefähr so stark wie das Starterdeck und bekommt nie mystische Karten
- Kampftests suchen sich passende Karten selbst und hängen nicht mehr von einzelnen Kartenwerten ab

**Balance-Simulation (2000 Duelle, nicht im Repo):** Zufällige Kartenwahl im Lauf gewinnt ca. 44 % (Version 1.1: 42 %), immer die stärkste Karte wählen gewinnt ca. 75 % (1.1: 84 %). Der Gegner ist damit etwa gleich schwer wie vorher.

**Browser-Durchlauf (Chromium, 390×844 und 375×667):** Vorschau des nächsten Tors gut lesbar, Sammlung zeigt 100 Karten und den Filter „Mystisch“, vollständiger Lauf und Duell ohne JavaScript-Fehler.

## Version 1.1 (Feedback-Runde 1)

Änderungen: Lauf langsamer (ca. 40 s statt 36 s), Stolpersteine schwächen die nächste Karte um 1, Kartenshop mit Booster-Packs und Skins.

**Neue automatische Tests (insgesamt 44, alle bestanden)**
- Geschwächte Karten: alle vier Werte −1, nie unter 1; die Schwächung zählt beim Angreifen und Verteidigen
- Stolperstein schwächt genau die nächste Karte; Ausweichen ergibt keine Schwächung (20 Läufe); immer in Steine laufen ergibt trotzdem 8 Karten mit höchstens −1
- Steine und Tore werden auch nach einem langen Ruckler in der richtigen Reihenfolge ausgewertet (dieser Fehler wurde durch den Test gefunden und behoben)
- Booster-Packs: 3 verschiedene Karten, Helden-Pack garantiert episch oder legendär (300 Packs), Münzabzug, Freischaltung, Erstattung für Doppelte, kein Kauf ohne genug Münzen, ganze Sammlung erreichbar
- Skins: Kauf, kein Doppelkauf, Ausrüsten nur wenn gekauft, Speichern/Laden, manipulierte Daten, alte Spielstände ohne Skins laden weiter

**Browser-Durchlauf (Chromium, iPhone-Größe):** Shop → Helden-Pack öffnen → zwei Skins kaufen → normaler Lauf (ca. 41 s inkl. Start) mit absichtlichem Stein-Treffer → geschwächte Karte (−1) im Duell sichtbar. Münzstand nach jedem Schritt korrekt, keine JavaScript-Fehler.

## MVP 1.0

### Automatische Tests (`npm test`, Vitest) – 28 Tests, alle bestanden

**Kampf (`tests/battle.test.ts`)**
- Vergleich in alle 4 Richtungen (oben/rechts/unten/links), jeweils für **alle 40×40 Kartenpaare**: Übernahme genau dann, wenn der eigene Wert strikt größer ist
- Gleichstand übernimmt nicht
- Keine diagonale Übernahme
- Keine Kettenreaktion
- Übernommene Karten wechseln nur den Besitzer, nicht den Platz
- Eigene Karten werden nie übernommen; belegte Felder sind nicht spielbar
- 50 vollständige Spiele mit je genau 16 Zügen (Computer gegen Computer): Brett voll, Hände leer, Punktsumme 16, Ergebnis korrekt
- 8:8 ergibt Unentschieden
- Der Computer wählt eine Übernahme, wenn eine möglich ist
- Die Computerhand hat 8 verschiedene Karten

**Runner (`tests/runner.test.ts`)**
- 8 Tore mit je 2 verschiedenen Deck-Karten und 1 Entdeckung außerhalb des Decks (30 Zufallsläufe)
- Genau 8 Auswahlen pro Lauf, egal wie gelenkt wird und bei normaler oder schneller Geschwindigkeit (30 Läufe); danach keine weiteren Auswahlen
- Die Karte der aktuellen Spur wird genommen
- Ein großer Zeitsprung und „Überspringen“ (auch doppelt) liefern genau 8 Karten
- Laufdauer bei normaler Geschwindigkeit: 30–45 Sekunden (seit 1.1: berechnet ca. 39,5 s plus 1 s Start)
- 40 Karten mit eindeutigen IDs und Namen, Werte 1–10

**Speichern & Belohnung (`tests/storage.test.ts`)**
- Neuer Spieler: 22 Karten freigeschaltet, gültiges 20er-Starterdeck
- Speichern und Laden von Sammlung, Deck und Münzen
- Beschädigte oder manipulierte Daten führen zu einem gültigen Spielstand
- Blockierter Speicher (z. B. privater Modus) bringt das Spiel nicht zum Absturz
- Deck-Prüfung: genau 20 verschiedene, freigeschaltete Karten
- Sieg schaltet höchstens eine (die seltenste) neue Entdeckung frei; eine bereits vorhandene Entdeckung gibt stattdessen Münzen; Unentschieden und Niederlage geben weniger Münzen und keine Karte

## Browser-Durchlauf (automatisiert mit Playwright/Chromium, nicht im Repo)
In iPhone-Größe (390×844 und 375×667) und iPad-Größe (820×1180) mit Touch-Emulation:
Hauptmenü → Sammlung → Deck → Lauf (Spurwechsel, schneller Modus, Überspringen) → vollständiges Duell mit 16 Zügen → Ergebnisbildschirm → Neuladen der Seite (Münzen und Statistik bleiben erhalten) → Aufgeben im Duell. Keine JavaScript-Fehler.

## Noch nicht getestet / offen
- **Nicht auf echtem iPhone/iPad in Safari getestet.** Die Tests liefen in Chromium mit simulierter Bildschirmgröße. Bitte auf deinen Geräten prüfen.
- Wischgesten wurden nur über die Buttons ◀ ▶ automatisiert getestet, Wischen per Finger noch nicht auf einem echten Gerät.
- Kein Ton, keine Musik.
- Balance (Kartenwerte, Stärke des Computers) ist ein erster Entwurf.
- Kein Konto und keine geräteübergreifende Sicherung (bewusst nicht im MVP).
