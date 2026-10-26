import { useQuery } from '@tanstack/react-query';

import { api } from '../lib/api';

export function useDevicePermissions(deviceId: string) {
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((response) => response.data),
    staleTime: 60_000,
  });
  const permissions = me?.permissions;
  const canView =
    me?.role === 'OWNER' ||
    (me?.role === 'MEMBER' &&
      permissions?.canViewDevices &&
      (!permissions.allowedDeviceIds.length || permissions.allowedDeviceIds.includes(deviceId)));
  return {
    canControl: !!canView && (me?.role === 'OWNER' || !!permissions?.canControlDevices),
  };
}
