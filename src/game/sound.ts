// Small, quiet sounds made right here in the browser (Web Audio) – no sound files, nothing to license or load.
// On or off is a setting of this device (localStorage), like the volume of a phone; default: on.
export type Sfx = 'tap' | 'place' | 'flip' | 'rune' | 'win' | 'lose' | 'draw' | 'coin' | 'reward';

const KEY = 'gridrune/sound';
let on: boolean = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
const listeners = new Set<(on: boolean) => void>();

export const isSoundOn = () => on;
export function setSoundOn(value: boolean): void {
  on = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // Private mode: the setting lasts until the page is closed.
  }
  listeners.forEach((l) => l(value));
  if (value) sfx('tap');
}
export function onSoundChange(l: (on: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // iPhone/iPad start the sound only after a tap: resume on every play (harmless when running).
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One soft tone: frequency (Hz), start offset and length (s), loudness 0–1 (kept low), wave form. */
function tone(a: AudioContext, freq: number, at: number, len: number, vol: number, type: OscillatorType = 'sine', slideTo?: number) {
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + len + 0.02);
}

/** Plays a short sound (nothing when sound is off or the device has no audio). */
export function sfx(kind: Sfx): void {
  if (!on) return;
  const a = audio();
  if (!a) return;
  try {
    switch (kind) {
      case 'tap': tone(a, 660, 0, 0.05, 0.03, 'triangle'); break;
      case 'place': tone(a, 220, 0, 0.09, 0.09, 'triangle', 150); tone(a, 440, 0.01, 0.06, 0.03); break;
      case 'flip': tone(a, 520, 0, 0.08, 0.05, 'triangle', 780); break;
      case 'rune': tone(a, 392, 0, 0.35, 0.05, 'sine', 784); tone(a, 587, 0.08, 0.3, 0.035); break;
      case 'coin': tone(a, 988, 0, 0.08, 0.05, 'square'); tone(a, 1319, 0.07, 0.18, 0.045, 'square'); break;
      case 'reward': [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.09, 0.28, 0.05, 'triangle')); break;
      case 'win': [523, 659, 784].forEach((f, i) => tone(a, f, i * 0.12, 0.35, 0.06, 'triangle')); tone(a, 1047, 0.36, 0.6, 0.05, 'triangle'); break;
      case 'draw': tone(a, 440, 0, 0.3, 0.05, 'triangle'); tone(a, 440, 0.2, 0.35, 0.04, 'triangle'); break;
      case 'lose': tone(a, 392, 0, 0.3, 0.05, 'triangle'); tone(a, 330, 0.22, 0.3, 0.05, 'triangle'); tone(a, 262, 0.44, 0.5, 0.045, 'triangle'); break;
    }
  } catch {
    // Sound must never break the game.
  }
}
