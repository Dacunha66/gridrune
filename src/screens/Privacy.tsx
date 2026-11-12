// Datenschutz: what the game stores and why. The text describes the game as it is built (accounts and saves with
// Supabase in the EU, website on Cloudflare, fonts shipped with the game, browser storage, community); the operator's name,
// address and e-mail come from the admin (settings document "privacy").
import { ReactNode } from 'react';
import { Header } from './Header';
import { privacyInfo } from '../game/privacy';

const CODE_DATE = '2026-11-12';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="privacy-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Privacy({ onBack }: { onBack: () => void }) {
  const p = privacyInfo();
  const missing = <span className="privacy-missing">[noch nicht eingetragen]</span>;
  const date = new Date(`${p.updated || CODE_DATE}T12:00:00Z`).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const mail = p.contact ? <a href={`mailto:${p.contact}`}>{p.contact}</a> : missing;
  return (
    <main className="screen privacy">
      <Header title="Datenschutz" onBack={onBack} />
      <div className="scroll privacy-text">
        <p className="muted">Stand: {date}</p>

        <Section title="Verantwortlich">
          <p className="privacy-operator">{p.operator || missing}</p>
          <p>E-Mail für Datenschutzfragen: {mail}</p>
        </Section>

        <Section title="Kurz gesagt">
          <ul>
            <li>GridRune zeigt keine Werbung und nutzt kein Tracking und keine Analyse-Dienste von Drittanbietern.</li>
            <li>Ohne Konto bleibt dein Spielstand nur auf deinem Gerät.</li>
            <li>Mit Konto speichern wir, was für das Spiel nötig ist: E-Mail, Anzeigename, Spielstand und Spielergebnisse.</li>
            <li>Bezahlen mit Geld ist derzeit nicht möglich.</li>
            <li>Schriftarten und Bilder liefern wir selbst aus – es werden keine Inhalte von Google oder anderen Drittanbietern nachgeladen.</li>
          </ul>
        </Section>

        <Section title="Spielen als Gast">
          <p>Dein Spielstand (Karten, Münzen, Deck, Einstellungen) wird nur im Speicher deines Browsers abgelegt („Local Storage“) und nicht an uns übertragen.
            Damit das Spiel auch ohne Internet startet, legt ein sogenannter Service Worker die Spieldateien auf deinem Gerät ab.
            Beides kannst du jederzeit löschen, indem du die Website-Daten in deinem Browser entfernst.</p>
          <p>Um Kartendaten, Bilder und Spielinhalte zu laden, ruft dein Gerät unsere Server auf (siehe „Hosting“). Dabei wird technisch deine IP-Adresse übertragen.</p>
        </Section>

        <Section title="Konto">
          <p>Für ein Konto verarbeiten wir deine E-Mail-Adresse, dein Passwort (nur verschlüsselt gespeichert, wir können es nicht lesen) und deinen Anzeigenamen.
            Zur Bestätigung und zum Zurücksetzen des Passworts erhältst du E-Mails.</p>
          <p>Mit Konto speichern wir deinen Spielstand und Fortschritt: Karten, Deck, Münzen, Runensteine, Essenzen, Editionen, Kampagne, Erfolge und Titel,
            Avatar, Puzzle-Event-Fortschritt, Login-Kalender sowie die Ergebnisse geprüfter Spiele (Einfaches Spiel, Kampagne, Rangliste, Raid, Online-Duell).
            Damit niemand schummeln kann, prüft der Server Spielverläufe und schreibt Belohnungen selbst gut.</p>
          <p>Für eine Spiel-Statistik des Betreibers speichern wir außerdem, an welchen Tagen du das Spiel mit Konto geöffnet hast (nur das Datum, höchstens 400 Tage lang).
            Die Statistik zeigt nur Summen über alle Spieler – etwa wie viele Spieler an einem Tag aktiv waren, wie oft Karten in gewonnenen Spielen dabei waren
            und wie viele Münzen insgesamt im Spiel sind –, keine einzelnen Spieler.</p>
          <p>Andere angemeldete Spieler sehen deinen Anzeigenamen und Avatar in Online-Duellen, Bestenlisten und in der Community.</p>
          <p>Rechtsgrundlage ist die Bereitstellung des Spiels, das du nutzen möchtest (Art. 6 Abs. 1 lit. b DSGVO); die Prüfung gegen Schummeln dient zusätzlich
            einem fairen Spiel für alle (Art. 6 Abs. 1 lit. f DSGVO). Die Daten bleiben gespeichert, solange dein Konto besteht.
            Du kannst dein Konto jederzeit selbst löschen (Mehr → Konto → Konto löschen) – dabei werden alle Daten zu deinem Konto sofort gelöscht.
            Alternativ schreib uns an {mail}.</p>
        </Section>

        <Section title="Community: Clans und Chat">
          <p>Wenn du den Community-Bereich nutzt, verarbeiten wir:</p>
          <ul>
            <li><b>Chat-Nachrichten:</b> Text, Zeitpunkt, Kanal (allgemeiner Chat oder Clan-Chat) sowie Anzeigename, Avatar und Clan-Kürzel zum Zeitpunkt der Nachricht.</li>
            <li><b>Clan-Daten:</b> Name, Kürzel, Wappen und Beschreibung des Clans; deine Mitgliedschaft, Rolle, Beitrittsdatum und Clanpunkte (aus deinen vom Server geprüften Siegen).</li>
            <li><b>Beitrittsanfragen</b> an Clans.</li>
            <li><b>Chat-Regeln:</b> wann du sie bestätigt hast.</li>
            <li><b>Meldungen:</b> die gemeldete Nachricht, wer gemeldet hat, Grund und Zeitpunkt.</li>
            <li><b>Blockierungen:</b> welche Spieler du blockiert hast – diese Liste siehst nur du.</li>
            <li><b>Moderation:</b> ob und bis wann du im Chat stummgeschaltet bist, mit Grund.</li>
            <li><b>Schutz vor Spam:</b> der Zeitpunkt deiner letzten Nachricht.</li>
          </ul>
          <p><b>Wer was sieht:</b> Den allgemeinen Chat, Clans und die Clan-Rangliste sehen alle angemeldeten Spieler. Den Clan-Chat sehen nur Mitglieder des Clans.
            Clanmitglieder sehen Namen, Avatare, Rollen und Clanpunkte der anderen Mitglieder; Anführer und Offiziere zusätzlich die Beitrittsanfragen.
            Meldungen und Stummschaltungen sehen nur die Betreiber des Spiels, die gemeldete Nachrichten prüfen.</p>
          <p><b>Automatische Prüfung:</b> Vor dem Speichern werden Links entfernt und bestimmte beleidigende Wörter durch Sterne ersetzt; pro Spieler ist höchstens eine Nachricht
            alle 3 Sekunden möglich. Eine weitere automatische Auswertung oder Profilbildung findet nicht statt.</p>
          <p><b>Rechtsgrundlage:</b> Bereitstellung der Community-Funktionen (Art. 6 Abs. 1 lit. b DSGVO); die Moderation dient dem Schutz aller Spieler (Art. 6 Abs. 1 lit. f DSGVO).</p>
          <p><b>Speicherdauer:</b> Chat-Nachrichten werden nach 30 Tagen automatisch gelöscht (vom Admin gelöschte Nachrichten sind sofort ausgeblendet und werden ebenfalls nach
            spätestens 30 Tagen entfernt), Clan-Chats auch beim Auflösen des Clans. Meldungen werden mit der Nachricht gelöscht. Mitgliedschaft und Clanpunkte werden gelöscht,
            wenn du den Clan verlässt oder entfernt wirst, Clan-Daten beim Auflösen des Clans. Stummschaltungen gelten für die festgelegte Dauer, Blockierungen bis du sie aufhebst.
            Beim Löschen deines Kontos werden alle diese Daten gelöscht.</p>
          <p><b>Bitte beachte:</b> Gib im Chat keine persönlichen Daten preis – weder eigene (Adresse, Telefonnummer, Passwörter) noch fremde.</p>
        </Section>

        <Section title="Hosting und Dienstleister">
          <ul>
            <li><b>Supabase</b> (Supabase Inc.) betreibt für uns Datenbank, Anmeldung, E-Mail-Versand, Bildspeicher und die Server-Funktionen des Spiels in einem Rechenzentrum in der EU (Irland).
              Supabase verarbeitet die Daten in unserem Auftrag (Art. 28 DSGVO).</li>
            <li><b>Cloudflare</b> (Cloudflare, Inc.) liefert die Website aus. Dabei werden technisch nötige Verbindungsdaten wie die IP-Adresse verarbeitet; eine Übermittlung in die USA
              ist möglich. Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert.</li>
          </ul>
        </Section>

        <Section title="Deine Rechte">
          <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch gegen Verarbeitungen auf Grundlage
            berechtigter Interessen. Schreib dazu an {mail}. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Behörde
            deines Bundeslandes.</p>
        </Section>
      </div>
    </main>
  );
}
