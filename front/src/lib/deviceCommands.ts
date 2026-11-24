import type { QueryClient } from '@tanstack/react-query';

import { localizeApiMessage } from './greek';

export interface DeviceCommand {
  code: string;
  value: unknown;
}

export interface DeviceStateReport {
  deviceId: string;
  status: DeviceCommand[];
  statusUpdatedAt: number;
  reportVersion: number;
  online?: boolean;
}

const reportVersions = new WeakMap<QueryClient, Map<string, number>>();

/** Apply actual provider reports to every view without triggering a read per session. */
export async function applyDeviceReport(client: QueryClient, report: DeviceStateReport) {
  if (
    !report ||
    typeof report.deviceId !== 'string' ||
    !Array.isArray(report.status) ||
    !Number.isFinite(report.reportVersion)
  )
    return;
  const deviceId = report.deviceId;
  const keys = [['device', deviceId], ['device-status', deviceId], ['devices'], ['rooms']];
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey }, { revert: false })));
  let versions = reportVersions.get(client);
  if (!versions) reportVersions.set(client, (versions = new Map()));
  const knownDevices: any[] = [
    client.getQueryData(['device', deviceId]),
    ...((client.getQueryData(['devices']) as any[]) ?? []),
    ...((client.getQueryData(['rooms']) as any[]) ?? []).flatMap((room) => room.devices ?? []),
  ];
  const knownVersion = Math.max(
    versions.get(deviceId) ?? 0,
    ...knownDevices
      .filter((device) => device?.id === deviceId)
      .map((device) => device.reportVersion ?? 0),
  );
  if (knownVersion > report.reportVersion) return;
  versions.set(deviceId, report.reportVersion);
  const update = (device: any) => {
    if (!device || device.id !== deviceId || (device.reportVersion ?? 0) > report.reportVersion)
      return device;
    const status = new Map<string, DeviceCommand>(
      (device.status ?? []).map((entry: DeviceCommand) => [entry.code, entry]),
    );
    for (const entry of report.status) status.set(entry.code, entry);
    return {
      ...device,
      status: [...status.values()],
      statusUpdatedAt: report.statusUpdatedAt,
      reportVersion: report.reportVersion,
      ...(report.online !== undefined ? { online: report.online } : {}),
    };
  };
  client.setQueryData(['device', deviceId], update);
  client.setQueryData(['devices'], (devices: any) =>
    Array.isArray(devices) ? devices.map(update) : devices,
  );
  client.setQueryData(['rooms'], (rooms: any) =>
    Array.isArray(rooms)
      ? rooms.map((room) => ({ ...room, devices: room.devices.map(update) }))
      : rooms,
  );
  client.setQueryData(['device-status', deviceId], (status: DeviceCommand[] | undefined) => {
    if (!status) return status;
    const merged = new Map(status.map((entry) => [entry.code, entry]));
    for (const entry of report.status) merged.set(entry.code, entry);
    return [...merged.values()];
  });
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
