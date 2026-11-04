// Big symbol on result screens: crown (win), handshake (draw), skull (loss) – same everywhere.
import { GameIcon } from './GameIcon';

export function ResultIcon({ outcome }: { outcome: 'win' | 'draw' | 'loss' | 'expired' }) {
  const name = outcome === 'win' ? 'crown' : outcome === 'draw' ? 'handshake' : 'skull';
  return <div className="result-icon" aria-hidden="true"><GameIcon name={name} /></div>;
}
