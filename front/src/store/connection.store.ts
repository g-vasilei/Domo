import { create } from 'zustand';

export type ConnectionStatus = 'connecting' | 'syncing' | 'connected' | 'stale';
export const useConnectionStore = create<{ status: ConnectionStatus }>(() => ({
  status: 'connecting',
}));
