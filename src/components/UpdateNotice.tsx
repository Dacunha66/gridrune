// New release available: the game kept on the iPhone (home screen) often only comes back from the background, so the
// old program keeps running. When the game comes back (or every 10 minutes) it looks whether the page now names
// another program file; if so, it offers to load the new version with one tap.
import { useEffect, useState } from 'react';
import { GameIcon } from './GameIcon';

const MAIN_SCRIPT = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+\.js)"/;

function currentScript(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]');
  return el ? new URL(el.src, location.href).pathname : null;
}

export function UpdateNotice() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const mine = currentScript();
    if (!mine) return;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < 60_000 || document.visibilityState !== 'visible') return;
      last = Date.now();
      try {
        const res = await fetch(`./?check=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const m = MAIN_SCRIPT.exec(await res.text());
        if (m && new URL(m[1], location.href).pathname !== mine) setReady(true);
      } catch {
        // Offline: try again later.
      }
    };
    void check();
    const t = setInterval(check, 10 * 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  if (!ready) return null;
  return (
    <div className="update-notice" role="status">
      <GameIcon name="next" /> <span className="update-text">Neue Version verfügbar</span>
      <button type="button" className="btn btn-small btn-primary" onClick={() => location.reload()}>Jetzt aktualisieren</button>
    </div>
  );
}
