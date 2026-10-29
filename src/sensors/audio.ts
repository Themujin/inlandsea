// Web Audio siren and chime. The context must be created or resumed inside a user
// gesture (the Start tap) or browsers keep it suspended.

let ctx: AudioContext | null = null;
let siren: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

export function isSirenOn(): boolean {
  return siren !== null;
}

/** Two-tone wailing siren, 600–1200 Hz, until turned off. */
export function setSiren(on: boolean): void {
  if (!ctx || on === (siren !== null)) return;
  if (!on) {
    const s = siren!;
    siren = null;
    s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    s.osc.stop(ctx.currentTime + 0.3);
    s.lfo.stop(ctx.currentTime + 0.3);
    return;
  }
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = 900;
  const lfo = ctx.createOscillator();
  lfo.type = "triangle";
  lfo.frequency.value = 0.8;
  const depth = ctx.createGain();
  depth.gain.value = 300;
  lfo.connect(depth).connect(osc.frequency);
  const gain = ctx.createGain();
  gain.gain.value = 0.25;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  lfo.start();
  siren = { osc, lfo, gain };
}

/** Single soft two-note chime for CAUTION. */
export function chime(): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t + i * 0.18);
    osc.stop(t + i * 0.18 + 0.55);
  });
}
