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

// Noise ("air") for wind, dust and stone sounds – no pitched tones, so nothing sounds like a phone or a toy.
let noiseBuf: AudioBuffer | null = null;
function noise(a: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 1.5, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = a.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

/** Filtered air: filter type, frequency from → to (a sweep sounds like a breath of wind), length, loudness, swell time. */
function air(a: AudioContext, type: BiquadFilterType, from: number, to: number, at: number, len: number, vol: number, q = 1, swell = 0.01) {
  const t = a.currentTime + at;
  const src = noise(a);
  const f = a.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + len);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + swell);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t, Math.random() * 0.5);
  src.stop(t + len + 0.05);
}

/** A deep, short body (like a stone set down): low sine that fades fast, no pitch slide. */
function stone(a: AudioContext, freq: number, at: number, len: number, vol: number) {
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + len + 0.05);
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
      case 'tap': air(a, 'bandpass', 2400, 1600, 0, 0.05, 0.05, 2, 0.004); break;
      // Card laid: a rune stone set down – a deep, soft knock with a little dust of air.
      case 'place': stone(a, 92, 0, 0.22, 0.12); air(a, 'lowpass', 900, 300, 0, 0.14, 0.05); break;
      // Cards taken: a breath of wind sweeping upwards, with a faint shimmer at the end.
      case 'flip': air(a, 'bandpass', 350, 2200, 0, 0.45, 0.07, 3, 0.18); air(a, 'highpass', 6000, 9000, 0.25, 0.35, 0.012, 1, 0.05); break;
      // Rune: a long, deep swell of wind over a low hum.
      case 'rune': stone(a, 73.42, 0, 1.2, 0.06); air(a, 'bandpass', 200, 1600, 0, 1.1, 0.08, 4, 0.5); air(a, 'highpass', 5000, 8000, 0.5, 0.7, 0.012, 1, 0.2); break;
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
