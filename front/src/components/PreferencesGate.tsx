import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { Preferences, usePrefsStore } from '../store/prefs.store';

export default function PreferencesGate({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.accessToken);
  const [appliedToken, setAppliedToken] = useState<string | null>(null);
  const { data, isError, refetch } = useQuery({
    queryKey: ['preferences', token],
    queryFn: ({ signal }) =>
      api.get<Preferences>('/users/me/preferences', { signal }).then((r) => r.data),
    enabled: !!token,
    staleTime: 0,
    gcTime: 0,
  });
  useEffect(() => {
    if (data) {
      usePrefsStore.setState(data);
      setAppliedToken(token);
    }
  }, [data, token]);
  if (isError)
    return (
      <div role="alert" className="p-6 text-sm text-slate-500">
        Δεν ήταν δυνατή η φόρτωση των προτιμήσεων.{' '}
        <button
          className="text-brand underline"
          onClick={() => {
            void refetch();
          }}
        >
          Δοκιμή ξανά
        </button>
      </div>
    );
  if (!data || appliedToken !== token)
    return <div className="p-6 text-sm text-slate-400">Φόρτωση προτιμήσεων…</div>;
  return <>{children}</>;
}
