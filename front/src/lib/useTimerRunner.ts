import { useEffect } from 'react';

import { useAuthStore } from '../store/auth.store';
import { parseTimer, useTimerStore } from '../store/timer.store';
import { api } from './api';

/** Sync server timers; only the backend sends auto-off commands. */
export function useTimerRunner() {
  const token = useAuthStore((state) => state.accessToken);
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    useTimerStore.setState({ timers: [] });
    if (!token) return;
    const sync = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const { data } = await api.get('/devices/timers/active');
        if (!cancelled) useTimerStore.setState({ timers: data.map(parseTimer) });
      } catch {
        /* Keep the last confirmed state during temporary network failures. */
      } finally {
        inFlight = false;
      }
    };
    void sync();
    const interval = setInterval(sync, 10_000);
    window.addEventListener('focus', sync);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', sync);
    };
  }, [token]);
}
