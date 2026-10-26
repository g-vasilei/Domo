import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { api } from '../lib/api';

interface Activity {
  id: string;
  level: string;
  message: string;
  context: string;
  createdAt: string;
  user: { email: string } | null;
  metadata: { ruleName?: string; deviceId?: string; action?: string; state?: string } | null;
}
const contexts: Record<string, string> = {
  device: 'Συσκευές',
  alarm: 'Συναγερμός',
  automation: 'Αυτοματισμοί',
};
const actions: Record<string, string> = {
  arm_home: 'Αίτημα όπλισης — Εντός',
  arm_away: 'Αίτημα όπλισης — Εκτός',
  disarm: 'Αίτημα αφοπλισμού',
};

const states: Record<string, string> = {
  DISARMED: 'Αφοπλισμένος',
  ARMED_HOME: 'Οπλισμένος — Εντός',
  ARMED_AWAY: 'Οπλισμένος — Εκτός',
  EXIT_DELAY: 'Καθυστέρηση εξόδου',
  ENTRY_DELAY: 'Καθυστέρηση εισόδου',
  TRIGGERED: 'Ενεργοποίηση συναγερμού',
};

export default function ActivityPage() {
  const [context, setContext] = useState('');
  const [params] = useSearchParams();
  const initialLevel = params.get('level') ?? '';
  const [level, setLevel] = useState(
    ['info', 'warn', 'error'].includes(initialLevel) ? initialLevel : '',
  );
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, isFetching, refetch } = useQuery<{
    items: Activity[];
    page: number;
    hasMore: boolean;
  }>({
    queryKey: ['activity', context, level, page],
    queryFn: () =>
      api
        .get('/users/activity', {
          params: { context: context || undefined, level: level || undefined, page },
        })
        .then((response) => response.data),
    refetchInterval: page === 1 ? 30_000 : false,
  });
  const fieldClass =
    'rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A222C] px-3 py-2 text-sm text-slate-700 dark:text-slate-200';
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            Ιστορικό ενεργειών
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Εντολές συσκευών, συμβάντα συναγερμού και εκτελέσεις αυτοματισμών.
          </p>
        </div>
        <button onClick={() => void refetch()} disabled={isFetching} className={fieldClass}>
          <RefreshCw size={14} className={`inline mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Ανανέωση
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm text-slate-500 flex items-center gap-2">
          Κατηγορία
          <select
            value={context}
            onChange={(event) => {
              setContext(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
          >
            <option value="">Όλες</option>
            {Object.entries(contexts).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-500 flex items-center gap-2">
          Επίπεδο
          <select
            value={level}
            onChange={(event) => {
              setLevel(event.target.value);
              setPage(1);
            }}
            className={fieldClass}
          >
            <option value="">Όλα</option>
            <option value="info">Ενημέρωση</option>
            <option value="warn">Προειδοποίηση</option>
            <option value="error">Αποτυχία</option>
          </select>
        </label>
      </div>
      <div aria-live="polite">
        {isLoading ? (
          <p className="text-slate-500 py-12 text-center">Φόρτωση ιστορικού…</p>
        ) : isError ? (
          <div role="alert" className="text-red-500 py-8">
            Δεν ήταν δυνατή η φόρτωση. Δοκιμάστε ξανά με την Ανανέωση.
          </div>
        ) : !data?.items.length ? (
          <p className="text-slate-500 py-12 text-center">
            Δεν βρέθηκαν συμβάντα με αυτά τα φίλτρα.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 p-4 space-y-2"
              >
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {contexts[item.context] ?? item.context} ·{' '}
                    <span
                      className={
                        item.level === 'error'
                          ? 'text-red-500'
                          : item.level === 'warn'
                            ? 'text-amber-600'
                            : ''
                      }
                    >
                      {item.level === 'error'
                        ? 'Αποτυχία'
                        : item.level === 'warn'
                          ? 'Προειδοποίηση'
                          : 'Ενημέρωση'}
                    </span>
                  </span>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString('el-GR')}
                  </time>
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-100 break-words">
                  {item.metadata?.state && states[item.metadata.state]
                    ? states[item.metadata.state]
                    : item.metadata?.action && actions[item.metadata.action]
                      ? actions[item.metadata.action]
                      : item.message}
                </p>
                <div className="text-xs text-slate-500 break-all">
                  {item.user?.email ?? 'Σύστημα'}
                  {item.metadata?.deviceId ? ` · Συσκευή: ${item.metadata.deviceId}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm text-slate-500">
        <button
          className={fieldClass}
          disabled={page === 1 || isFetching}
          onClick={() => setPage(page - 1)}
        >
          Προηγούμενη
        </button>
        <span>Σελίδα {page}</span>
        <button
          className={fieldClass}
          disabled={!data?.hasMore || isFetching || isError || page >= 1000}
          onClick={() => setPage(page + 1)}
        >
          Επόμενη
        </button>
      </div>
    </div>
  );
}
