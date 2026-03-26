import { create } from 'zustand';

import { AlarmState } from './alarm.store';

export type NotifKind = 'alarm' | 'device' | 'battery';

export interface AppNotification {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  state?: AlarmState;
  deviceId?: string;
  at: Date;
  read: boolean;
}

interface NotificationsStore {
  items: AppNotification[];
  unread: number;
  push: (n: Omit<AppNotification, 'id' | 'at' | 'read'>) => void;
  markAllRead: () => void;
  clear: () => void;
}

export const useNotificationsStore = create<NotificationsStore>((set) => ({
  items: [],
  unread: 0,
  push: (n) =>
    set((s) => {
      const item: AppNotification = { ...n, id: crypto.randomUUID(), at: new Date(), read: false };
      return { items: [item, ...s.items].slice(0, 50), unread: s.unread + 1 };
    }),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })), unread: 0 })),
  clear: () => set({ items: [], unread: 0 }),
}));
