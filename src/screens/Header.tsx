import { ReactNode } from 'react';
import { GameIcon } from '../components/GameIcon';

export function Header({ title, onBack, right, backButton }: { title: string; onBack: () => void; right?: ReactNode; backButton?: ReactNode }) {
  return (
    <header className="topbar">
      {backButton ?? <button type="button" className="btn btn-small btn-back" onClick={onBack} aria-label="Zurück"><GameIcon name="back" /> Zurück</button>}
      <h1>{title}</h1>
      <div className="topbar-right">{right}</div>
    </header>
  );
}
