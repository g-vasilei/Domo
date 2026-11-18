import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { api } from '../lib/api';
import { commandError, DeviceCommand, refreshDeviceCaches } from '../lib/deviceCommands';

export function useDeviceCommand(deviceId: string) {
  const client = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationKey: ['device-command', deviceId],
    mutationFn: async ({
      deviceId: targetId,
      commands,
    }: {
      deviceId: string;
      commands: DeviceCommand[];
    }) => {
      const { data } = await api.post(
        `/devices/${targetId}/commands`,
        { commands },
        { timeout: 15_000 },
      );
      if (data === false)
        throw Object.assign(new Error('Device rejected command'), {
          response: { data: { message: 'Device rejected command' } },
        });
      return data;
    },
    retry: false,
    onSettled: async (_data, _error, { deviceId: targetId }) => {
      try {
        // Also reconcile ambiguous failures: the device may have received the command.
        await refreshDeviceCaches(client, targetId);
      } finally {
        inFlight.current = false;
        void client.invalidateQueries({ queryKey: ['activity'] });
      }
    },
  });
  return {
    sendCommand: (commands: DeviceCommand[]) => {
      if (inFlight.current) return;
      inFlight.current = true;
      mutation.mutate({ deviceId, commands });
    },
    isPending: mutation.isPending,
    feedback:
      mutation.variables?.deviceId !== deviceId
        ? null
        : mutation.isPending
          ? { kind: 'pending' as const, message: 'Αποστολή εντολής…' }
          : mutation.isError
            ? { kind: 'error' as const, message: commandError(mutation.error) }
            : mutation.isSuccess
              ? { kind: 'success' as const, message: 'Η εντολή στάλθηκε.' }
              : null,
  };
}
