import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api } from '../lib/api';

/** User-requested refresh bypasses the shared server cache, with server-side burst protection. */
export function useDeviceRefresh(queryKey: string[], path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ['device-refresh', ...queryKey],
    onMutate: () => client.cancelQueries({ queryKey }),
    mutationFn: () =>
      api.get(path, { params: { refresh: true }, timeout: 20_000 }).then((r) => r.data),
    onSuccess: (data) => {
      client.setQueryData(queryKey, data);
    },
    retry: false,
  });
}
