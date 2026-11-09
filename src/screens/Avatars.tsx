// The player's avatar: all avatars, the unlocked ones to choose, the locked ones with the achievement that unlocks
// them. The server decides what is unlocked and stores the choice (with the titles).
import { useEffect, useState } from 'react';
import { Header } from './Header';
import { Avatar } from '../components/Avatar';
import { AVATARS, DEFAULT_AVATAR } from '../game/avatars';
import { QuestOverview, equipAvatar, questOverview } from '../game/questApi';

export function Avatars({ onAvatar, onBack }: { onAvatar: (id: string) => void; onBack: () => void }) {
  const [data, setData] = useState<QuestOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    questOverview().then((r) => {
      if (!alive) return;
      if (r === 'offline') setError('Keine Verbindung – die Avatare brauchen kurz Internet.');
      else setData(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function pick(id: string) {
    if (!data) return;
    setBusy(true);
    setError('');
    const t = await equipAvatar(id);
    setBusy(false);
    if (t) {
      setData({ ...data, titles: t });
      onAvatar(id);
    } else setError('Der Avatar konnte nicht gesetzt werden.');
  }

  const current = data?.titles.avatar ?? DEFAULT_AVATAR;
  const open = data ? data.avatars.length : 0;
  const all = AVATARS.filter((a) => a.active !== false);
  return (
    <main className="screen avatars-screen">
      <Header title="Dein Avatar" onBack={onBack} right={data ? <span className="pill">{open}/{all.length}</span> : undefined} />
      <div className="scroll avatars-body">
        {error && <p className="hint warn-text" role="alert">{error}</p>}
        {!data && !error && <p className="muted center">Lade deine Avatare …</p>}
        {data && (
          <>
            <div className="avatars-current">
              <Avatar id={current} size={88} />
              <p className="muted small">Dein Avatar erscheint im Hauptmenü, im Duell gegen Spieler und in der Raid-Bestenliste. Neue Avatare schaltest du mit Erfolgen frei.</p>
            </div>
            <div className="avatar-grid" role="group" aria-label="Avatar wählen">
              {all.map((av) => {
                const free = data.avatars.includes(av.id);
                const on = current === av.id;
                const need = av.quest ? data.board.achievements.find((i) => i.key === `a:${av.quest}`) : null;
                return (
                  <button key={av.id} type="button" className={`avatar-pick ${on ? 'on' : ''}`} disabled={!free || busy || on} aria-pressed={on}
                    onClick={() => void pick(av.id)} aria-label={free ? `${av.name}${on ? ', gewählt' : ''}` : `${av.name}, gesperrt${need ? `: ${need.text}` : ''}`}>
                    <Avatar id={av.id} size={56} locked={!free} />
                    <span>{av.name}</span>
                    {!free && need && <small>{need.chain ? `${need.chain}: ` : ''}{need.text}</small>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
