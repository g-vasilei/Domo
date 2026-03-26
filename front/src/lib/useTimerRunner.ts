import { useEffect } from 'react';

import { api } from './api';
import { useTimerStore } from '../store/timer.store';

/**
 * Mounted once at the app level. Every second it checks for expired timers
 * and fires a turn-off command, then removes the timer from the store.
 */
export function useTimerRunner() {
  useEffect(() => {
    const interval = setInterval(() => {
      const { timers, remove } = useTimerStore.getState();
      const now = Date.now();
      timers.forEach((timer) => {
        if (timer.endsAt <= now) {
          remove(timer.id);
          api
            .post(`/devices/${timer.deviceId}/commands`, {
              commands: [{ code: timer.switchCode, value: false }],
            })
            .catch(() => {});
        }
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);
}
