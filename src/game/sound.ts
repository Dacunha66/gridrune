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
export function audio(): AudioContext | null {
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

// A short echo ("hall") the mystic sounds ring out in.
let hall: DelayNode | null = null;
function echoBus(a: AudioContext): AudioNode {
  if (!hall) {
    hall = a.createDelay(1);
    hall.delayTime.value = 0.18;
    const fb = a.createGain();
    fb.gain.value = 0.35;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    hall.connect(lp).connect(fb).connect(hall);
    lp.connect(a.destination);
  }
  return hall;
}

/** A glassy bell: two slightly detuned sines plus a quiet overtone, fast attack, long soft fade, with echo. */
function bell(a: AudioContext, freq: number, at: number, len: number, vol: number) {
  const t = a.currentTime + at;
  const out = a.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  out.gain.exponentialRampToValueAtTime(0.0001, t + len);
  out.connect(a.destination);
  out.connect(echoBus(a));
  for (const [f, v] of [[freq, 1], [freq * 1.004, 0.6], [freq * 2.76, 0.12]] as const) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.value = v;
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
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
      // Card laid: a deep, soft hum under a glassy chime (D and A) – no pitch slide, so nothing "blubs".
      case 'place': tone(a, 146.83, 0, 0.35, 0.04, 'sine'); bell(a, 587.33, 0, 0.7, 0.045); bell(a, 880, 0.03, 0.6, 0.025); break;
      // Cards taken: a quick rising shimmer of three bells (D-minor pentatonic).
      case 'flip': [698.46, 880, 1174.66].forEach((f, i) => bell(a, f, i * 0.06, 0.8, 0.035)); break;
      case 'rune': tone(a, 146.83, 0, 0.9, 0.04, 'sine'); [587.33, 698.46, 880, 1046.5, 1396.91].forEach((f, i) => bell(a, f, i * 0.07, 1.1, 0.03)); break;
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
