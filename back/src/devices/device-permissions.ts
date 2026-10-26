import { ForbiddenException } from '@nestjs/common';

export interface DeviceAccessUser {
  role: string;
  createdById?: string | null;
  permissions?: {
    canViewDevices: boolean;
    canControlDevices: boolean;
    canCreateSchedules: boolean;
    allowedDeviceIds: string[];
  } | null;
}
export type DeviceAction = 'view' | 'control' | 'schedule';

export function assertCanViewDevices(
  user: DeviceAccessUser | null,
): asserts user is DeviceAccessUser {
  if (user?.role === 'OWNER') return;
  if (user?.role !== 'MEMBER' || !user.createdById || !user.permissions?.canViewDevices) {
    throw new ForbiddenException('No permission for this device action');
  }
}

export function canAccessDevice(user: DeviceAccessUser, deviceId: string, action: DeviceAction) {
  if (user.role === 'OWNER') return true;
  const permissions = user.permissions;
  return (
    user.role === 'MEMBER' &&
    !!user.createdById &&
    !!permissions?.canViewDevices &&
    (!permissions.allowedDeviceIds.length || permissions.allowedDeviceIds.includes(deviceId)) &&
    (action === 'view' || permissions.canControlDevices) &&
    (action !== 'schedule' || permissions.canCreateSchedules)
  );
}
