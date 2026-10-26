import type { QueryClient } from '@tanstack/react-query';

import { localizeApiMessage } from './greek';

export interface DeviceCommand {
  code: string;
  value: unknown;
}

export function patchDevice(device: any, commands: DeviceCommand[]) {
  if (!device) return device;
  return {
    ...device,
    status: [
      ...(device.status ?? []).filter(
        (entry: DeviceCommand) => !commands.some((command) => command.code === entry.code),
      ),
      ...commands,
    ],
  };
}

export function updateDeviceCaches(
  client: QueryClient,
  deviceId: string,
  commands: DeviceCommand[],
) {
  client.setQueryData(['device', deviceId], (device: any) => patchDevice(device, commands));
  client.setQueryData(['devices'], (devices: any[] | undefined) =>
    devices?.map((device) => (device.id === deviceId ? patchDevice(device, commands) : device)),
  );
  client.setQueryData(['rooms'], (rooms: any[] | undefined) =>
    rooms?.map((room) => ({
      ...room,
      devices: room.devices.map((device: any) =>
        device.id === deviceId ? patchDevice(device, commands) : device,
      ),
    })),
  );
}

export function commandError(error: any): string {
  const status = error?.response?.status;
  if (status === 403) return 'Δεν έχετε δικαίωμα χειρισμού αυτής της συσκευής.';
  if (!error?.response)
    return 'Δεν επιβεβαιώθηκε η αποστολή. Ελέγξτε τη σύνδεση και την κατάσταση της συσκευής πριν δοκιμάσετε ξανά.';
  const detail = localizeApiMessage(error.response.data?.message);
  if (Array.isArray(detail)) return detail.join('. ');
  return typeof detail === 'string' ? detail : 'Η εντολή απέτυχε. Δοκιμάστε ξανά.';
}
