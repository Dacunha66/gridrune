// Auffangnetz: if a screen of the game crashes, the player sees a friendly page with "Neu laden" instead of an empty
// screen, and the error is reported (errorReport.ts). Saved progress is not touched – it lives in the save, not here.
import { Component, ReactNode } from 'react';
import { reportError } from '../game/errorReport';

export class CrashGuard extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: unknown) {
    reportError('crash', error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="screen crash-screen" role="alert">
        <div className="crash-card">
          <h1>Da ist etwas schiefgegangen</h1>
          <p>Das Spiel hatte einen Fehler. Dein Fortschritt ist gespeichert – lade das Spiel einfach neu.</p>
          <p className="muted small">Der Fehler wurde automatisch gemeldet, damit er behoben werden kann.</p>
          <button type="button" className="btn btn-primary btn-wide" onClick={() => location.reload()}>Neu laden</button>
          <button type="button" className="btn" onClick={() => { location.hash = ''; location.reload(); }}>Zum Hauptmenü</button>
        </div>
      </main>
    );
  }
}
