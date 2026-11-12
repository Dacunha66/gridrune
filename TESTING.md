# Testprotokoll

## Puzzle-Events: Stufen (10.11.)

- Ein Event kann mehrere Stufen haben; jede Stufe ist eine eigene Karte (Edition) mit eigenem Puzzle. Fragmente gehen
  immer in die aktuelle Stufe, Überzählige direkt in die nächste. Jede geschaffte Stufe gibt ihre Edition sofort (Server,
  ein Schritt mit dem Spielstand). Kommende Stufen sind als verschwommene Vorschau zu sehen.
- „Mondfinsternis“ (pz01) jetzt: Runenwolf (selten, 9) → Vampirgraf „Blutmond“ (episch, 9) → Nachtwolf Vyrax
  „Schattenmond“ (legendär, 12) → Mondweberin Lyra „Totale Finsternis“ (mystisch, 16) = 46 Fragmente. Bilder der neuen
  Editionen vorerst das normale Kartenbild (eigene Illustration im Admin hochladbar). Bisheriger Fortschritt bleibt
  (Teile 0–8 = Stufe 1).
- Aufgaben jetzt 10 (3 täglich, 3 wöchentlich, 4 einmalig, davon 4 „Schwer“: 25 Siege/Woche, 5 Kantersiege,
  3 Ranglisten-Matches, plus 10 Kampagnen-Missionen). Höchstens ca. 80 Fragmente in 14 Tagen möglich.
- Admin: Abschnitt „Weitere Stufen“ (Karte, Editionsname, Rahmen, Fragmente, Bild), Testmodus „Stufe vollständig“ /
  „Alles vollständig“.
- Getestet: 3 neue automatische Tests (347); gebaute Server-Regeln mit dem echten Event-Dokument (46 Teile, Stufen
  richtig); events-Funktion veröffentlicht und startet; Ansicht im Browser (Testseite: Stufenleiste, Vorschau,
  Freischaltung Stufe 1, weiter mit Stufe 2). Nicht getestet: mit echtem Konto, echtes Gerät.

## Puzzle-Events, Version 1 (10.11.)

- Neu: Startseite → Event-Karte → Events (Aktuell/Archiv) → Puzzle-Detail (3×3, Aufgaben, Restzeit, Belohnung) →
  Freischaltanimation („Karte freigeschaltet!“: Karte ansehen / Zur Sammlung / Zurück zum Event). Edition in der Sammlung
  wählbar (Original/Edition), sichtbar auf eigenen Karten (Sammlung, Deck, eigene Duellkarten), nie auf Gegnerkarten.
- Erstes Event „Mondfinsternis“ (pz01, Runde r1, 10.11.–24.11.): Edition ed01 „Runenwolf – Mondfinsternis“ (Bild vom
  Admin, Rahmen Mondsilber), 9 Fragmente; Aufgaben: täglich 2 Siege (1), wöchentlich 10 Siege (2), einmalig Sieg mit
  12+ Feldern (1).
- Datenbank (Migration 020): puzzle_progress, puzzle_counters, puzzle_claims (Spieler lesen nur eigene Zeilen, schreiben
  nur der Server); quest_add zählt zusätzlich für laufende Events; puzzle_claim vergibt in einem Schritt.
- Live-Datenbanktest (Test-Event pz99, danach gelöscht, echter Spielstand nicht berührt): Zähler addieren, ungültige
  Werte ignoriert; dieselbe Aufgabe zweimal → „already“; schon vorhandenes Teil → „conflict“ und nichts geändert;
  Fertigstellung ohne Spielstand → abgelehnt; Spielstand mit falscher Version → „conflict“, alles zurückgerollt.
- 8 neue automatische Tests (344 insgesamt); gebaute Server-Regeln direkt aufgerufen (Entwurf unsichtbar, Vergabe,
  Edition im Spielstand); alle Server-Funktionen starten (events neu; save-sync, game, quests, adventure, raid neu).
- Browser (Testseite mit Beispieldaten, nicht im Repo): Startseiten-Karte, Detail, Archiv-Liste, Animation,
  Edition wählen, Admin (Liste, Editor, Vorschau 0/teilweise/voll, Testmodus mit Fragmenten/Animation, Speichern).
  Normales Duell als Gast weiter ohne Fehler.
- Nicht getestet: echter Fragment-Erhalt mit Konto im Browser, echtes Gerät. Bild-Upload im Event-Editor nur im echten
  Admin (in der Testseite nicht verfügbar).

## Runensteine (10.11.)

- Neue Währung „Runensteine“ (nur mit Konto, Anzeige oben neben den Münzen). Verdienen: Belohnungsart „Runensteine“
  bei Erfolgen, Kampagne und Raid (Admin wählbar). Standard: Wochenquests „3 Online-Siege“ 30 und „Ranglisten-Sieg“ 20,
  Erfolge Sieger 50, Sammler 100 Karten 50, Eroberer 1000 50, Effektfeuerwerk 300 40, Stammgast 100 50 (statt Münzen).
- Shop: Bereich „Angebote“ (Gratis-Münzen 100 alle 12 Std., auch für Gäste; Karten des Tages: 4 persönliche Karten,
  die man noch nicht hat, Preis nach Seltenheit 10/20/40/100/250/600) und „Münzen“ (50 → 800, 120 → 2.000, 300 → 5.500).
  Alles im Admin unter Shop → Runensteine änderbar.
- Euro-Pakete vorbereitet, aber ausgeschaltet (kein Zahlungsanbieter verbunden; nur Admins sehen eine Vorschau).
- Sicherheit: Runensteine und Shop-Zeiten ändert nur der Server (save-sync übernimmt sie nie vom Gerät; beim ersten
  Speichern eines Kontos immer 0).
- Getestet: 8 neue automatische Tests (336 insgesamt); gebaute Server-Regeln direkt aufgerufen (Gratis-Münzen, Sperre
  12 Std., Münzen tauschen, Karte kaufen, Steine bleiben erhalten); alle Server-Funktionen starten. Browser als Gast:
  Shop-Bereiche, Gratis-Münzen abholen. Nicht getestet: Kauf mit echtem Konto im Browser, echtes Gerät.
- Duelle gegen Spieler (pvp) laufen weiter mit der vorigen Engine (schreiben den Spielstand nicht über die Engine).

## Booster verdeckt aufdecken (09.11.)

- Nach dem Öffnen liegen die 3 Karten verdeckt (Rückseite in den Farben des ausgerüsteten Kartenrückens); seltene,
  epische, legendäre und mystische Karten leuchten verdeckt in ihrer Farbe. Tippen dreht die Karte um (bei Episch+
  Strahlen und Funken), „NEU!“/„Doppelt“ erscheint danach. „Alle aufdecken“ dreht den Rest um; „Noch eins“ und
  „Super!“ erst, wenn alle Karten offen sind. Kauf und Inhalt unverändert (Server bestimmt die Karten wie bisher).
- Browser (Gast mit Test-Münzen, iPhone-Größe): Pack öffnen, einzeln aufdecken, „Noch eins“ (wieder verdeckt),
  „Alle aufdecken“ – keine Fehlermeldungen. Nicht auf einem echten Gerät getestet.

## Design-Abgleich (09.11.)

- Spielen-Menü: Einfaches Spiel (gegen die KI: Leicht/Normal/Schwer · gegen Spieler: Einladungscode oder Zufall),
  Kampagne, Rangliste, Draft, Raid. „Zufall“ sucht sofort einen Gegner. Gegen Spieler nur mit Konto (Gäste sehen den
  Hinweis mit Anmelde-Link). Zurück oben links wie überall, „Start“ in der Leiste bleibt markiert.
- Namen überall: Einfaches Spiel, Rangliste, Draft, Raid (statt Abenteuer, Liga, Collection League, Draft-Liga,
  Weltboss-Raid, Online-Duell). Spruch: „Sammle. Lege. Erobere das Raster.“ Prüfnummer der Rangliste ausgeblendet.
- Einheitlich: Kopfzeile (Logo, Münzen, Konto) auf allen fünf Bereichen der Leiste – auch Shop und Erfolge, ohne
  „Zurück“; eine Schrift auf allen Knöpfen; gesperrte Knöpfe grau statt blassem Gold; runde Kästchen; ein Stil für
  Umschalter und Filter; Start-Knöpfe mit demselben Symbol.
- Mehr: Bilanz als beschriftete Leiste, Schalter statt Häkchen. Ranglisten-Deck: größere, lesbare Kartenbilder.
- Duell: die gewählte Handkarte verdeckt den Hinweis nicht mehr; auf dem iPad größere Handkarten.
- Browser (Gast, iPhone- und iPad-Größe): alle Bereiche, Spielen-Menü, Duell, Rangliste (ganzes Match), Draft – keine
  Fehlermeldungen; 328 Tests ok. Konto-Ansichten (Gegen Spieler, Raid) nur im Code geprüft, nicht im Browser.
  Nicht auf einem echten Gerät getestet.

## Fehlersuche (09.11.)

Geprüft: Server-Protokolle der letzten 24 Stunden (keine Fehler außer den eigenen Start-Prüfungen), Regeln/KI/Prüfung,
Speichern im Konto, nachgereichte Ergebnisse, alle Spielmodi im Browser.

Gefunden und behoben (nur Spiel-Code, keine Regel- oder Kartenänderung, Server unverändert):
- **Speichern im Konto:** Zwei Änderungen kurz hintereinander bei langsamer Verbindung (Server antwortet nach mehr als
  1,2 s) – die zweite wurde mit der alten Versionsnummer geschickt, der Server meldete einen Konflikt, die Änderung ging
  verloren und es erschien fälschlich „Spielstand von einem anderen Gerät wurde geladen“. Jetzt wartet jede Speicherung
  auf die Antwort der vorigen. Nachgestellt mit einem simulierten langsamen Server: vorher Konflikt + Verlust, jetzt
  kommen beide Änderungen an (Test nicht im Repo, braucht zusätzliche Test-Bibliotheken).
- **Nachgereichte Ergebnisse (offline beendete Spiele):** Endete ein Spiel offline, während gerade ältere Ergebnisse
  nachgeschickt wurden, konnte es aus der Warteschlange fallen. Außerdem blieb die Warteschlange bis zum Neuladen
  stehen, wenn beim Erstellen der Meldung ein Fehler auftrat. Beides behoben. Nicht mit echtem Konto getestet.

Ohne Befund geprüft:
- 150 Zufallsduelle (alle Arenen, Runen, Deckgrößen 8–40, Fels, alle KI-Stufen): kein Absturz, Kartenzahl stimmt immer,
  jedes Duell wird von der Server-Prüfung angenommen.
- KI nutzt keine verdeckten Infos: in denselben Duellen bei jedem Computerzug Hand/Stapel des Spielers und die
  Reihenfolge des eigenen Stapels ausgetauscht – die Entscheidung blieb immer gleich.
- Wochen-/Tageszählung der Erfolge (2024–2030) gegen eine zweite Berechnung.
- Browser als Gast (iPhone-Größe): Einfaches Spiel Leicht/Normal/Schwer, Rangliste (ganzes Match), Kampagne „Erstes
  Duell“, Draft-Übung, Karten, Shop, Erfolge, Mehr – keine Fehlermeldungen.
- Nicht auf einem echten Gerät getestet.

## Menüleiste unter Shop/Erfolge, eigener Avatar-Bildschirm (08.11.)

- Die Leiste unten (Start, Karten, Shop, Erfolge, Mehr) bleibt unter Shop und Erfolge sichtbar; der aktive Bereich ist
  hervorgehoben, der gewählte Menü-Bereich bleibt beim Zurückwechseln erhalten.
- Avatar-Auswahl als eigener Bildschirm „Dein Avatar“ (Mehr → Avatar wählen, Mein Konto → Avatar ändern); nicht mehr
  unter Erfolge.
- Browser (echte App als Gast, iPhone-Größe): Leiste auf Menü, Shop, Erfolge; Wechsel Shop → Erfolge → Karten → Mehr.

## Avatare im Admin, eigene Bilder (08.11.)

- Admin → Avatare: Übersicht aller Avatare; Editor mit Bild-Upload (rund ausgeschnitten, Ausschnitt mit dem Finger),
  Name, Symbol, Hintergrundfarben, Rahmen, freischaltender Erfolg, An/Aus; „+ Neuer Avatar“. Gespeichert in
  content_docs avatars/<id> (Migration 019 erlaubt die Sammlung); Spiel und Server-Funktionen lesen sie.
- Ausgeschaltete Avatare werden nicht angeboten; wer einen trägt, zeigt den Start-Avatar.
- Automatisch: Admin-Änderungen ersetzen eingebaute, neue kommen dazu, ausgeschaltete sind gesperrt, ungültige Daten
  werden bereinigt. Browser (Testseite mit Test-Datenbank): Liste, Bearbeiten, Speichern.

## Avatare (08.11.)

- 32 runde Avatare (Figur auf Farbe, Rahmen Einfach/Silber/Gold/Runenglanz): 6 zum Start, 26 über Erfolge. Ein Avatar
  gilt als frei, sobald sein Erfolg abgeholt ist (auch rückwirkend). Die Wahl speichert der Server bei den Titeln
  (Funktion quests, "equip-avatar"; gesperrte werden abgelehnt).
- Anzeige: Hauptmenü (statt Konto-Symbol), Mein Konto („Avatar ändern“ → Erfolge), Erfolge (Auswahl mit Hinweis, wie
  man gesperrte freischaltet), Online-/Draft-Duell (beide Spieler, Migration 018: avatar_a/avatar_b), Raid-Bestenliste.
- Automatisch (tests/avatars.test.ts): Freischalten, Auswahl nur freigeschalteter, Avatar übersteht Laden und Abholen.
- Browser: Avatar-Raster (Testseite, iPhone-Größe).

## Mehr Erfolge (08.11.)

- 59 Erfolge in 19 Reihen (vorher 18 in 7), 9 Tages- und 7 Wochenquests. Neue Zähler aus geprüften Duellen: Kantersiege
  (≥ 12 Felder), Runen-Einsätze, Geländeboni, Siege in Kristall-Arenen. Neue Titel: Stammgast, Stratege, Feldherr,
  Runenmeister, Geländekenner, Kristallherz, Sternenjäger, Raid-Veteran, Ranglistenheld.
- Bestehende Erfolge behalten ihre Kennung (bereits abgeholte bleiben abgeholt).
- Automatisch: neue Zähler, Reihen aufsteigend, Titel-Länge, Runen-Zählung in der Duell-Statistik.

## Rangliste schwerer: Spiegel-Deck + KI „Schwer“ (09.11.)

- Der Computer spiegelt das Liga-Deck (gleiche Seltenheiten, andere Karten) und spielt auf „Schwer“; Spiel und Server
  bauen das Deck gleich auf (siehe BALANCING.md v1.41).
- Automatisch: tests/deck.test.ts (Spiegel-Deck: Seltenheiten, keine gemeinsamen Karten, Doppelte, fest aus dem Seed),
  tests/verify.test.ts (ganzes Match mit KI „Schwer“ wird vom Server-Code bestätigt).
- Nicht auf einem echten Gerät getestet.

## Balance nach der Deck-Regel (08.11.)

- Simulation alt/neu (siehe BALANCING.md v1.40). Computer-Deck in Einfachem Spiel (Normal, Schwer) und Rangliste: nur
  gewöhnliche Karten. KI „Schwer“: Endspiel-Suche mit Obergrenze (längster Zug 33 ms statt 11 s).
- Automatisch (tests/deck.test.ts): Computer-Deck je Stufe, schwere KI über ein ganzes Duell ohne langen Zug.

## Deck statt Lauf: 5 Handkarten, Rest wird gezogen, Rune der Hand (07.11.)

- Feste Regel (kein Admin-Schalter mehr): Jede Seite spielt mit ihrem Deck; es wird gemischt, 5 Karten auf der Hand, vor
  jedem eigenen Zug wird nachgezogen. Der Lauf entfällt in allen Modi (Code bleibt für ein späteres Minispiel).
- Einfaches Spiel, Rangliste, Kampagne, Raid, Online: das 20er-Deck (Rangliste: Liga-Deck; Kampagnen-Missionen mit
  Klassen-Vorgabe: nur die erlaubten Karten des Decks, mit Leihkarten aufgefüllt; Draft: das 20er-Draft-Deck).
  Computer: 20er-Deck (gleiche Seltenheits-Mischung); Kampagnen-Gegner und Raid-Bosse behalten ihre Karten als Deck.
- Rangliste: ein Sieg schenkt eine zufällige Karte, die noch fehlt (Seltenheits-Chancen aus dem Admin, nur Karten mit
  „Kann als Ranglisten-Belohnung erscheinen“), aus dem Match-Seed – sonst 50 Münzen.
- Rune der Hand (rn06, von Anfang an): alle Handkarten ins Deck mischen und genauso viele neu ziehen, Zug bleibt.
  Der Computer nutzt sie nur mit eigenem Wissen (Hand klar schwächer als seine Restkarten).
- Kampagnen-Ziel „Lauf ohne Stolpern“ zählt jetzt wie „Gewinnen“ (Warnung im Editor).
- Automatisch (tests/deck.test.ts + angepasste Tests, 315 grün): Austeilen aus dem Seed, Decks 8–40, Auffüllen auf 5
  (Quadrat/Kristall, mit/ohne Fels), KI-Sicht, Online-Sicht (Decks + Mischzahl verdeckt), Rune der Hand (Mischen,
  leeres Deck, KI-Entscheidung, Server-Prüfung), Rangliste/Kampagne/Raid/Online/Draft mit Decks.
- Browser (iPhone-Größe): Duell mit Rune der Hand, Einfaches Spiel startet direkt (5 + 15), Kampagnen-Briefing „Dein Deck“.

## Nachziehen: 5 Karten auf der Hand (07.11.)

- Admin → Runen → Freigabe: Schalter „Nachziehen“ (Standard: Aus). An: Die 8 Karten jeder Seite werden zu Beginn gemischt,
  5 sind auf der Hand, 3 liegen verdeckt; vor jedem eigenen Zug wird eine gezogen, bis der Stapel leer ist. Gilt in allen
  Modi. Geprüfte Spiele mischen aus dem Seed (Abenteuer, Rangliste, Kampagne, Raid, Online), Spiel und Server gleich.
- Der Computer kennt weder die Karten des Spielers noch die Reihenfolge seines eigenen Stapels. Online sind beide Stapel
  verdeckt (nur die Anzahl).
- Automatisch (tests/drawhand.test.ts): Aus = wie bisher; 5+3 mit denselben Karten; gleicher Seed = gleiches Austeilen;
  Auffüllen bis 5 auf Quadrat und Kristall (mit/ohne Fels); KI-Sicht; Online-Sicht; Abenteuer gleich ausgeteilt. Zusätzlich
  lief die ganze Testsammlung einmal mit eingeschalteter Regel (nur Tests mit fester Kartenreihenfolge weichen ab).
- Browser (Testseite, iPhone und SE): Stapel mit Anzahl links neben der Hand, Zieh-Animation, Hand 5 → 4 → 5.

## Neue Fähigkeiten Dominanz und Standhaft (03.11.)

Dominanz: Greift die Karte an, gewinnt sie auch bei Gleichstand (nicht gegen Standhaft). Standhaft: Bei Gleichstand nie übernommen, auch nicht durch Dominanz. Beide klassenübergreifend (jede Klasse darf sie haben), eigene Symbole (Krone, Turm). Gelten beim Legen, in der Kettenübernahme (die eroberte Karte greift mit ihrer eigenen Fähigkeit an) und beim Angriff mit der Rune des Nachhalls; KI und Server-Prüfung nutzen dieselbe Vergleichsregel. Alle vier Server-Funktionen auf Engine 2669e0a / engine-3ddf400c8f23, laufen (Startprüfung).

Geprüft: 271 automatische Tests (neu: normaler Gleichstand, Dominanz bei Gleichstand / gegen höheren Wert, Standhaft gegen Dominanz und gegen höheren Wert, Dominanz schützt nicht, Kette mit Dominanz und gegen Standhaft, KI nutzt Dominanz). Noch keine Karte hat die Fähigkeiten – im Admin unter Karten zuweisen. Nicht geprüft: Darstellung der neuen Symbole auf dem Gerät.

## Weltboss-Raid – Pakete 4–7: Oberfläche, Admin, Testmodus, erster Boss (03.11.)

Spieler: „👹 Weltboss-Raid“ im Spiel-Menü (mit Konto): Übersicht (Bossbild, LP-Balken mit Phasenmarken, Phase, Restzeit, Teilnehmer, Angriffe heute, eigener Schaden und Platz), 8 Karten aus der Sammlung wählen, Kampf (normales Duell gegen Boss-Deck/KI/Rune der Phase), Ergebnis nur mit Server-Werten, Rangliste (50 pro Seite, eigene Platzierung), Belohnungen. Begonnene Kämpfe werden auf dem Gerät mitgeschrieben: Neuladen setzt den Kampf an derselben Stelle fort (kein kostenloser Neustart); nach der Frist zählt er als Niederlage.
Admin → „Raids“: Liste mit Status (Entwurf, Nicht gestartet, Geplant, Aktiv, Pausiert, Besiegt, Abgelaufen, Beendet, Archiviert), LP, Teilnehmern, Kämpfen; Editor (Name, Boss, Bild 1024×1024, Klasse, LP, Start/Ende, Angriffe/Tag, Frist, Schadenswerte, bis 5 Phasen mit Arena/Bossdeck/KI/Rune/Lieblingsklassen/Mechanik-Text, persönliche und Gemeinschafts-Belohnungen inkl. Booster-Art, Teilnahmebedingung), Starten / Änderungen übernehmen (Version, bereits verursachter Schaden bleibt) / Pausieren / Fortsetzen / Beenden / Archivieren. Testmodus (nur auf dem Gerät, nichts gespeichert): Testkampf je Phase mit Schadensberechnung wie auf dem Server, Phasenrechner, Schadensrechner, Belohnungsprüfung, simulierte Teilnehmer (1/10/50/100).
Erster Raid „Erwachen des Waldwächters“ (raid01) als Entwurf angelegt: 20.000 LP, 4.–11.11., 5 Angriffe/Tag, Phasen Erwachen (Leicht, Waldlichtung) → Verderbnis unter 70 % (Normal, Schattenhain) → Letzter Widerstand unter 30 % (Schwer, Herz des Waldes, Rune Nachhall); Meilensteine 1.000/3.000/6.000/10.000, Gemeinschaft 25/50/75/100 %.

Geprüft: 265 automatische Tests. Browser (lokal, Handy-Größe, mit Testkonten, danach gelöscht): Spieler-Übersicht, Kartenwahl, kompletter Kampf, Neuladen mitten im Kampf → „Kampf fortsetzen“ mit denselben 6 Karten auf dem Feld, Ergebnis vom Server, Meilenstein-Münzen gutgeschrieben, Rangliste. Admin (Testkonto vorübergehend Admin, danach entfernt): Vorlage anlegen, speichern, Simulation 10 Spieler, Phasenrechner, Testkampf Phase 1 (Ergebnis ohne Speichern), veröffentlichen, starten → „Aktiv“, Live-LP. Gefunden und behoben: neuer Raid ließ sich nicht speichern; Hinweistext überlappte. Die Simulation zeigte zu starke Bossdecks in Phase 2/3 → Vorlage entschärft (simulierte Spieler mit Zufallskarten verlieren Phase 2/3 trotzdem meist – vor dem Start mit eigenem Testkampf prüfen). Nicht geprüft: echtes iPhone/iPad, Live-Seite, Bild-Upload für den Boss.

## Weltboss-Raid – Pakete 1–3: Regeln, Datenbank, Server (03.11.)

Raid-Regeln in `src/game/raid.ts` (Konfiguration als Admin-Dokument „raids“, Phasen nach LP, Momentaufnahme beim Start, Prüfung am Ende wie in der Kampagne, Schaden nur auf dem Server, Belohnungen, Simulation). Datenbank-Änderung 016: `raid_state`, `raid_attempts` (ein Platz je Angriff und UTC-Tag → Limit auch bei parallelen Anfragen), `raid_player_stats`, `raid_reward_claims`, atomare Funktionen `raid_reserve` / `raid_finish` / `raid_claim`; Spieler lesen nur, schreiben kann nur die Funktion `raid`. Server-Funktion `raid` (Engine dd8785b / engine-868c51bd4c1b).

Geprüft: 265 automatische Tests (12 neue: Konfiguration, Phasengrenzen, Schaden mit Höchstwert, Zeitraum/UTC-Tag, ehrliche und manipulierte Kämpfe, Momentaufnahme bei Phasenwechsel, Belohnungen einmalig/nur mit Teilnahme, Hand/Rune auf dem Server, Simulation ohne Speichern). Live mit zwei Testkonten und einem versteckten Test-Raid (danach alles gelöscht): gültiger Start (1), fremde Karte (2), gesperrte Rune (3), Tageslimit (4), zwei gleichzeitige Starts → ein Kampf (5), Abschluss (6), doppelter Abschluss bucht nichts (7), mitgeschickter Schaden/manipuliertes Protokoll zählt nicht (8), LP genau 0 (9), gleichzeitiger letzter Treffer: zusammen genau die restlichen LP (10), Phasenwechsel während des Kampfes (11), Raid läuft während des Kampfes ab (12), offener Kampf fortsetzbar / nach Ablauf Niederlage (13), Belohnungen nur einmal (14), Nicht-Admin darf nichts ändern (15), Rangliste mit eigener Platzierung. Noch offen: Oberfläche (Paket 4), Admin + Testmodus (5/6), Testboss (7).

## Kartenwahl am Tor per Antippen (03.11.)

Der Lauf hält kurz vor jedem Tor an: die drei Karten erscheinen groß nebeneinander (mit Effekt), der Spieler tippt eine an. 5 Sekunden Zeit, am Finaltor 10 Sekunden (voller Effekttext). Ohne Wahl gilt die Karte auf der eigenen Spur (hervorgehoben). Gilt für alle Läufe (einfaches Spiel, Kampagne, Rangliste, Draft). Die Wahl wird intern als normale Spurwechsel kurz vor dem Tor gespeichert – die Server-Prüfung bleibt unverändert, keine neue Server-Version nötig.

Geprüft: 253 automatische Tests (neu: 30 Strecken, an jedem Tor eine zufällige Karte angetippt, auch direkt nach einem Wischen → genau diese Karte genommen, Lauf exakt nachspielbar). Browser lokal (Gast, Handy-Größe): 8 Tore, Wahl landet im richtigen Slot, Zeitablauf nach 5 s nimmt die Karte der Spur, Finaltor mit 10 s, danach startet das Duell; keine Fehler. Nicht geprüft: auf echtem iPhone/iPad und mit Konto auf der Live-Seite.

## Belohnungen neu: Schwierigkeit im einfachen Spiel, Karten nur in der Rangliste (02.11.)

Einfaches Spiel: vor dem Start Leicht / Normal / Schwer wählen. Nur noch Münzen (Sieg 30/50/100, Unentschieden 10/20/40, Niederlage 5/10/15), keine Karte mehr. Die Stufe steht im Ticket; der Server spielt den Computer mit genau dieser Stufe nach. Rangliste (Collection League): mit Konto gibt der Server das Match aus (Seed, Computer-Rune) und prüft Lauf und alle Runden; ein gewonnenes Match schaltet die seltenste neue Entdeckung frei (im Lauf als „NEU“ markiert), sonst 50 Münzen. Gäste spielen ohne Belohnung. Hauptmenü: „Spielen“ mit Untermenü. Datenbank-Änderung 015 (Ticket-Art „league“) eingespielt, `adventure` und `game` auf Engine 46b9d84 / engine-50e69ea97fe0.

Geprüft: 252 automatische Tests (Münzen je Stufe; Duelle gegen Leicht/Schwer werden nachgespielt, ein Leicht-Protokoll gilt nicht als Schwer; ehrliche Ranglisten-Matches bestätigt, fehlende/zusätzliche Runden, falscher Start, falscher Zug und anderes Deck abgelehnt). Live mit Testkonto (danach gelöscht): unbekannte Stufe abgelehnt, Spiel auf Schwer → richtige Münzen, keine Karte; ungültiges Liga-Deck und unvollständiges Match abgelehnt; verlorene Matches ohne Belohnung; gewonnenes Match → neue Karte (Schattenluchs), zweites Einreichen zahlt nicht doppelt. Browser (lokal, Gast): Stufenwahl im Spiel-Menü startet den Lauf, Ranglisten-Einführung zeigt Belohnung bzw. Gast-Hinweis. Nicht geprüft: ein Ranglisten-Match in der Oberfläche mit Konto auf der Live-Seite.

## Online-Draft live, Feuer-Klasse (02.11.)

Datenbank-Änderung 014 eingespielt, Funktion `pvp` neu veröffentlicht (Version 3, Engine a3c4abd / engine-76028489b7dc). Karten c02, c07, r07, r17, e01, e13, l05, m04 haben in der Datenbank die Klasse Feuer. Alte Testkonten gelöscht.

Live geprüft mit zwei neuen Testkonten (danach gelöscht): Draft-Einladung per Code, Beitritt → Vorbereitung, Pool 30 Karten, Deck mit fremder Karte abgelehnt, Deck des Gegners bleibt verborgen, ungültiger Lauf abgelehnt, nach beiden Läufen startet das Duell mit 8 Karten, Gegnerhand verborgen, komplettes Duell bis zum Ende, Sieger +150 Münzen, Draft-Statistik getrennt vom Duell. Aufgeben in der Vorbereitung: Gegner gewinnt, keine Münzen. Normales Online-Duell weiter in Ordnung (Start, eigener Code abgelehnt, Aufgeben). Nicht geprüft: Draft in der Oberfläche auf zwei echten Geräten.

`adventure` und `game` bleiben auf engine-231ee351ee2b (die neue Engine unterscheidet sich nur durch „Name auf der Karte“).

Runen in der Datenbank umgestellt: Glut → m015 „Schmiede am Berg“, Fluch → m020 „Herz des Vulkans“ (Rune des Waldes m005, Nachhall m010, Verdrehung ab Start).

## Umzug zu Cloudflare (31.10.)

Die Seite läuft jetzt unter https://gridrune.d-reich91.workers.dev (Cloudflare Workers mit statischen Dateien, `wrangler.jsonc`, baut den Zweig claude/project-card-rush-dev-84c1jl). Netlify hatte keine Credits mehr und bleibt auf dem alten Stand – nicht mehr benutzen. Server-Funktionen `adventure` und `game` laufen wieder auf der aktuellen Engine (0397641, engine-231ee351ee2b). Vom Spielleiter bestätigt: Seite lädt, Glutgebirge und Draft-Liga sind da.

Supabase Site URL/Redirect auf die neue Adresse umgestellt (erledigt).

## Zweite Kampagne „Glutgebirge“, neue Runen-Verteilung, Rune des Waldes

Neu: Welt 2 „Glutgebirge“ (m011–m020, Gegner o011–o020, Arenen Aschetal a16 und Herz des Vulkans a17), frei nach dem Wald. Runen nur noch bei Level 5 und 10: Wald 5 Rune des Waldes (neu, rn05: +1 auf bis zu 2 Naturkarten), Wald 10 Nachhall, Feuer 5 Glut, Feuer 10 Fluch; Verdrehung haben alle ab Start. Bereits freigespielte Runen werden neu verteilt (Wunsch). Server-Funktionen adventure und game auf die neue Engine gebracht.

Geprüft: 247 automatische Tests (10 Level ohne Fehler, Freischaltung nach dem Wald, Runen-Verteilung). Wichtig: Die Runen-Einträge in der Datenbank (aus der Kartenverwaltung) überschreiben die eingebaute Verteilung – sie müssen im Admin unter „Runen“ angepasst werden. Draft-Liga online wartet noch auf die Datenbank-Änderung 014.

## Web-Version – Online-Duelle gegen echte Spieler

Neu (nur mit Konto): Menüpunkt „⚔️ Online-Duell“. 8 Karten aus dem Deck wählen, dann Freund herausfordern (6-stelliger Code, teilbar), Code eingeben oder Zufallsgegner suchen. Der Server (Funktion `pvp`) prüft jeden Zug; jeder Spieler sieht nur die eigene Hand. 30 s pro Zug (sonst zufällige Karte), 20 s ohne Verbindung = Sieg für den anderen, Aufgeben = Niederlage. Sieg: 🪙 100 (höchstens 3 bezahlte Siege pro Tag gegen denselben Gegner; bei Abbruch/Aufgabe erst ab 4 Zügen). Online-Bilanz im Online-Bereich. Liga-Arena mit Felsfeld, Runen nach Liga-Regeln.

Geprüft live mit zwei Test-Konten: Einladung, eigener Code abgelehnt, fremde Karte abgelehnt, ganzes Duell bis zum Ende (Züge kommen live beim Gegner an, falscher Spieler abgelehnt, Gegnerhand verdeckt, Gegner kann die Partie-Tabelle nicht lesen), Münzen und Statistik, Sieg bei Abwesenheit nach 20 s, Aufgeben, Zufallsgegner. Oberfläche im Browser (iPhone-Größe) mit zwei Fenstern: Lobby, Code, Duell, Ergebnis. Korrigiert: eigener Code brach die eigene Einladung ab; langer Gegnername verdeckte den ✕-Knopf. Noch nicht getestet: zwei echte Geräte (iPhone/iPad), Zeitablauf im Browser.

## Web-Version Phase 4b–4d – Kampagne, Shop und Spielstand über den Server

Neu für angemeldete Spieler (Gäste unverändert):
- **Kampagne:** Vor jeder Mission holt das Spiel ein Ticket vom Server (Funktion `game`, kurz Internet nötig). Münzwurf und Gegnerzüge folgen aus dem Ticket; nach dem Duell spielt der Server es nach, speichert die Sterne und zahlt Belohnungen aus (Münzen, Karten, Booster – je Belohnung genau einmal: erster Sieg, jeder Stern, jeder Welt-Meilenstein). Illustrationen, Rahmen, Titel bleiben Vorschau. Ohne Verbindung nach dem Duell: Ergebnis wartet auf dem Gerät und wird innerhalb von 24 h gutgeschrieben.
- **Nachzahlung:** Beim Anmelden werden Belohnungen für schon verdiente Sterne einmalig gutgeschrieben (Hinweis im Menü).
- **Shop:** Booster und Skins werden auf dem Server gekauft, die Karten zieht der Server.
- **Spielstand gesperrt:** `save-sync` übernimmt nur noch Deck, Liga-Deck, Einstellungen, ausgerüstete Skins und Rune. Münzen, Karten, Statistik und Kampagne ändern nur die geprüften Funktionen (`adventure`, `game`).

Geprüft: 236 automatische Tests (u. a. ehrlich gespielte Duell- und Lauf-Missionen werden bestätigt, manipulierte abgelehnt; Belohnungen nur einmal; Shop-Preise; gesperrtes Speichern), Build ok, beide Server-Funktionen gestartet und antworten. Noch nicht getestet: echtes Spielen auf gridrune.netlify.app mit Konto.

## Schnellere Bilder

Neu: Karten haben zusätzlich ein kleines Vorschaubild (360 × 480 JPEG, `thumbId`) für Hand, Spielfeld, Sammlung, Deck und Lauf; die große Kartenansicht lädt weiter das Originalbild. Neue Uploads im Karteneditor erzeugen beide automatisch. Für die vorhandenen 35 Kartenbilder erstellt: 12,5 MB → 1,9 MB. Seitenhintergründe und Spielfeld als WebP (z. B. „Hintergrund Sterne“ 5,95 MB → 0,63 MB), Runenbilder 768 px WebP (je 1,4–2,4 MB → 0,13–0,24 MB); Originale bleiben im Speicher. Programmdateien werden ein Jahr im Browser zwischengespeichert.

## Web-Version Phase 3 – Spielstand im Konto

Neu: Angemeldete Spieler spielen mit dem Spielstand ihres Kontos (Münzen, Karten, Deck, Skins, Runen, Statistik, Kampagne). Beim ersten Anmelden: „Spielstand übernehmen“ (einmalig aus dem Browser) oder „Neu beginnen“. Jede Änderung wird sofort auf dem Gerät gesichert und kurz danach über die Server-Funktion `save-sync` gespeichert; ohne Verbindung wird automatisch erneut versucht. Menü-Hinweis: „☁️ Dein Spielstand ist in deinem Konto gespeichert“. Zwei Geräte: Der neuere Stand vom Server gewinnt (Hinweis im Menü). Gäste: unverändert im Browser; der Gast-Spielstand bleibt auch nach dem Übernehmen erhalten.

Sicherheit: Tabelle `player_saves` (Migration 010) – jeder liest nur den eigenen Stand, schreiben kann nur die Server-Funktion. Sie bereinigt alle Werte und lehnt unplausible Sprünge ab (Karten/Skins/Sterne/Statistik werden nie weniger; höchstens 12 neue Karten und 2500 Münzen pro Speichern plus 300 pro Minute seit dem letzten Speichern). Exakte Nachprüfung jedes Duells folgt in Phase 4.

**Automatische Tests (225, alle bestanden), neu:** normales Weiterspielen angenommen (Sieg, Booster, Deck, Sterne); Münzsprung, verschwundene Karten, >12 neue Karten, gesunkene Sterne/Statistik abgelehnt; Offline-Zeit erlaubt mehr Münzen; fremde/kaputte Werte bereinigt.

**Server:** ohne Anmeldung → „not_signed_in“; Tabelle ohne Anmeldung leer; direktes Schreiben → von der Datenbank abgelehnt (Zeilenrechte). **Browser:** Gast-Modus unverändert (Spielstand bleibt nach Neuladen, Duell startet). Anmeldung mit Übernahme: vom Admin mit seinem Konto zu testen.

## Web-Version – Anmeldung mit Spielername

Neu: Anmelden mit **Spielername oder E-Mail** + Passwort. Spielernamen sind eindeutig (Groß-/Kleinschreibung zählt als gleich; Migration 009: eindeutiger Index, Prüffunktion `name_available`, Schutz beim Registrieren). Beim Registrieren wird vorher geprüft, ob der Name frei ist. Die E-Mail hinter einem Namen sucht nur die Server-Funktion `sign-in` heraus; sie gibt nur die Sitzung zurück, nie die E-Mail. Unbekannter Name und falsches Passwort ergeben dieselbe Antwort. Namensänderung auf einen vergebenen Namen wird abgelehnt.

**Getestet:** Server-Funktion: unbekannter Name → „invalid_credentials“, echter Name + falsches Passwort → gleiche Antwort; `name_available('DACUNHA66')` → false, `('Neuling')` → true. Browser (lokale Kopie gegen die echte Datenbank): Feld „Spielername oder E-Mail“; Name + falsches Passwort → „Name/E-Mail oder Passwort stimmt nicht.“; Registrierung mit „dacunha66“ → „Dieser Spielername ist schon vergeben.“ Erfolgreiche Anmeldung mit Namen: vom Admin mit seinem echten Konto zu testen.

## Web-Version Phase 2 – Anmeldung (nur gridrune.netlify.app)

Neu: Willkommen-Bildschirm mit „Anmelden“, „Konto erstellen“ (Spielername, E-Mail, Passwort ≥ 8 Zeichen) und „Als Gast spielen“ (Fortschritt nur im Browser; Wahl wird gemerkt). „Passwort vergessen“ mit Link per E-Mail und Bildschirm „Neues Passwort“. Menü-Chip mit Spielername bzw. „Gast · Anmelden / Konto erstellen“; „Mein Konto“: Name ändern, Passwort-Link, Abmelden. Beim Registrieren legt die Datenbank automatisch das Spielerprofil an (Migration 008; ungültige Namen werden „Spieler“; Profile nur für einen selbst lesbar). E-Mail-Links funktionieren auch auf einem anderen Gerät (Implicit-Flow). Die claude.ai-Version hat weiterhin keine Konten. Spielstand im Konto folgt in Phase 3.

**Browser (iPhone-Größe, lokale Kopie der Web-Version gegen die echte Datenbank):** Willkommen-Bildschirm statt Menü; leere Anmeldung → „Bitte eine gültige E-Mail-Adresse eingeben.“; falsches Passwort → „E-Mail oder Passwort stimmt nicht.“ (Antwort der echten Datenbank); ungültiger Name → Regel-Hinweis; „Als Gast spielen“ → Menü mit Gast-Chip, bleibt nach Neuladen; Chip → zurück zur Anmeldung. Keine Fehler. Echte Registrierung mit Bestätigungs-E-Mail: noch nicht getestet (erstes Konto legt der Admin selbst an).

## Version 1.25 – Deck und Shop überarbeitet, Booster-Bilder im Admin

Neu:
- **Deck bearbeiten:** Oben die Leiste „Dein Deck“ mit allen gewählten Karten (antippen = herausnehmen), freie Plätze gestrichelt, Zähler, Ø Stärke, Verteilung nach Klasse und Seltenheit, Schnellauswahl (Starterdeck, Stärkste 20, Leeren). Darunter Filter nach Klasse und Sortierung (Seltenheit, Stärke, Name). Karten im Deck mit goldenem Rand und „✓ Im Deck“. Regeln unverändert (20 verschiedene Karten).
- **Shop:** Booster als große Packungen nebeneinander (gezeichnete Folien-Packung oder hochgeladenes Bild, Glanz-Effekt), Kartenzahl, Text, Preis bzw. „Noch 🪙 X“, „Episch+ garantiert“, Chancen pro Karte zum Aufklappen, Tauschwerte für doppelte Karten in Seltenheitsfarben. Beim Öffnen erscheint das Booster-Bild. Preise, Chancen und Inhalt unverändert.
- **Admin-Reiter „Shop“:** pro Booster Bild hochladen (empfohlen 768 × 1024 px, 3:4, Ausschnitt per Finger), Name und Beschreibung (leer = Standard), Vorschau, Speichern (`settings/shop`). Preis, Kartenzahl und Chancen sind dort bewusst nicht änderbar.

**Automatische Tests:** 221, alle bestanden.

**Browser (iPhone, iPhone SE):** Deck: Leiste, Zähler, Klassen-Verteilung, Filter, Sortierung, „Im Deck“-Markierung ohne Überlagerungen. Shop: beide Booster, Chancen aufklappbar, Kauf 520 → 380 Münzen, Schüttel- und Öffnen-Animation, 3 Karten. Admin: Bild für den Helden-Booster hochgeladen, Name „Drachenhort-Pack“ gespeichert → Shop zeigt Bild und Namen, auch nach Neuladen. Keine Fehler.

## Web-Version Phase 1 – gridrune.netlify.app mit Supabase

Neu:
- Die Web-Version (Netlify) liest Karten, Designs, Runen, Arenen, Kampagnen-Inhalte und Einstellungen aus Supabase (Tabelle `content_docs`, gleiche Daten-Form wie im claude.ai-Spiel). Bilder kommen aus dem Supabase-Bildspeicher `game-images`. Die claude.ai-Version ist unverändert (enthält keinen Supabase-Code).
- Datenbank-Regeln: Alle lesen veröffentlichte Inhalte, Entwürfe nur Admins; schreiben, Bilder hochladen/löschen nur Admins (Tabelle `admins`, geprüft in der Datenbank).
- Übernahme aus dem claude.ai-Spiel: 101 Karten, 3 Designs, Design-Einstellung, 2 bearbeitete Runen; 39 Bilder (36 MB) über eine einmalige, per Geheimschlüssel geschützte Import-Funktion hochgeladen und danach abgeschaltet. Stichprobe: Bild identisch (SHA-256).
- Fehlt ein Kartenbild, zeigt die Karte ihr Emoji; fehlende Designbilder werden ausgeblendet.
- Migrationen 004–007 eingespielt (Admin-Prüfung intern, Runenfeld/Schlachtfeld, Runen-Tabellen, Inhalte/Bildspeicher). Supabase-Sicherheitsprüfung: keine Warnungen.

**Automatische Tests:** 221, alle bestanden.

**Browser (iPhone-Größe, live auf gridrune.netlify.app gegen die echte Datenbank):** Sammlung zeigt 101 Karten (24 freigeschaltet) mit den echten Namen; alle 16 sichtbaren Kartenbilder geladen; Seitenhintergrund (Design „Hintergrund Sterne“) geladen; keine Fehler, keine fehlgeschlagenen Anfragen. Ohne Datenbank-Verbindung spielt die Seite mit den eingebauten Karten weiter (Menü, Kampagne, Duell getestet).

## Version 1.24 – Runen werden in der Kampagne freigespielt

Neu (nach deiner Entscheidung):
- **Grundrunen nicht mehr von Anfang an:** Der erste Sieg schaltet frei – Mission 2 „Waldpfad“ → Verdrehung, Mission 4 „Waldhüter“ → Glut, Mission 8 „Alte Ruinen“ (Elite) → Fluch, Mission 10 „Herz des Waldes“ (Boss) → Nachhall. Im Admin (Reiter „Runen“ → Freischaltung) jederzeit änderbar.
- Ohne freigespielte Rune spielt man ohne Rune: Deck-Reiter „Rune“ zeigt alle Runen gesperrt mit „🔒 Kampagne: Mission … gewinnen“, Menü „Deck bearbeiten – ohne Rune“. Im Abenteuer bekommt der Computer nur dann eine Zufallsrune, wenn du selbst eine hast.
- **Kampagne:** Das Briefing zeigt „Erster Sieg schaltet frei: [Rune]“ (bzw. „Freigespielt“), das Ergebnis „Neue Rune freigespielt!“ mit Runen-Button und Beschreibung (auch bei Freischaltung über Sterne). Gegner der Kampagne (Elite/Boss) bringen ihre Rune auch gegen Spieler ohne Rune mit.
- **Liga:** nur Grundrunen, die du freigespielt hast; ohne Rune spielst du ohne. Der Gegner bekommt weiter eine Grundrune pro Match.
- Regeln und Hinweistexte angepasst.

**Automatische Tests (221, alle bestanden), neu:** Freischalt-Missionen der Grundrunen; ohne Freischaltung keine Rune in Abenteuer/Kampagne/Liga; Liga nur freigespielte Grundrunen (keine Kampagnen-Runen); Computer bekommt weiter alle Grundrunen; Rune nach erstem Sieg der Mission freigeschaltet, andere nicht.

**Browser (iPhone, neuer Spieler):** Menü „ohne Rune“, Rune-Reiter mit 4 gesperrten Runen und Hinweis, Abenteuer ohne Runenleiste; Briefing „Waldpfad“ zeigt „Erster Sieg schaltet frei: Rune der Verdrehung“; Mission gewonnen (9:7) → „Neue Rune freigespielt! Rune der Verdrehung“; danach Menü mit Runen-Button, Verdrehung automatisch gewählt, 3 Runen noch gesperrt. Keine Fehler.

## Version 1.23 – Runen ab „selten“, Rune im Deck-Editor

Neu (nach deinem Wunsch):
- **Seltenheit der Runen:** nur noch Selten, Episch, Legendär und Mystisch. Die vier Grundrunen sind „selten“. Gespeicherte Runen mit niedrigerer Seltenheit werden automatisch „selten“. Der Runen-Button hat die Farbe der Seltenheit wie bei den Karten: selten türkis, episch lila, legendär gold, mystisch Regenbogen. Im Duell zeigt ein zusätzlicher äußerer Ring Blau (du) bzw. Rot (Gegner).
- **Rune in „Deck bearbeiten“:** neuer Reiter „Rune“ neben „Karten“. Der eigene Menü-Knopf „Runen“ ist entfallen; der Knopf „Deck bearbeiten“ zeigt die gewählte Rune. Wer Runen besitzt, spielt immer mit einer (Standard: die erste eigene, bis man eine andere wählt; ein zweites Antippen wählt sie nicht ab). Wer keine besitzt, sieht „Du besitzt noch keine Rune – du spielst ohne Rune“ und spielt ohne. Die Wahl wird sofort gespeichert. Hinweise in Kampagne, Liga und Regeln verweisen auf „Deck bearbeiten“ → „Rune“.

**Automatische Tests (220, alle bestanden), neu:** Grundrunen selten; niedrigere gespeicherte Seltenheit wird selten; mystisch bleibt.

**Browser (iPhone):** Spieler: kein eigener Runen-Knopf mehr, „Deck bearbeiten“ mit Runen-Button; Reiter „Karten 20/20“ / „Rune“; ohne eigene Wahl ist Verdrehung gewählt; Fluch gewählt, zweites Antippen lässt sie gewählt; im Duell „Deine Rune: Rune des Fluchs“. Admin: Seltenheit bietet nur Selten/Episch/Legendär/Mystisch; Vorschau-Ring türkis/lila/gold/Regenbogen. Keine Fehler.

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

## Neue Effekte Flammenherz, Frostpanzer, Schattenmantel, Wurzelkraft; Kettenübernahme Variante A (v1.31)

- Automatisch (tests/effects.test.ts): Flammenherz +1 nur beim Angreifen, Frostpanzer +1 nur beim Verteidigen, beide
  heben sich auf, nie über 10; Schattenmantel verflucht die erobernde Karte (auch in der Kette), Barriere blockt;
  Wurzelkraft wächst nach eigenen Zügen, nicht im Zug des Legens, höchstens zweimal, nicht für einen Eroberer;
  Kette: Standard eine Stufe, kein Gleichstand (auch nicht mit Dominanz); Admin-Vorschau stimmt mit dem Duell überein.
- Simulation: siehe BALANCING.md (Effektstärken, Verteilung auf 250 Karten).
- Nicht im Browser geprüft: Anzeige der neuen Effekt-Popups im Duell.

## Kettenübernahme mit −1, Wurzelkraft ab sofort (v1.32)

- Automatisch (tests/effects.test.ts): in der Kette greift die eroberte Karte mit −1 an (Gleichstand nach Abzug
  erobert nicht), jeder Kettenvergleich steht in lastChainClashes; Wurzelkraft +1 beim Legen (wirkt schon im Vergleich)
  und nach dem nächsten eigenen Zug noch einmal, höchstens zweimal.
- Duell-Anzeige: Kettenvergleiche erscheinen Welle für Welle als gestrichelte Blasen „6 −1 > 4“ mit pulsierendem roten
  „−1“, dazu das Banner „KETTENÜBERNAHME ×n · Kette −1“.

## Erfolge: Tages-/Wochenquests, Erfolge, Titel (v1.33)

- Automatisch (tests/quests.test.ts, 15 Tests): Tag/Woche in deutscher Zeit (Winter/Sommer, ISO-Woche, Montag),
  gleiche Tagesauswahl für alle, Zähler pro Tag/Woche/gesamt, Bonus, Stand-Erfolge (Karten, verschiedene Effekte),
  Abholen nur einmal, Titel, Kartenrücken doppelt = Münzen, Booster gleich bei gleichem Seed, unsichere Daten.
  campaignServer.test.ts: eine geprüfte Mission zählt eine Mission und ein Duell.
- Live (Supabase, Testkonto): quest_add zählt (ungültige Werte ignoriert, neuer Tag beginnt bei 0), Tafel stimmt,
  „Alle abholen“ zahlt 640 Münzen + Titel „Effektmeister“ genau einmal (8 Abhol-Einträge, Spielstand-Version 2),
  zweites und paralleles Abholen zahlt nichts, Titel tragen nur wenn besessen.
- Browser (iPhone-Größe, angemeldet): Menü-Knopf „Erfolge“ mit Zähler, Reiter Täglich/Wöchentlich/Erfolge,
  Abholen mit Einblendung, Titelwahl, Erfolgs-Gruppen mit Stufen.
- Nicht live getestet: Zählung aus echten gespielten Spielen (Abenteuer, Kampagne, Rangliste, Raid, Online).

## PWA (v1.34)

- public/manifest.webmanifest (Name, Symbole 192/512 + „maskable“, Vollbild, Hochformat), public/sw.js (Seite: immer neu
  wenn online, sonst gespeichert; Programmdateien/Bilder aus dem Speicher; Server-Aufrufe nie aus dem Speicher).
- Browser (Chromium, Vorschau): Service Worker aktiv, Manifest erreichbar, nach dem ersten Besuch startet das Spiel
  auch ohne Internet (Willkommensseite, „Als Gast spielen“). Ohne Internet fehlen nur die Google-Schriften (Ersatzschrift).
- Nicht geprüft: Installation auf echtem iPhone/Android.

## Design: Karten „Klar“, Fächer-Hand, Startseite (v1.35)

- Kartendesign „Klar“ für alle (Admin kann Hybrid Premium / Steampunk zum Vergleich auf dem Gerät wählen): Bild füllt
  die Karte, Rand abgedunkelt in Klassenfarbe; Werte kompakt im Kreis oben links (Klassenzeichen in der Mitte), Effekt
  oben rechts, Name nur außerhalb des Spielfelds.
- Duell: Hand als Fächer, alle 8 Karten sichtbar (Werte-Kreis jeder Karte bleibt frei), angetippte Karte hebt sich.
- Startseite: Kopf (Logo, Münzen, Konto), großer Spielen-Knopf, „Dein nächster Schritt“ (erstes Spiel, Kampagne,
  Belohnungen, Tagesquest, Konto), Leiste Start/Karten/Shop/Erfolge/Mehr.
- Browser (iPhone 390×844 und SE 375×667, Gast): Startseite, Reiter Karten/Mehr, Sammlung, Duell mit Fächer-Hand,
  Karte wählen und legen – keine Fehler. Nicht geprüft: angemeldet mit Tagesquest-Zeile, echte Geräte.

## Spielfeld-Form „Kristall“ (v1.36)

- Neue Form: 4 Spalten × 5 Reihen ohne die 4 Ecken (16 Felder, mit Fels 15 Züge). Die Form folgt aus der Zellenzahl der
  Arena (16 = Quadrat, 20 = Kristall). Neue Arena a18 „Die Kristall-Arena“ (aktiv, nicht Rangliste); Admin → Arenen:
  Form wählbar.
- Automatisch (tests/kristall.test.ts): Ecken nicht spielbar, Nachbarn über die Ecken hinweg korrekt, Fels nie auf einer
  Ecke, ganzes KI-Duell läuft bis Zug 15, Arena-Daten (16/20 Zellen, Spiegelgleichheit).
- Browser (Testseite, iPhone und SE): Kristall-Feld mit Diamant-Optik, Fächer-Hand, Karten legen.

## Browser-Durchlauf (automatisiert mit Playwright/Chromium, nicht im Repo)
In iPhone-Größe (390×844 und 375×667) und iPad-Größe (820×1180) mit Touch-Emulation:
Hauptmenü → Sammlung → Deck → Lauf (Spurwechsel, schneller Modus, Überspringen) → vollständiges Duell mit 16 Zügen → Ergebnisbildschirm → Neuladen der Seite (Münzen und Statistik bleiben erhalten) → Aufgeben im Duell. Keine JavaScript-Fehler.

## Noch nicht getestet / offen
- **Nicht auf echtem iPhone/iPad in Safari getestet.** Die Tests liefen in Chromium mit simulierter Bildschirmgröße. Bitte auf deinen Geräten prüfen.
- Wischgesten wurden nur über die Buttons ◀ ▶ automatisiert getestet, Wischen per Finger noch nicht auf einem echten Gerät.
- Kein Ton, keine Musik.
- Balance (Kartenwerte, Stärke des Computers) ist ein erster Entwurf.
- Kein Konto und keine geräteübergreifende Sicherung (bewusst nicht im MVP).

## Leuchten für legendäre und mystische Karten (nur Optik)

- Legendär: goldener, langsam atmender Rand und ab und zu ein Lichtschimmer über das Bild.
- Mystisch: Regenbogenring wandert um den Rand, kräftigerer Glanz.
- Spielfeld/Hand im Duell: ruhiges Leuchten ohne Bewegung, AUSSEN um die Karte (der blaue/rote Besitzer-Rahmen verdeckte es vorher – behoben).
- „Animationen reduzieren" (oder System-Einstellung): festes Leuchten, keine Bewegung.
- Karten mit Editionsrahmen: nur der Editions-Glanz, kein zusätzliches Leuchten.
- Geprüft im Browser in iPhone-Größe (Sammlung, Duell, reduzierte Animation, Editionen); auf einem echten Gerät noch nicht geprüft.

## Handkarten Kristall-Feld + Streifen unten am iPhone

- Kristall-Feld (5 Reihen): Handkarten größer (iPhone 430 pt breit: 69 → 81 → jetzt 89 pt), das Feld dafür etwas kleiner (394 → 373 pt). Kleines iPhone (667 pt hoch): Hand 74 pt, Feld 230 pt. Im Browser in iPhone-Größe geprüft.
- Startbildschirm-App am iPhone: Manche iOS-Versionen machen die Seite um die Statusleiste zu kurz → dunkler leerer Streifen unten. Die Seite wird jetzt dann auf volle Bildschirmhöhe gestreckt (nur in der App vom Home-Bildschirm, nur wenn genau die Statusleiste fehlt). Im Browser nicht nachstellbar; vom Spieler auf dem echten iPhone bestätigt: Streifen ist weg.

## KI-Deck im Einfachen Spiel (v1.42)

- Schwer: Gegner-Deck spiegelt die Seltenheiten des eigenen Decks; Normal: eine Seltenheit niedriger; Leicht unverändert.
- Simulation siehe BALANCING.md (z. B. Deck des Admins auf Schwer: 98 % → 34 % Siege bei mittlerer KI als Spieler).
- Automatische Tests: gleiche Seltenheiten, keine eigene/doppelte Karte, Normal schwächer als Schwer, alte Tickets unverändert.
- Server-Funktion adventure auf neue Engine; Rangliste unverändert (eigene Regel bleibt).
- Münzen: Normal 65/25/12, Schwer 150/60/25 (Sieg/Unentschieden/Niederlage); Anzeige im Menü, Ergebnis und Regeln liest dieselbe Tabelle.
- Vom Spieler bestätigt (echtes Gerät): stärkeres KI-Deck und neue Münzbeträge funktionieren.

## Runenschmiede (v1.43)

- Doppelte Karten (Booster, Kampagne, Erfolge, Raid-Belohnungen) kommen in den Schmelztiegel statt in Münzen.
- Runenschmiede als eigener Punkt unter „Karten“ (zwischen Sammlung und Deck; zeigt „n doppelte Karten bereit“): Schmelzen (einzeln oder alle) → Essenz der Seltenheit; Veredeln 4 → 1;
  Wunschkarte (fehlende Boosterkarten, Preise 3/3/3/4/4/5); verpasste Editionen (nur beendete Events, 2 Sternenessenz);
  Puzzle-Fragmente (laufende Events, 2 Kristallessenz, höchstens 2 pro Stufe, mit Konto); Kartenrahmen (Runen, Glut, Sterne).
- Server: game (forge-melt/-refine/-craft/-edition/-frame), events (forge-fragment über puzzle_claim), save-sync übernimmt nur den gewählten Rahmen.
- Admin → Shop: Abschnitt „Runenschmiede“ mit allen Preisen.
- Automatische Tests: tests/forge.test.ts (10). Browser (iPhone-Größe, als Gast): Schmelzen 7 Duplikate → +7 Funkenessenz,
  legendäre Wunschkarte geschmiedet (4 Sonnenessenz), Runenrahmen gekauft/angelegt, Glutrahmen auf Handkarten im Duell, nicht auf dem Feld.
- Server: save-sync v5, game v21, quests v12, adventure v22, events v3, raid v16 eingespielt; alle starten (Antwort not_signed_in). Vom Spieler mit echtem Konto bestätigt: funktioniert.

## Fehler: Umdrehen leuchtender Karten + gestaffelte Puzzle-Aufgaben

- Legendäre/mystische Karten auf dem Feld: Legen- und Umdreh-Animation laufen wieder (das stille Leuchten hatte sie mit abgeschaltet).
  Im Browser gemessen: legendär/mystisch mit anim-flip → flip, mit anim-drop → drop, liegend → keine Bewegung; „Animationen reduzieren“ → keine.
- Puzzle-Aufgaben mit Staffel („Weitere Ziele“): nach 10/10 Siegen steht 10/25 da, jedes erreichte Ziel gibt die Fragmente erneut.
  Bereits erhaltene Ziele zahlen nie doppelt (gleicher Schlüssel wie vorher für das erste Ziel). Anzeige „Stufe 2/3“.
- Event „Mondfinsternis“: Täglich 2 → 4 Siege, Wöchentlich 10 → 25 → 50 Siege, Kantersiege 1 → 3 → 5 → 10, Runen 5 → 10.
- Tests: tests/puzzles.test.ts (+2).

## Community: Clans und Chat (v1.44)

- Neuer Bereich „Community“ in der unteren Leiste (nur mit Konto): Chat (Allgemein + eigener Clan), Clans (suchen, gründen 500 Münzen,
  beitreten offen/auf Anfrage/geschlossen, Rollen Anführer/Offizier/Mitglied, max. 30), Rangliste (Clanpunkte der Woche: 10 pro Sieg).
- Chat: Regeln einmal bestätigen; max. 200 Zeichen, keine Links, Wortfilter, eine Nachricht alle 3 Sekunden, 30 Tage gespeichert;
  Melden (Grund wählen), Blockieren (eigene Liste), live über Realtime.
- Admin → Community: Meldungen (löschen, 24 Std./7 Tage/dauerhaft stumm, verwerfen), Stummgeschaltete, Clans (umbenennen, auflösen), Wortliste.
- Datenbank (Migration 021) in zurückgerollter Transaktion geprüft: Gründen zieht 500 Münzen ab, zweiter Clan verweigert, Chat erst nach Regeln,
  3-Sekunden-Sperre, fremder Clan-Chat verweigert, 2 Siege = 20 Clanpunkte, letzter Austritt löst auf.
  Rechte (RLS): fremder Spieler sieht nur den allgemeinen Chat, Mitglied auch den Clan-Chat, Meldungen für Spieler unsichtbar.
- Browser (iPhone-Größe) mit nachgebildetem Server: Regeln, Senden, Melden/Blockieren, Clanliste, Gründen (Münzen 1200 → 700), Clan-Seite mit Anfrage, Rangliste.
- Noch offen: echter Test mit zwei Konten (Live-Chat zwischen zwei Geräten).

## Datenschutz-Seite (Mehr → Datenschutz)

- Beschreibt den tatsächlichen Stand: Gast (nur Browser), Konto (Supabase, EU/Irland), Community (Daten, Sichtbarkeit, Filter, Speicherdauer),
  Hosting (Cloudflare), Google Fonts, Rechte. Verantwortliche Person und E-Mail trägt der Admin unter Admin → Community → Datenschutz-Angaben ein
  (fehlt etwas, steht dort rot „[noch nicht eingetragen]“). Link aus den Chat-Regeln.
- Gäste sehen unter „Community“ einen Hinweis mit Anmelden statt einer leeren Seite.
- Browser (iPhone-Größe): Seite mit 7 Abschnitten, keine Fehler.

## Konto löschen + Schriften ohne Google

- Mehr → Konto → „Konto löschen“: Bestätigung durch Eintippen von LÖSCHEN; Server-Funktion account übergibt erst die Clanführung
  (bzw. löst den Clan auf) und löscht dann das Konto – alle Tabellen zum Spieler werden per ON DELETE CASCADE mitgelöscht (geprüft:
  33 Fremdschlüssel auf auth.users, alle CASCADE). Admin-Konten werden nicht gelöscht. Danach Abmeldung, Kopie des Konto-Spielstands
  auf dem Gerät gelöscht. Funktion startet (not_signed_in); echtes Löschen mit einem Testkonto steht noch aus.
- Schriften (Grenze Gotisch, Cinzel, Alegreya Sans, Inter; SIL OFL) werden jetzt mit dem Spiel ausgeliefert (@fontsource, nur lateinische
  Zeichen inkl. Umlaute). Browser-Test: keine Anfrage an fremde Server mehr, Schriften geladen.
- Datenschutzseite: Absatz zu Google Fonts entfernt, Konto-Löschung im Spiel beschrieben.

## Raid: Belohnung sichtbar machen

- Befund (Datenbank): Raid „Erwachen des Waldwächters“ am 10.11. 22:48 besiegt; Admin-Konto erhielt um 22:51 „Boss besiegt“ (Helden-Pack:
  c103, c161 neu, u11 doppelt) – beide Karten sind im Spielstand. Angezeigt wurde das nur als kleine Textzeile.
- Neu: frisch gutgeschriebene Raid-Belohnungen erscheinen groß (wie in der Kampagne: Münzen, jede neue Karte einzeln), nach einem Kampf
  und beim Öffnen der Raid-Übersicht. Ist der Boss besiegt, zeigt die Übersicht einen Kasten „Gemeinsam geschafft“ mit der Belohnung (✓).
- Hochzählen der Münzen in der Belohnungsanzeige repariert (blieb im Entwicklungsmodus bei +0).
- Browser (iPhone-Größe, nachgebildeter Server): Anzeige +15 Münzen und neue Karten, Kasten erscheint, keine Fehler.

## Postfach (Briefumschlag oben)

- Raid-Belohnungen (Schadensziele, Gemeinschaftsstufen, Boss besiegt) gehen ab jetzt ins Postfach statt direkt in den Spielstand;
  Abholfrist 30 Tage. Abholen einzeln oder „Alle abholen“: Münzen/Runensteine groß, Packs werden wie im Shop verdeckt geöffnet,
  Doppelte → Runenschmiede. Abgeholtes bleibt 30 Tage als „Abgeholt“ sichtbar. Raid zeigt „X Belohnungen liegen im Postfach“ mit Knopf.
- Admin → Postfach: Geschenk an einen Spieler (Name) oder an alle; Münzen, Runensteine, Pack (1–10), Karte; Betreff + Nachricht.
- Datenbank (Migration 022) in zurückgerollter Transaktion: raid_to_inbox vergibt nichts doppelt (auch nicht schon früher ausgezahlte Raid-Belohnungen),
  inbox_send, inbox_claim mit altem Spielstand → conflict, richtig → paid, nochmal → already.
- Tests: tests/inbox.test.ts (3). Browser (iPhone-Größe, nachgebildeter Server): Briefumschlag mit Zahl, Postfach-Liste, Pack öffnen/aufdecken.
- Server: raid v17, inbox v1 (starten, not_signed_in).

## Packs: seltenste Karte zuletzt, höchstens 1 legendär/mystisch

- rollPack: nach einer legendären oder mystischen Karte ziehen die übrigen Plätze ohne diese Seltenheiten; Karten aufsteigend nach Seltenheit
  sortiert (beste zuletzt) – Shop, Kampagnen-/Erfolgs-Packs und Postfach. Postfach-Anzeige ebenfalls sortiert.
- Test: je Pack 3000 Ziehungen – nie zwei Top-Karten, immer sortiert, keine doppelte Karte im Pack.
- Server: Engine neu, Funktionen game, quests, inbox aktualisiert.
