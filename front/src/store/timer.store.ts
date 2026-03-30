import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { api } from '../lib/api';

export interface DeviceTimer {
  id: string;
  deviceId: string;
  deviceName: string;
  switchCode: string;
  endsAt: number; // unix ms
}

interface TimerStore {
  timers: DeviceTimer[];
  start: (deviceId: string, deviceName: string, switchCode: string, minutes: number) => void;
  cancel: (deviceId: string) => void;
  remove: (id: string) => void;
}

export const useTimerStore = create<TimerStore>()(
  persist(
    (set, get) => ({
      timers: [],
      start: (deviceId, deviceName, switchCode, minutes) => {
        const rest = get().timers.filter((t) => t.deviceId !== deviceId);
        set({
          timers: [
            ...rest,
            {
              id: crypto.randomUUID(),
              deviceId,
              deviceName,
              switchCode,
              endsAt: Date.now() + minutes * 60_000,
            },
          ],
        });
        // Persist to backend so the timer fires even when the app is closed
        api.post('/devices/timers', { deviceId, deviceName, switchCode, minutes }).catch(() => {});
      },
      cancel: (deviceId) => {
        set((s) => ({ timers: s.timers.filter((t) => t.deviceId !== deviceId) }));
        api.delete(`/devices/timers/${deviceId}`).catch(() => {});
      },
      remove: (id) => set((s) => ({ timers: s.timers.filter((t) => t.id !== id) })),
    }),
    { name: 'domo-device-timers' },
  ),
);
