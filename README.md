# GridRune

Ein mobiles Browserspiel für iPhone und iPad (Hochformat): Du **rennst** durch 8 Tore, **sammelst** 8 Karten und trittst dann in einem **4×4-Kartenduell** gegen den Computer an.

> Stand: MVP 1.0, erster spielbarer Prototyp. Alle Namen, Karten und Grafiken sind eigene Platzhalter (Emoji + Farbverlauf).

---

## Für dich (ohne Programmierkenntnisse)

### Spielen
1. Öffne auf dem iPhone/iPad den **Vorschau-Link**, den Claude dir im Chat geschickt hat, in **Safari**.
2. Halte das Gerät **hochkant**.
3. Tippe auf **▶ Spielen**.

Tipp: In Safari über **Teilen → „Zum Home-Bildschirm“** bekommst du ein App-Symbol.

### So funktioniert das Spiel
- **Lauf (ca. 30 s):** Die Figur rennt von allein. **Wische** nach links/rechts oder tippe **◀ ▶**. In jedem der 8 Tore nimmst du die Karte auf deiner Spur. **Tor 1–7** zeigen Karten aus deinem **Deck**, das **Finaltor (Tor 8)** zeigt **3 neue Karten** – gewinnst du das Duell, gehört die gewählte dir. Oben im Himmel siehst du das **nächste Tor** groß mit allen Werten; die Karte deiner Spur ist weiß umrandet.
  - Silberner Rahmen = Karte aus deinem Deck
  - Goldener Rahmen mit **NEU** = Entdeckung aus dem restlichen Kartenpool
  - **Stolpersteine:** Läufst du in einen Stein, ist die **nächste Karte** im Duell um 1 schwächer (alle vier Werte, mindestens 1). Du erkennst sie am roten „−1“.
  - **⏩** = 3× schneller, **⏭ Überspringen** = sofort alle Tore auf der aktuellen Spur nehmen
- **Münzwurf:** Vor jedem Duell wird eine Münze geworfen. Gewinnst du, wählst du, wer beginnt (Tipp: Wer die letzte Karte legt, hat oft einen Vorteil).
- **Duell:** Tippe eine Handkarte an, dann ein freies Feld. Ist dein Wert auf der Seite zur gegnerischen Nachbarkarte **höher**, gehört sie dir. Nach 16 Zügen gewinnt, wer mehr Felder hat.
- **Karten (Steampunk-Design ab v1.10):** Bronze-Rahmen mit Nieten, großes Bild, die vier Werte in Tintenklecksen. Oben links ein Zahnrad mit dem Klassensymbol (⚔️ Krieger, 🔮 Magier, 🌿 Natur, 🔥 Feuer, ❄️ Frost, 🌑 Schatten), oben rechts ein Edelstein für die Seltenheit (silber, grün, türkis, violett, gold, regenbogen), unten rechts das goldene Effekt-Symbol. Auf dem Spielfeld zeigt ein dünner **blauer** (deine Karte) oder **roter** Ring (Gegner) den Besitzer; **grüner Klecks** = verstärkt, **orange Zahl** = geschwächt, 🛡 = Schild. **Feldkarte antippen** = Details, **Handkarte gedrückt halten** = große Ansicht mit Pergament (Name, Effekt) und dem Edelstein unter dem Bild; Hand **seitlich wischen**.
- **Arenen & Gelände:** Felder mit farbigem Rand sind Gelände (🌲 Wald, 🌋 Lava, ❄️ Eis, 🌑 Schatten). Gelände hilft nur Karten mit passendem Effekt.
- **Schwächender Blick:** Liegen mehrere Gegner daneben, leuchten sie rot – tippe die Karte an, die −1 bekommen soll.
- **Belohnung:** Sieg = 🪙 100 und die seltenste neue Entdeckung wird freigeschaltet. Unentschieden = 🪙 40. Niederlage = 🪙 15.
- **Shop:** Mit Münzen kaufst du **Booster-Packs** (Abenteurer-Pack 🪙 150, Helden-Pack 🪙 400 mit garantierter epischer oder legendärer Karte) und **Skins** (Kartenfarbe im Duell, Figur im Lauf). Doppelte Karten aus Packs werden in Münzen umgetauscht.
- **Karten:** 100 Karten in 6 Seltenheiten. Je seltener, desto stärker (Summe der vier Werte): gewöhnlich 13–16, ungewöhnlich 17–19, selten 20–22, episch 23–25, legendär 26–28, **mystisch 29–32** (sehr selten, Regenbogen-Rahmen).
- **Sammlung / Deck bearbeiten:** Das Deck braucht genau 20 verschiedene Karten.

### Wichtig zum Spielstand
Dein Fortschritt wird **nur in diesem Browser auf diesem Gerät** gespeichert (localStorage). Es gibt kein Konto. Das heißt:
- iPhone und iPad haben **getrennte** Spielstände.
- Wenn du in Safari die **Website-Daten löschst** oder im **privaten Modus** spielst, ist der Fortschritt weg.

### Kampagne

Im Hauptmenü unter **🗺️ Kampagne**: Welten mit je 10 Missionen (Tutorial, normal, spezial, Elite, Boss), die nacheinander freigeschaltet werden. Jede Mission hat 3 Sterne-Ziele; der erste Stern ist immer der Sieg, alle weiteren brauchen ebenfalls einen Sieg. Erreichte Sterne gehen nie verloren. Vor dem Duell wählst du 8 Karten aus deinem Deck; bei Missionen mit Klassenregel füllen gewöhnliche Leihkarten fehlende Plätze. Belohnungen sind vorerst nur eine **Vorschau** – sie werden mit den Spielerkonten (Netlify + Supabase-Login) aktiviert. Der Kampagnen-Fortschritt wird bis dahin nur auf diesem Gerät gespeichert.

**Kampagnen-Editor (Admin):** Reiter „Kampagnen-Editor“ in der Kartenverwaltung.
- *Welten:* Name, Beschreibung, Kachel- und Kartenbild, Reihenfolge, Status (Entwurf/veröffentlicht/deaktiviert), Freischaltung (nach Welt X und/oder N Sternen), Sterne-Meilensteine.
- *Missionen:* Typ, Ablauf (Duell oder Lauf + Duell), Gegner, Arena, Kartenregel (nur Klasse X), 3 Sterne-Ziele mit Belohnung, Belohnung für den ersten Sieg, Tipps, Icon, Position auf der Weltkarte (antippen), Duplizieren, Testen.
- *Gegner:* Name, Symbol/Avatar, KI-Stärke, bevorzugte Klassen, Deck aus genau 8 bestehenden Karten, Boss-Texte, Porträt und Hintergrund.
- *Prüfen:* zeigt fehlende Karten, unvollständige Missionen, unerreichbare Ziele und unerfüllbare Bedingungen.
- Missionen werden nie gelöscht, nur deaktiviert – so bleibt der Spieler-Fortschritt immer gültig. Wird ein Ziel geändert, behalten Spieler ihre bereits verdienten Sterne.

Empfohlene Bildgrößen: Weltkarte und Boss-Hintergrund 1290 × 2796 px, Welt-Kachel 1200 × 675 px, Missions-Icon und Gegner-Avatar 512 × 512 px, Boss-Porträt 1024 × 1365 px (JPEG/WebP, am besten unter 2 MB).

### Runen und neue Fähigkeiten (Test)

Freigabe im Admin-Reiter **Runen**: „Aus“, „Nur Admin (Test)“ oder „Alle Spieler“ – getrennt für Runen und für die Fähigkeiten Wirbelwind/Kettenübernahme. Bis zur Freigabe spielen Spieler unverändert.
- **Runen:** Im Hauptmenü unter „Runen“ ausrüsten. Im Duell einmal im eigenen Zug vor dem Legen einsetzen (Runenleiste oben, antippen → Aktivieren → Ziel wählen → ✓). Die Rune bleibt in der Sammlung. Grundrunen: Verdrehung, Nachhall, Glut, Fluch – für alle von Anfang an; weitere Runen über die Kampagne. Nachhall: die gewählte Karte greift erneut an, höchstens 1 Übernahme (bei mehreren wählst du), nie eine Kettenreaktion, erst ab der Spielmitte (8 Karten auf dem Feld). In der Liga: nur Grundrunen, der Gegner bekommt pro Match eine Grundrune.
- **Wirbelwind:** Karte wählen, Feld antippen, mit ↺ ↻ drehen, „Legen“.
- **Kettenübernahme:** eroberte Karten greifen weiter an (Stufen im Admin einstellbar).
- **Spielprotokoll:** 📜 in der Runenleiste.

### Collection League (Testmodus)
Im Hauptmenü **🏆 Collection League**: Liga-Deck bauen (20 Karten, max. 2 gleiche, max. 1 legendäre, 1 mystische, 4 epische), dann ein Match gegen den Computer: Lauf mit je 2 Deckkarten + 1 neutraler Entdeckung pro Tor, danach 2 Runden mit getauschtem Start, bei 1:1 ein Entscheidungsduell. In jedem Duell blockiert ein **Fels** ein Feld (fair, kein Unentschieden). Testmodus: keine Belohnung, keine Wertung. Hintergründe: [BALANCING.md](BALANCING.md).

### Karten verwalten (Admin-Dashboard)
Im Hauptmenü erscheint für dich (Besitzer der Spielseite) der Knopf **🛠️ Kartenverwaltung**. Normale Spieler sehen ihn nicht.

**Neue Karte anlegen**
1. **＋ Neue Karte** tippen. Die Karten-ID (k001, k002 …) wird automatisch vergeben.
2. **Kartenname** eingeben.
3. **📷 Bild hochladen** → Foto aus der Mediathek wählen oder fotografieren. Es wird automatisch auf das Kartenformat 3:4 zugeschnitten.
4. **Seltenheit** wählen und die **vier Werte** (Oben, Rechts, Unten, Links, je 1–10) mit − / + einstellen. Das Feld Σ zeigt, ob die Summe zur Seltenheit passt (nur ein Hinweis).
5. **Klasse** wählen (6 Knöpfe) und optional einen **Spezialeffekt** („Kein Spezialeffekt“ ist möglich). Es stehen nur Effekte der gewählten Klasse zur Wahl; darunter siehst du Regeltext, eine Wertvorschau und wie stark der Effekt fürs Balancing zählt (z. B. Arkane Kraft wie +4).
6. Optional eine **Beschreibung** eingeben.
7. **Status**: *Entwurf* (nur in der Verwaltung sichtbar), *Aktiv* (sofort im Spiel), *Deaktiviert* (nicht mehr im Spiel).
8. **Speichern**. Oben links siehst du die ganze Zeit eine Live-Vorschau.

**Balancing (Reiter „Balancing“)**: Übersicht aller Karten mit Gesamtpunktzahl Σ, sortierbar nach Stärke, Seltenheit oder Abweichung. ⚠️ markiert Karten, die 3+ Punkte stärker/schwächer sind als der Schnitt ihrer Seltenheit. Mit **⏸ Aus dem Spiel nehmen** pausierst du eine Karte, ohne sie zu löschen.

**Lauf (Reiter „Lauf“)**: Wie oft jede Seltenheit im Finaltor erscheint (Gewichte + Prozentanzeige, „Standardwerte“ setzt alles zurück). Pro Karte stellst du im Editor ein, ob sie im Lauf erscheinen darf und ob sie **nur durch Belohnung** (nicht in Booster-Packs) zu bekommen ist.

**Arenen (Reiter „Arenen“)**: Vorlagen mit 16 Feldern. Gelände wählen und Felder antippen. „Rangliste“ geht nur, wenn die Arena fair ist (spiegelgleich, kein Gelände nur einmal, höchstens 8 Geländefelder). Abenteuer-Duelle nutzen eine zufällige aktive Arena, Liga-Runden eine Ranglisten-Arena – für beide Spieler dieselbe. Die 6 Standard-Arenen kannst du ändern oder deaktivieren; „↺ Standard wiederherstellen“ macht das rückgängig.

**Spielfeld-Designer (Reiter „Spielfeld-Designer“)**: eigenes Bild unter dem 4×4-Spielfeld und eigener Seitenhintergrund – ohne Programmieren.
1. **＋ Neues Spielfeldbild hochladen** (bzw. **Neuen Hintergrund**). Über dem Knopf stehen die empfohlenen Bildmaße (Spielfeld 1536 × 2048 px, 3:4; Hintergrund 1290 × 2796 px). Andere Maße gehen auch – das Bild füllt die Fläche immer ohne Verzerrung.
2. In der **Vorschau** (iPhone/iPad, mit Beispielkarten): mit **einem Finger verschieben**, mit **zwei Fingern zoomen**, oder die Regler Zoom/Horizontal/Vertikal nutzen. „✋ Bild verschieben: aus“ schaltet die Gesten ab, damit du normal scrollen kannst.
3. **Spielfeldraster**: Größe, Position, Feldabstand, Rahmen, wie deckend die leeren Felder sind, Feldumrandungen. Es bleiben immer dieselben 16 Felder – nur die Darstellung ändert sich.
4. **Als Entwurf speichern** ändert im Spiel nichts. **✓ Veröffentlichen** (mit Bestätigung) macht das Design für alle sichtbar. „Neu/Bisher“ vergleicht mit dem aktuellen Design, „↺ Zurück zu …“ holt das vorherige zurück, „Standard verwenden“ das ursprüngliche Aussehen.
Das Originalbild wird nie verändert; gespeichert werden Ausschnitt und Einstellungen separat. Fürs Spiel wird eine verkleinerte Kopie geladen.

**Bearbeiten, duplizieren, löschen**: Karte in der Liste antippen. Mit der Suche und den Filtern (Status, Seltenheit, Sortierung) findest du Karten schnell.

**Wichtig**
- Aktive Karten erscheinen beim nächsten Öffnen des Hauptmenüs im Spiel – ohne Programmieren.
- Das Spiel braucht mindestens **30 aktive Karten**, sonst nutzt es die 100 eingebauten Karten.
- Deaktivierte Karten verschwinden aus Toren, Packs und Decks; Spieler, die sie besitzen, behalten sie für den Fall, dass du sie wieder aktivierst.
- Admin ist, wer auf claude.ai **Besitzer** oder **Editor** der Spielseite ist. Andere bekommen Admin-Rechte über das Teilen-Menü der Seite (Rolle „Editor“). Spieler sollten höchstens „Viewer“ sein.

### Feedback geben
Schreib Claude einfach im Chat, was dir gefällt oder was anders sein soll, zum Beispiel: „Der Lauf ist zu langsam“ oder „Ich möchte mehr legendäre Karten“. Screenshots helfen.

---

## Technik (für Entwickler)

- TypeScript, React 18, Vite 6, Vitest. Kein Backend.
- Spiellogik ohne UI in `src/game/` (Kampfregeln `battle.ts`, Computergegner `ai.ts`, Runner `runner.ts`, Speichern `storage.ts`, Belohnungen `rewards.ts`, Shop `shop.ts`, Skins `skins.ts`, 40 Karten `cards.ts`).
- Bildschirme in `src/screens/`, der Runner zeichnet per Canvas (Pseudo-3D). Animationshelfer (Partikel, Konfetti, hochzählende Zahlen) in `src/components/Effects.tsx`.
- Karten sind hochkant im Format 3:4. Für ein echtes Kartenbild bei der Karte in `src/game/cards.ts` das Feld `image` setzen (URL oder data-URI); das Bild ersetzt dann das Emoji.

```bash
npm install
npm run dev           # Entwicklungsserver
npm test              # automatische Tests
npm run build         # normaler Build nach dist/
npm run build:single  # alles in EINER HTML-Datei (dist-single/index.html) für die gehostete Vorschau
```

Bei jedem Push laufen Typprüfung, Tests und Build automatisch über GitHub Actions (`.github/workflows/ci.yml`).

### Kartendatenbank
- Die Karten liegen in der Datenbank der claude.ai-Spielseite (`db`-Capability, Sammlung `cards`, ein Dokument pro Karte), Bilder im Asset-Speicher der Seite (`assets`), Admin-Prüfung über `user.canEdit()`.
- Zugriffsregel beim Veröffentlichen: `db: { rules: [{ path: "", read: "view", write: "admin" }] }` – lesen dürfen alle Besucher, schreiben nur Besitzer/Editoren; den Asset-Speicher bekommen ohnehin nur Editoren. Die Prüfung macht der Server, nicht das Spiel.
- Code: `src/game/catalog.ts` (Datenprüfung, IDs, Umwandlung, Deck-Reparatur), `src/game/cardStore.ts` (Plattform-Anbindung, Bild-Zuschnitt), `src/screens/Admin.tsx` (Dashboard).
- Ohne Plattform (lokal, `npm run dev`) gibt es keine Datenbank; das Spiel nutzt dann die eingebauten Karten aus `src/game/cards.ts`.

Was getestet ist und was noch offen ist, steht in [TESTING.md](TESTING.md).
