export interface HealthDevice {
  id: string;
  name: string;
  online?: boolean;
  status?: { code: string; value: unknown }[];
}

export interface DeviceViewer {
  role: string;
  permissions?: { canViewDevices: boolean; allowedDeviceIds: string[] } | null;
}

// Match the battery codes and threshold used by backend notifications.
const BATTERY_CODES = ['battery_percentage', 'battery_value', 'residual_electricity'];

export function lowBattery(status: HealthDevice['status']): number | 'low' | null {
  for (const code of BATTERY_CODES) {
    const entry = status?.find((item) => item.code === code);
    if (typeof entry?.value !== 'number' || !Number.isFinite(entry.value)) continue;
    const percentage = entry.value > 100 ? entry.value / 10 : entry.value;
    if (percentage < 0 || percentage > 100) continue;
    return percentage < 20 ? percentage : null;
  }
  return status?.some((item) => item.code === 'battery_state' && item.value === 'low')
    ? 'low'
    : null;
}

export function deviceHealth(devices: HealthDevice[], viewer?: DeviceViewer) {
  const visible = !viewer
    ? []
    : viewer.role === 'OWNER'
      ? devices
      : devices.filter((device) => {
          const permissions = viewer.permissions;
          return (
            permissions?.canViewDevices &&
            (!permissions.allowedDeviceIds.length ||
              permissions.allowedDeviceIds.includes(device.id))
          );
        });
  return {
    offline: visible.filter((device) => device.online === false),
    lowBattery: visible.flatMap((device) => {
      const battery = lowBattery(device.status);
      return battery === null ? [] : [{ device, battery }];
    }),
  };
}
