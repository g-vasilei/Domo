import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () =>
        set((s) => {
          const next = !s.dark;
          document.documentElement.classList.toggle('dark', next);
          return { dark: next };
        }),
    }),
    {
      name: 'theme',
      onRehydrateStorage: () => (state) => {
        if (state) document.documentElement.classList.toggle('dark', state.dark);
      },
    },
  ),
);
