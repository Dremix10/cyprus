// ─── Sound Manager ─────────────────────────────────────────────────────
// Generates game sounds using the Web Audio API (no audio files needed).

let muted = localStorage.getItem('cyprus-sound') !== 'on'; // off by default

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  localStorage.setItem('cyprus-sound', value ? 'off' : 'on');
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15,
  ramp?: { to: number; at: number },
) {
  if (muted) return;
  const ac = getCtx();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  if (ramp) {
    osc.frequency.exponentialRampToValueAtTime(ramp.to, ac.currentTime + ramp.at);
  }
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

function playNoise(duration: number, volume = 0.08) {
  if (muted) return;
  const ac = getCtx();
  const bufSize = ac.sampleRate * duration;
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  const filter = ac.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  src.connect(filter).connect(gain).connect(ac.destination);
  src.start();
  src.stop(ac.currentTime + duration);
}

// ─── Public Sound Effects ──────────────────────────────────────────────

/** Card played onto trick area */
export function playCardSound() {
  playNoise(0.08, 0.12);
  playTone(300, 0.08, 'triangle', 0.06);
}

/** Player passes their turn */
export function playPassSound() {
  playTone(200, 0.15, 'sine', 0.06);
}

/** Bomb played! */
export function playBombSound() {
  playTone(120, 0.4, 'sawtooth', 0.2, { to: 40, at: 0.35 });
  playNoise(0.3, 0.2);
  setTimeout(() => playTone(80, 0.3, 'square', 0.12), 100);
}

/** Tichu or Grand Tichu called */
export function playTichuCallSound() {
  playTone(523, 0.12, 'triangle', 0.12); // C5
  setTimeout(() => playTone(659, 0.12, 'triangle', 0.12), 120); // E5
  setTimeout(() => playTone(784, 0.2, 'triangle', 0.14), 240); // G5
}

/** Trick won — cards collected */
export function playTrickWonSound() {
  playTone(440, 0.1, 'sine', 0.08);
  setTimeout(() => playTone(550, 0.15, 'sine', 0.08), 80);
}

/** Player finished (went out) */
export function playPlayerOutSound() {
  playTone(392, 0.1, 'triangle', 0.1); // G4
  setTimeout(() => playTone(523, 0.1, 'triangle', 0.1), 100); // C5
  setTimeout(() => playTone(659, 0.2, 'triangle', 0.12), 200); // E5
}

/** Dragon given away */
export function playDragonGiveSound() {
  playTone(350, 0.2, 'sawtooth', 0.08, { to: 200, at: 0.18 });
}

/** Wish made */
export function playWishSound() {
  playTone(600, 0.15, 'sine', 0.1);
  setTimeout(() => playTone(800, 0.2, 'sine', 0.1), 130);
}

/** Round or game over fanfare */
export function playRoundEndSound() {
  playTone(523, 0.15, 'triangle', 0.1);
  setTimeout(() => playTone(659, 0.15, 'triangle', 0.1), 150);
  setTimeout(() => playTone(784, 0.15, 'triangle', 0.1), 300);
  setTimeout(() => playTone(1047, 0.3, 'triangle', 0.12), 450);
}

/** Your turn notification */
export function playYourTurnSound() {
  playTone(660, 0.1, 'sine', 0.08);
  setTimeout(() => playTone(880, 0.15, 'sine', 0.08), 100);
}
