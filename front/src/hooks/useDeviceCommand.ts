import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { api } from '../lib/api';
import {
  applyDeviceReport,
  commandError,
  DeviceCommand,
  refreshDeviceCaches,
} from '../lib/deviceCommands';

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
        { timeout: 30_000 },
      );
      if (data === false)
        throw Object.assign(new Error('Device rejected command'), {
          response: { data: { message: 'Device rejected command' } },
        });
      if (data?.report) await applyDeviceReport(client, data.report);
      if (data?.confirmed === false) {
        throw Object.assign(new Error('Device state not confirmed'), {
          response: {
            data: {
              message:
                'Η εντολή στάλθηκε, αλλά η συσκευή δεν επιβεβαίωσε ακόμη την αλλαγή. Εμφανίζεται η τελευταία αναφερθείσα κατάσταση.',
            },
          },
        });
      }
      return data;
    },
    retry: false,
    onSettled: async (data, error, { deviceId: targetId }) => {
      try {
        // Compatibility with an older server during deployment; confirmed reports
        // already updated all views and need no extra house-wide cloud read.
        if (data === true || (error && !(error as any)?.response))
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
              ? {
                  kind: 'success' as const,
                  message:
                    mutation.data?.confirmed === true
                      ? 'Η κατάσταση επιβεβαιώθηκε.'
                      : 'Η εντολή στάλθηκε.',
                }
              : null,
  };
}
