// Vibration, speech and Screen Wake Lock. All degrade silently where unsupported
// (iOS has no navigator.vibrate).

export function vibrate(pattern: number | number[]): void {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

export function speak(text: string, lang: string): void {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  window.speechSynthesis.speak(u);
}

/** FR-05: holds a screen wake lock and re-acquires it when the page becomes visible again. */
export function holdWakeLock(onChange: (held: boolean) => void): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  const acquire = async () => {
    if (released || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
      onChange(true);
      sentinel.addEventListener("release", () => onChange(false));
    } catch {
      onChange(false);
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  void acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release();
  };
}
