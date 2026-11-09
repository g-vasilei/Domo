import { create } from 'zustand';

import { api } from '../lib/api';
import { AlarmState } from './alarm.store';
import { useAuthStore } from './auth.store';

export type NotifKind = 'alarm' | 'device' | 'battery' | 'automation';
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
const normalize = (items: AppNotification[]) =>
  items
    .map((item) => ({ ...item, at: new Date(item.at) }))
    .sort((a, b) => b.at.getTime() - a.at.getTime() || b.id.localeCompare(a.id))
    .slice(0, 50);
const values = (items: AppNotification[]) => ({
  items,
  unread: items.filter((n) => !n.read).length,
});
let revision = 0;
let writes: Promise<unknown> = Promise.resolve();
interface NotificationsStore {
  items: AppNotification[];
  unread: number;
  error: string;
  push: (n: AppNotification) => void;
  load: () => Promise<void>;
  markAllRead: () => void;
  clear: () => void;
  reset: () => void;
}
export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  items: [],
  unread: 0,
  error: '',
  push: (n) => {
    revision++;
    set(values(normalize([n, ...get().items.filter((item) => item.id !== n.id)])));
  },
  load: async () => {
    const token = useAuthStore.getState().accessToken;
    const current = revision;
    try {
      await writes;
      const { data } = await api.get<AppNotification[]>('/notifications');
      if (useAuthStore.getState().accessToken !== token) return;
      // Retry a snapshot if a concurrent event/read/delete changed local state.
      if (current !== revision) {
        void get().load();
        return;
      }
      set({ ...values(normalize(data)), error: '' });
    } catch {
      if (useAuthStore.getState().accessToken === token)
        set({ error: 'Δεν φορτώθηκαν οι ειδοποιήσεις.' });
    }
  },
  markAllRead: () => {
    const ids = get()
      .items.filter((n) => !n.read)
      .map((n) => n.id);
    if (!ids.length) return;
    const token = useAuthStore.getState().accessToken;
    revision++;
    set(values(get().items.map((n) => ({ ...n, read: true }))));
    writes = writes
      .catch(() => {})
      .then(() =>
        useAuthStore.getState().accessToken === token
          ? api.patch('/notifications/read', { ids })
          : undefined,
      )
      .catch(() => {
        set({ error: 'Δεν αποθηκεύτηκε η ανάγνωση των ειδοποιήσεων.' });
      });
  },
  clear: () => {
    const token = useAuthStore.getState().accessToken;
    const ids = get().items.map((n) => n.id);
    revision++;
    set(values([]));
    writes = writes
      .catch(() => {})
      .then(() =>
        useAuthStore.getState().accessToken === token
          ? api.delete('/notifications', { data: { ids } })
          : undefined,
      )
      .catch(() => {
        set({ error: 'Δεν διαγράφηκαν οι ειδοποιήσεις από τον server.' });
      });
  },
  reset: () => {
    revision++;
    set({ ...values([]), error: '' });
  },
}));
function account(token: string | null) {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1])).sub;
  } catch {
    return token;
  }
}
useAuthStore.subscribe((state, previous) => {
  if (account(state.accessToken) !== account(previous.accessToken))
    useNotificationsStore.getState().reset();
});
