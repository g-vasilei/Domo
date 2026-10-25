import { create } from 'zustand';

import { api } from '../lib/api';

export interface DeviceTimer {
  id: string;
  deviceId: string;
  deviceName: string;
  switchCode: string;
  endsAt: number;
}

export function parseTimer(timer: Omit<DeviceTimer, 'endsAt'> & { endsAt: string }): DeviceTimer {
  return { ...timer, endsAt: new Date(timer.endsAt).getTime() };
}

interface TimerStore {
  timers: DeviceTimer[];
  start: (
    deviceId: string,
    deviceName: string,
    switchCode: string,
    minutes: number,
  ) => Promise<void>;
  cancel: (deviceId: string) => Promise<void>;
}

// Timers are authoritative on the server, shared across browsers and account members.
export const useTimerStore = create<TimerStore>()((set) => ({
  timers: [],
  start: async (deviceId, deviceName, switchCode, minutes) => {
    const { data } = await api.post('/devices/timers', {
      deviceId,
      deviceName,
      switchCode,
      minutes,
    });
    set((state) => ({
      timers: [...state.timers.filter((t) => t.deviceId !== deviceId), parseTimer(data)],
    }));
  },
  cancel: async (deviceId) => {
    await api.delete(`/devices/timers/${deviceId}`);
    set((state) => ({ timers: state.timers.filter((t) => t.deviceId !== deviceId) }));
  },
}));
