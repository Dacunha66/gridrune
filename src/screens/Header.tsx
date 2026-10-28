import { ReactNode } from 'react';

export function Header({ title, onBack, right, backButton }: { title: string; onBack: () => void; right?: ReactNode; backButton?: ReactNode }) {
  return (
    <header className="topbar">
      {backButton ?? <button type="button" className="btn btn-small" onClick={onBack} aria-label="Zurück">◀ Zurück</button>}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}
