import { useEffect, useRef } from 'react';

/**
 * Plays a beeping countdown sound.
 * - slow beep (every 2s) when secondsLeft >= 10
 * - fast beep (every 0.5s) when secondsLeft < 10
 * Stops automatically when active = false or secondsLeft = 0.
 */
export function useCountdownSound(active: boolean, secondsLeft: number) {
  const fastMode = secondsLeft > 0 && secondsLeft < 10;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active || secondsLeft <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    const freq = fastMode ? 1100 : 880;
    const interval = fastMode ? 500 : 2000;

    function beep() {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.12);
        // close context after tone finishes
        setTimeout(() => ctx.close(), 200);
      } catch {
        // AudioContext not available (SSR or permission denied)
      }
    }

    beep(); // immediate first beep
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(beep, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // Re-run when fastMode changes (crossing the 10s threshold)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fastMode, secondsLeft <= 0]);
}
