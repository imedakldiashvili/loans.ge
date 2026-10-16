import { useCallback, useEffect, useRef } from 'react';

// Getting the staff member's attention when a new application arrives while they look elsewhere:
// a short sound and a counter in the tab title — "(2) loans.ge — …" — cleared when the tab is looked at again.

/** Two short tones (Web Audio — no sound file). Browsers allow sound only after the page was interacted with. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((hz, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.17);
    });
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* no audio — the title counter still works */
  }
}

/** Title counter of unseen new applications; returns a function to call for each one. */
export function useTitleCounter() {
  const base = useRef(document.title);
  const unseen = useRef(0);
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState !== 'visible') return;
      unseen.current = 0;
      document.title = base.current;
    };
    document.addEventListener('visibilitychange', seen);
    window.addEventListener('focus', seen);
    return () => {
      document.removeEventListener('visibilitychange', seen);
      window.removeEventListener('focus', seen);
      document.title = base.current;
    };
  }, []);
  return useCallback(() => {
    if (document.visibilityState === 'visible' && document.hasFocus()) return; // being looked at — the list update is enough
    unseen.current += 1;
    document.title = `(${unseen.current}) ${base.current}`;
  }, []);
}
