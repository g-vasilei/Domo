import type { QueryClient } from '@tanstack/react-query';

import { localizeApiMessage } from './greek';

export interface DeviceCommand {
  code: string;
  value: unknown;
}

export async function refreshDeviceCaches(client: QueryClient, deviceId: string) {
  // An accepted command is not a device report. Re-read instead of displaying its payload.
  await Promise.all(
    [['device', deviceId], ['device-status', deviceId], ['devices'], ['rooms']].map((queryKey) =>
      client.invalidateQueries({ queryKey }),
    ),
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
