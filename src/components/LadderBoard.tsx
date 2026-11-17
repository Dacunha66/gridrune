// Bestenliste of the Ranglisten-Liga: the top 100 of the current season (step, then win points, then wins) and the
// own place. Comes from the server function "game" (ladder-board); names and avatars as the players chose them.
import { useEffect, useState } from 'react';
import { Header } from '../screens/Header';
import { Avatar } from './Avatar';
import { LeagueEmblem } from './Ladder';
import { LadderBoard as Board, ladderBoardRemote } from '../game/adventureApi';
import { seasonName, stepName } from '../game/ladder';

export function LadderBoardView({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board | null | 'offline'>(null);
  useEffect(() => {
    let alive = true;
    void ladderBoardRemote().then((b) => alive && setBoard(b ?? 'offline'));
    return () => { alive = false; };
  }, []);
  const b = board && board !== 'offline' ? board : null;
  const meShown = !!b?.rows.some((r) => r.me);
  return (
    <main className="screen league ladder-board">
      <Header title="Bestenliste" onBack={onBack} />
      <div className="scroll">
        {board === null && <p className="muted center">Bestenliste wird geladen …</p>}
        {board === 'offline' && <p className="hint center">Keine Verbindung – für die Bestenliste brauchst du kurz Internet.</p>}
        {b && (
          <>
            <p className="muted center small">Saison {seasonName(b.season)} · {b.total} Spieler · nach Stufe, Siegpunkten und Siegen</p>
            {b.me
              ? <p className="raid-myrank">Dein Platz: <b>{b.me.rank}.</b> von {b.total} · {stepName(b.me.step)} · {b.me.wins} Siege</p>
              : <p className="raid-myrank">Spiel diese Saison ein Ranglisten-Match, dann stehst du auch in der Liste.</p>}
            {b.rows.length === 0
              ? <p className="muted center">Diese Saison hat noch niemand gespielt – sei der Erste!</p>
              : (
                <ol className="board-list">
                  {b.rows.map((r) => (
                    <li key={r.rank} className={r.me ? 'me' : ''}>
                      <span className="board-rank">{r.rank}</span>
                      <span className="board-name"><Avatar id={r.avatar} size={26} label={`Avatar von ${r.name}`} /><b>{r.name}</b></span>
                      <span className="board-step"><LeagueEmblem step={r.step} size={26} /><span>{stepName(r.step)}<small>{r.points} Pkt · {r.wins} Siege</small></span></span>
                    </li>
                  ))}
                </ol>
              )}
            {b.me && !meShown && <p className="muted center small">Die Liste zeigt die ersten {b.rows.length}. Du bist auf Platz {b.me.rank}.</p>}
          </>
        )}
      </div>
    </main>
  );
}
