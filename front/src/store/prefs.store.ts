import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrefsStore {
  tempUnit: 'C' | 'F';
  notificationsEnabled: boolean;
  setTempUnit: (u: 'C' | 'F') => void;
  setNotificationsEnabled: (v: boolean) => void;
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set) => ({
      tempUnit: 'C',
      notificationsEnabled: false,
      setTempUnit: (tempUnit) => set({ tempUnit }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
    }),
    { name: 'smarthome-prefs' },
  ),
);

export function convertTemp(value: number, unit: 'C' | 'F'): string {
  // Tuya encodes as tenths → divide by 10 if > 100
  const celsius = value > 100 ? value / 10 : value;
  if (unit === 'F') return ((celsius * 9) / 5 + 32).toFixed(1);
  return celsius % 1 === 0 ? String(celsius) : celsius.toFixed(1);
}
