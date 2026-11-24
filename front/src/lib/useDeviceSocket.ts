import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

import { AlarmState, useAlarmStore } from '../store/alarm.store';
import { useAuthStore } from '../store/auth.store';
import { useConnectionStore } from '../store/connection.store';
import { useNotificationsStore } from '../store/notifications.store';
import { api } from './api';
import { applyDeviceReport, DeviceStateReport, refreshDeviceCaches } from './deviceCommands';

export function useDeviceSocket() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const patchAlarmState = useAlarmStore((s) => s.patchState);

  useEffect(() => {
    if (!accessToken) return;

    const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

    let cancelled = false;
    let generation = 0;
    useConnectionStore.setState({ status: 'connecting' });
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    const synchronize = () => {
      if (!socket.connected) return;
      void useNotificationsStore.getState().load();
      const current = ++generation;
      useConnectionStore.setState({ status: 'syncing' });
      void (async () => {
        try {
          await queryClient.invalidateQueries({}, { throwOnError: true });
          const { data } = await api.get('/alarm');
          if (cancelled || current !== generation || !socket.connected) return;
          useAlarmStore.getState().setSettings(data);
          useConnectionStore.setState({ status: 'connected' });
        } catch {
          if (!cancelled && current === generation) {
            useConnectionStore.setState({ status: 'stale' });
          }
        }
      })();
    };
    const loadNotifications = () => {
      void useNotificationsStore.getState().load();
    };
    socket.on('connect', synchronize);
    window.addEventListener('focus', loadNotifications);
    window.addEventListener('online', synchronize);
    window.addEventListener('focus', synchronize);
    const markStale = () => {
      generation++;
      useConnectionStore.setState({ status: 'stale' });
    };
    socket.on('disconnect', markStale);
    socket.on('connect_error', markStale);

    socket.on('device:update', ({ deviceId }: { deviceId: string }) => {
      void refreshDeviceCaches(queryClient, deviceId);
    });

    socket.on('device:reported', (report: DeviceStateReport) => {
      void applyDeviceReport(queryClient, report);
    });

    socket.on('alarm:state', ({ state, stateAt }: { state: AlarmState; stateAt: string }) => {
      patchAlarmState(state, stateAt);
    });
    socket.on('notification:new', (item) => {
      useNotificationsStore.getState().push(item);
    });

    return () => {
      cancelled = true;
      generation++;
      window.removeEventListener('online', synchronize);
      window.removeEventListener('focus', loadNotifications);
      window.removeEventListener('focus', synchronize);
      socket.removeAllListeners();
      socket.disconnect();
      useConnectionStore.setState({ status: 'connecting' });
    };
  }, [accessToken, queryClient, patchAlarmState]);
}
