import { create } from 'zustand';

import { api } from '../lib/api';
import { DEFAULT_WEATHER_CITY } from '../lib/greekCities';
import { useAuthStore } from './auth.store';

export interface Preferences {
  dashboardHiddenCards: string[];
  dashboardHiddenSections: string[];
  dashboardTemperatureDeviceIds: string[];
  dashboardCardOrder: string[];
  dashboardSectionOrder: string[];
  weatherCityId: string;
  tempUnit: 'C' | 'F';
  notificationsEnabled: boolean;
}
const defaults: Preferences = {
  dashboardHiddenCards: [],
  dashboardHiddenSections: [],
  dashboardTemperatureDeviceIds: [],
  dashboardCardOrder: ['alarm', 'weather', 'temperature'],
  dashboardSectionOrder: ['overview', 'devices', 'stats', 'health'],
  weatherCityId: DEFAULT_WEATHER_CITY,
  tempUnit: 'C',
  notificationsEnabled: false,
};
interface PrefsStore extends Preferences {
  setDashboardHiddenCards: (ids: string[]) => void;
  setDashboardHiddenSections: (ids: string[]) => void;
  setDashboardTemperatureDeviceIds: (ids: string[]) => Promise<boolean>;
  setDashboardCardOrder: (order: string[]) => void;
  setDashboardSectionOrder: (order: string[]) => void;
  saving: boolean;
  saveError: string;
  setWeatherCityId: (id: string) => void;
  setTempUnit: (unit: 'C' | 'F') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

async function savePreferences(patch: Partial<Preferences>, optimistic = false) {
  if (usePrefsStore.getState().saving) return false;
  const token = useAuthStore.getState().accessToken;
  const previous = Object.fromEntries(
    Object.keys(patch).map((key) => [key, usePrefsStore.getState()[key as keyof Preferences]]),
  );
  usePrefsStore.setState({ ...(optimistic ? patch : {}), saving: true, saveError: '' });
  try {
    const { data } = await api.patch<Preferences>('/users/me/preferences', patch);
    if (useAuthStore.getState().accessToken !== token) return false;
    usePrefsStore.setState(data);
    return true;
  } catch {
    if (useAuthStore.getState().accessToken === token)
      usePrefsStore.setState({
        ...(optimistic ? previous : {}),
        saveError: 'Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.',
      });
    return false;
  } finally {
    if (useAuthStore.getState().accessToken === token) usePrefsStore.setState({ saving: false });
  }
}

export const usePrefsStore = create<PrefsStore>(() => ({
  ...defaults,
  setDashboardHiddenCards: (dashboardHiddenCards) => {
    void savePreferences({ dashboardHiddenCards }, true);
  },
  setDashboardHiddenSections: (dashboardHiddenSections) => {
    void savePreferences({ dashboardHiddenSections }, true);
  },
  setDashboardTemperatureDeviceIds: (dashboardTemperatureDeviceIds) =>
    savePreferences({ dashboardTemperatureDeviceIds }, true),
  setDashboardCardOrder: (dashboardCardOrder) => {
    void savePreferences({ dashboardCardOrder }, true);
  },
  setDashboardSectionOrder: (dashboardSectionOrder) => {
    void savePreferences({ dashboardSectionOrder }, true);
  },
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
