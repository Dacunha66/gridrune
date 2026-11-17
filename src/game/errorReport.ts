// Fehlersammlung: errors in the player's game are sent to the server (report_client_error, see migration 030), so the
// admin sees them in the admin area. No personal data: the error text, where it happened, the game version and the
// kind of device. At most a few reports per visit; the same error is sent only once.
import { webBackend } from './cardStore';

const MAX_REPORTS = 5;
const sent = new Set<string>();

/** Version of the game (the program file name changes with every release). */
export function gameVersion(): string {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
  return src.split('/').pop()?.slice(0, 60) ?? '';
}

/** Short device description (e.g. "iPhone · Safari"), never the full browser string. */
export function deviceKind(ua: string = navigator.userAgent): string {
  const device = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'anderes Gerät';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  const app = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches ? ' · App' : '';
  return `${device} · ${browser}${app}`;
}

/** The screen the player is on (the address part after #, if any). */
const place = () => (location.hash || location.pathname).slice(0, 200);

export function reportError(kind: 'crash' | 'error' | 'promise', error: unknown): void {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error)?.slice(0, 300) ?? 'unbekannt');
    const message = `${e.name}: ${e.message}`.slice(0, 300);
    if (sent.has(message) || sent.size >= MAX_REPORTS) return;
    sent.add(message);
    void webBackend().then((web) => web?.supabase().rpc('report_client_error', {
      p_kind: kind, p_message: message, p_stack: (e.stack ?? '').slice(0, 2000), p_place: place(), p_version: gameVersion(), p_device: deviceKind(),
    })).catch(() => undefined);
  } catch {
    // Reporting must never cause a new error.
  }
}

/** Errors outside React (scripts, promises nobody waited for). */
export function watchErrors(): void {
  window.addEventListener('error', (ev) => {
    // Pictures or scripts that did not load are not program errors.
    if (!ev.error && !ev.message) return;
    reportError('error', ev.error ?? ev.message);
  });
  window.addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason));
}
