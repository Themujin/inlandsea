// Web Audio alert tones. The context must be created or resumed inside a user
// gesture (the Start tap) or browsers keep it suspended.
//
// Sounds are soft sine "bell" notes rather than a siren: urgent through repetition,
// not harshness, so they are bearable in a car for as long as DANGER lasts.

let ctx: AudioContext | null = null;
let alarm: ReturnType<typeof setInterval> | null = null;

/** DANGER: descending two-note chime (B5 → G5), repeated every 1.4 s. */
const ALARM_NOTES = [988, 784];
const ALARM_NOTE_GAP_S = 0.24;
const ALARM_REPEAT_MS = 1400;
const ALARM_GAIN = 0.22;

/** CAUTION: single rising pair, played once. */
const CHIME_NOTES = [660, 880];
const CHIME_GAIN = 0.16;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** One bell-like note: sine plus a quiet octave, fast attack, smooth decay. */
function bell(freq: number, at: number, peak: number, decay = 0.6): void {
  if (!ctx) return;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  gain.connect(ctx.destination);
  for (const [mult, level] of [
    [1, 1],
    [2, 0.25],
  ]) {
    const osc = ctx.createOscillator();
    const partial = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq * mult;
    partial.gain.value = level;
    osc.connect(partial).connect(gain);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }
}

function playAlarmOnce(): void {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  ALARM_NOTES.forEach((f, i) => bell(f, t + i * ALARM_NOTE_GAP_S, ALARM_GAIN));
}

/** Repeating DANGER alarm until turned off. */
export function setSiren(on: boolean): void {
  if (!ctx || on === (alarm !== null)) return;
  if (!on) {
    clearInterval(alarm!);
    alarm = null;
    return;
  }
  playAlarmOnce();
  alarm = setInterval(playAlarmOnce, ALARM_REPEAT_MS);
}

/** Single soft chime for CAUTION. */
export function chime(): void {
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  CHIME_NOTES.forEach((f, i) => bell(f, t + i * 0.18, CHIME_GAIN, 0.8));
}
