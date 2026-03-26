import { create } from 'zustand';

export type AlarmState =
  | 'DISARMED'
  | 'ARMED_HOME'
  | 'ARMED_AWAY'
  | 'EXIT_DELAY'
  | 'ENTRY_DELAY'
  | 'TRIGGERED';

export interface AlarmSettings {
  state: AlarmState;
  stateAt: string;
  exitDelaySecs: number;
  entryDelaySecs: number;
  pinHash: string | null;
  displayMode: boolean;
  showClock: boolean;
  showTemp: boolean;
  showHumidity: boolean;
  tempDeviceId: string | null;
  humidDeviceId: string | null;
}

interface AlarmStore {
  settings: AlarmSettings | null;
  setSettings: (s: AlarmSettings) => void;
  patchState: (state: AlarmState, stateAt: string) => void;
}

const DEFAULTS: AlarmSettings = {
  state: 'DISARMED',
  stateAt: new Date().toISOString(),
  exitDelaySecs: 30,
  entryDelaySecs: 30,
  pinHash: null,
  displayMode: false,
  showClock: true,
  showTemp: true,
  showHumidity: true,
  tempDeviceId: null,
  humidDeviceId: null,
};

export const useAlarmStore = create<AlarmStore>((set) => ({
  settings: null,
  setSettings: (settings) => set({ settings: { ...DEFAULTS, ...settings } }),
  patchState: (state, stateAt) =>
    set((s) =>
      s.settings ? { settings: { ...s.settings, state, stateAt } } : s,
    ),
}));

/** Returns seconds remaining in an exit/entry delay, or 0 if expired */
export function secondsLeft(settings: AlarmSettings): number {
  const total =
    settings.state === 'EXIT_DELAY'
      ? settings.exitDelaySecs
      : settings.state === 'ENTRY_DELAY'
      ? settings.entryDelaySecs
      : 0;
  if (total === 0) return 0;
  const elapsed = (Date.now() - new Date(settings.stateAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(total - elapsed));
}
