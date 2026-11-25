// Quiet, mystic background music for the start screen and the menu – composed live in the browser (Web Audio),
// no music files: a low drone, slow minor chords and now and then a soft bell note with an echo. Never repeats exactly.
// On or off is a setting of this device (localStorage, separate from the sound effects); default: on.
import { audio } from './sound';

const KEY = 'gridrune/music';
let on: boolean = (() => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
})();
const listeners = new Set<(on: boolean) => void>();
export const isMusicOn = () => on;
export function onMusicChange(l: (on: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function setMusicOn(value: boolean): void {
  on = value;
  try {
    localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // Private mode: the setting lasts until the page is closed.
  }
  listeners.forEach((l) => l(value));
  update();
}

let wanted = false; // the current screen would like music
let player: { stop: () => void } | null = null;

/** Called by the app: true on start screen / menu, false everywhere else. */
export function setMusicWanted(value: boolean): void {
  wanted = value;
  update();
}

function update() {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
  const should = on && wanted && !hidden;
  if (should && !player) player = start();
  if (!should && player) {
    player.stop();
    player = null;
  }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', update);

// D minor / Aeolian: Dm – B♭ – F – C, then Dm – Gm – B♭ – A (a little tension before it starts again).
const CHORDS = [
  [146.83, 174.61, 220.0], [116.54, 146.83, 174.61], [174.61, 220.0, 261.63], [130.81, 164.81, 196.0],
  [146.83, 174.61, 220.0], [98.0, 116.54, 146.83], [116.54, 146.83, 174.61], [110.0, 138.59, 164.81],
];
const BELLS = [587.33, 698.46, 783.99, 880.0, 1046.5, 1174.66]; // D-minor pentatonic up high
const BAR = 8; // seconds per chord

function start(): { stop: () => void } | null {
  const a = audio();
  if (!a) return null;
  try {
    const master = a.createGain();
    master.gain.setValueAtTime(0.0001, a.currentTime);
    master.gain.exponentialRampToValueAtTime(0.5, a.currentTime + 4); // slow fade-in
    master.connect(a.destination);

    // Soft lowpass for everything, plus an echo (delay with feedback) for a "hall".
    const tone = a.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    tone.connect(master);
    const echo = a.createDelay(2);
    echo.delayTime.value = 0.55;
    const feedback = a.createGain();
    feedback.gain.value = 0.4;
    const echoOut = a.createGain();
    echoOut.gain.value = 0.5;
    echo.connect(feedback).connect(echo);
    echo.connect(echoOut).connect(tone);

    // Drone: D and A very low, breathing slowly.
    const drones: OscillatorNode[] = [];
    for (const [f, v] of [[73.42, 0.05], [110, 0.03], [73.6, 0.03]] as const) {
      const o = a.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = a.createGain();
      g.gain.value = v;
      const lfo = a.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const depth = a.createGain();
      depth.gain.value = v * 0.6;
      lfo.connect(depth).connect(g.gain);
      o.connect(g).connect(tone);
      o.start();
      lfo.start();
      drones.push(o, lfo);
    }

    const note = (freq: number, at: number, len: number, vol: number, type: OscillatorType, toEcho: boolean) => {
      const o = a.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + Math.min(len * 0.4, 2.5));
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(tone);
      if (toEcho) g.connect(echo);
      o.start(at);
      o.stop(at + len + 0.05);
    };

    let next = a.currentTime + 0.5;
    let bar = 0;
    const schedule = () => {
      while (next < a.currentTime + BAR + 1) {
        const chord = CHORDS[bar % CHORDS.length];
        for (const f of chord) note(f, next, BAR + 1.5, 0.022, 'triangle', false);
        // 2–4 bell notes per chord at random moments, sometimes none – so it never sounds like a loop.
        const bells = Math.floor(Math.random() * 4);
        for (let i = 0; i < bells; i++) {
          const f = BELLS[Math.floor(Math.random() * BELLS.length)];
          note(f, next + 0.5 + Math.random() * (BAR - 1.5), 2.2, 0.018, 'sine', true);
        }
        next += BAR;
        bar++;
      }
    };
    schedule();
    const timer = setInterval(schedule, 1000);

    return {
      stop: () => {
        clearInterval(timer);
        const t = a.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
        master.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        setTimeout(() => {
          drones.forEach((o) => {
            try { o.stop(); } catch { /* already stopped */ }
          });
          master.disconnect();
        }, 1400);
      },
    };
  } catch {
    return null; // music must never break the game
  }
}
