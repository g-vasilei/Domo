import { create } from 'zustand';

import { api } from '../lib/api';
import { DEFAULT_WEATHER_CITY } from '../lib/greekCities';
import { useAuthStore } from './auth.store';

export interface Preferences {
  weatherCityId: string;
  tempUnit: 'C' | 'F';
  notificationsEnabled: boolean;
}
const defaults: Preferences = {
  weatherCityId: DEFAULT_WEATHER_CITY,
  tempUnit: 'C',
  notificationsEnabled: false,
};
interface PrefsStore extends Preferences {
  saving: boolean;
  saveError: string;
  setWeatherCityId: (id: string) => void;
  setTempUnit: (unit: 'C' | 'F') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

async function savePreferences(patch: Partial<Preferences>) {
  if (usePrefsStore.getState().saving) return;
  const token = useAuthStore.getState().accessToken;
  usePrefsStore.setState({ saving: true, saveError: '' });
  try {
    const { data } = await api.patch<Preferences>('/users/me/preferences', patch);
    if (useAuthStore.getState().accessToken === token) usePrefsStore.setState(data);
  } catch {
    if (useAuthStore.getState().accessToken === token)
      usePrefsStore.setState({ saveError: 'Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.' });
  } finally {
    if (useAuthStore.getState().accessToken === token) usePrefsStore.setState({ saving: false });
  }
}

export const usePrefsStore = create<PrefsStore>(() => ({
  ...defaults,
  saving: false,
  saveError: '',
  setWeatherCityId: (weatherCityId) => {
    void savePreferences({ weatherCityId });
  },
  setTempUnit: (tempUnit) => {
    void savePreferences({ tempUnit });
  },
  setNotificationsEnabled: (notificationsEnabled) => {
    void savePreferences({ notificationsEnabled });
  },
}));

useAuthStore.subscribe((state, previous) => {
  if (state.accessToken !== previous.accessToken)
    usePrefsStore.setState({ ...defaults, saving: false, saveError: '' });
});

export function convertTemp(value: number, unit: 'C' | 'F'): string {
  // Tuya encodes as tenths → divide by 10 if > 100
  const celsius = value > 100 ? value / 10 : value;
  if (unit === 'F') return ((celsius * 9) / 5 + 32).toFixed(1);
  return celsius % 1 === 0 ? String(celsius) : celsius.toFixed(1);
}
