import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

import { AlarmState, useAlarmStore } from '../store/alarm.store';
import { useAuthStore } from '../store/auth.store';
import { useNotificationsStore } from '../store/notifications.store';
import { usePrefsStore } from '../store/prefs.store';

let socket: Socket | null = null;

const ALARM_EVENTS: Partial<Record<AlarmState, { title: string; body: string }>> = {
  TRIGGERED: { title: '⚠️ Alarm Triggered!', body: 'Your alarm has been triggered.' },
  ARMED_HOME: { title: '🔒 Armed — Home', body: 'System armed in home mode.' },
  ARMED_AWAY: { title: '🔒 Armed — Away', body: 'System armed in away mode.' },
  DISARMED: { title: '🔓 Disarmed', body: 'Alarm system has been disarmed.' },
  ENTRY_DELAY: { title: '⏱ Entry Delay', body: 'Disarm now to prevent the alarm.' },
};

function fireBrowserNotif(title: string, body: string) {
  const { notificationsEnabled } = usePrefsStore.getState();
  if (notificationsEnabled && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

export function useDeviceSocket() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const patchAlarmState = useAlarmStore((s) => s.patchState);

  useEffect(() => {
    if (!accessToken) return;

    socket = io(window.location.origin, {
      path: '/socket.io',
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    socket.on(
      'device:update',
      ({
        deviceId,
        commands,
      }: {
        deviceId: string;
        commands: { code: string; value: unknown }[];
      }) => {
        const applyCommands = (status: any[]) =>
          status.map((s: any) => {
            const cmd = commands.find((c) => c.code === s.code);
            return cmd ? { ...s, value: cmd.value } : s;
          });

        queryClient.setQueryData(['device', deviceId], (old: any) => {
          if (!old) return old;
          return { ...old, status: applyCommands(old.status) };
        });
        queryClient.setQueryData(['rooms'], (old: any[]) =>
          old?.map((room) => ({
            ...room,
            devices: room.devices.map((d: any) =>
              d.id !== deviceId ? d : { ...d, status: applyCommands(d.status) },
            ),
          })),
        );
      },
    );

    socket.on('alarm:state', ({ state, stateAt }: { state: AlarmState; stateAt: string }) => {
      patchAlarmState(state, stateAt);

      const event = ALARM_EVENTS[state];
      if (!event) return;

      useNotificationsStore.getState().push({ kind: 'alarm', ...event, state });
      fireBrowserNotif(event.title, event.body);
    });

    socket.on(
      'device:alert',
      (payload: {
        type: 'state_change' | 'battery_low';
        deviceId: string;
        deviceName: string;
        commands?: { code: string; value: unknown }[];
        batteryLevel?: number;
      }) => {
        if (payload.type === 'battery_low') {
          const title = `🔋 Low Battery — ${payload.deviceName}`;
          const body = `Battery is at ${payload.batteryLevel}%. Please replace soon.`;
          useNotificationsStore
            .getState()
            .push({ kind: 'battery', title, body, deviceId: payload.deviceId });
          fireBrowserNotif(title, body);
        } else if (payload.type === 'state_change') {
          const changes = (payload.commands ?? []).map((c) => `${c.code}: ${c.value}`).join(', ');
          const title = `📡 ${payload.deviceName} changed`;
          const body = changes || 'Device state updated';
          useNotificationsStore
            .getState()
            .push({ kind: 'device', title, body, deviceId: payload.deviceId });
          fireBrowserNotif(title, body);
        }
      },
    );

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [accessToken, queryClient, patchAlarmState]);
}
