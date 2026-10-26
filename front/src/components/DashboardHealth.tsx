import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BatteryLow, RefreshCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

import { api } from '../lib/api';
import { deviceHealth, DeviceViewer, HealthDevice } from '../lib/deviceHealth';
import { useConnectionStore } from '../store/connection.store';

interface Failure {
  id: string;
  message: string;
  createdAt: string;
}

export default function DashboardHealth({
  devices,
  viewer,
  loading,
  failed,
  updatedAt,
  refreshing,
  onRefresh,
}: {
  devices: HealthDevice[];
  viewer?: DeviceViewer;
  loading: boolean;
  failed: boolean;
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const connection = useConnectionStore((state) => state.status);
  const health = deviceHealth(devices, viewer);
  const failures = useQuery<{ items: Failure[]; hasMore: boolean }>({
    queryKey: ['activity', 'dashboard-errors'],
    queryFn: () =>
      api
        .get('/users/activity', {
          params: {
            level: 'error',
            since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          },
        })
        .then((response) => response.data),
    refetchInterval: 30_000,
  });
  const cardClass = 'rounded-xl border border-slate-200 dark:border-white/10 p-4 space-y-3';
  const linkClass = 'text-sm text-brand hover:underline break-words';
  const deviceStatus = loading
    ? 'Φόρτωση…'
    : failed || !viewer
      ? 'Μη διαθέσιμο'
      : viewer.role !== 'OWNER' && !viewer.permissions?.canViewDevices
        ? 'Χωρίς πρόσβαση'
        : null;
  return (
    <section
      aria-labelledby="health-heading"
      className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1A222C] p-4 md:p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="health-heading" className="font-semibold text-slate-800 dark:text-slate-100">
            Χρειάζεται προσοχή
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {updatedAt
              ? `Έλεγχος συσκευών: ${new Date(updatedAt).toLocaleTimeString('el-GR')}`
              : 'Αναμονή δεδομένων συσκευών'}
          </p>
        </div>
        <button
          onClick={() => {
            onRefresh();
            void failures.refetch();
          }}
          disabled={refreshing || failures.isFetching}
          className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={refreshing || failures.isFetching ? 'animate-spin' : ''}
          />
          Ανανέωση
        </button>
      </div>
      {(failed || connection !== 'connected') && (
        <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
          Τα δεδομένα ενδέχεται να είναι παρωχημένα. Γίνεται προσπάθεια ενημέρωσης.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={cardClass}>
          <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <WifiOff size={16} className="text-red-400" />
            Εκτός σύνδεσης <span className="ml-auto">{deviceStatus ?? health.offline.length}</span>
          </h3>
          {!deviceStatus &&
            (health.offline.length ? (
              <ul className="space-y-2">
                {health.offline.slice(0, 3).map((device) => (
                  <li key={device.id}>
                    <Link className={linkClass} to={`/devices/${encodeURIComponent(device.id)}`}>
                      {device.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                Καμία συσκευή εκτός σύνδεσης στα διαθέσιμα δεδομένα.
              </p>
            ))}
          {!deviceStatus && health.offline.length > 3 && (
            <Link to="/devices" className={linkClass}>
              Και {health.offline.length - 3} ακόμη · Όλες οι συσκευές
            </Link>
          )}
        </div>
        <div className={cardClass}>
          <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <BatteryLow size={16} className="text-amber-500" />
            Χαμηλή μπαταρία{' '}
            <span className="ml-auto">{deviceStatus ?? health.lowBattery.length}</span>
          </h3>
          {!deviceStatus &&
            (health.lowBattery.length ? (
              <ul className="space-y-2">
                {health.lowBattery.slice(0, 3).map(({ device, battery }) => (
                  <li key={device.id} className="flex justify-between gap-2">
                    <Link className={linkClass} to={`/devices/${encodeURIComponent(device.id)}`}>
                      {device.name}
                    </Link>
                    <span className="text-xs text-amber-600 shrink-0">
                      {battery === 'low' ? 'Χαμηλή' : `${battery}%`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Δεν αναφέρεται χαμηλή μπαταρία.</p>
            ))}
          <p className="text-xs text-slate-400">Για όσες συσκευές αναφέρουν στάθμη μπαταρίας.</p>
          {!deviceStatus && health.lowBattery.length > 3 && (
            <Link to="/devices" className={linkClass}>
              Και {health.lowBattery.length - 3} ακόμη · Όλες οι συσκευές
            </Link>
          )}
        </div>
        <div className={cardClass}>
          <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            <AlertTriangle size={16} className="text-red-400" />
            Πρόσφατες αποτυχίες{' '}
            <span className="ml-auto">
              {failures.isPending
                ? 'Φόρτωση…'
                : failures.isError
                  ? 'Μη διαθέσιμο'
                  : `${failures.data.items.length}${failures.data.hasMore ? '+' : ''}`}
            </span>
          </h3>
          <p className="text-xs text-slate-400">Τελευταίες 24 ώρες · Ιστορικό συμβάντων</p>
          {failures.isError ? (
            <p role="status" className="text-xs text-amber-600">
              Δεν ενημερώθηκε το ιστορικό αποτυχιών. Δοκιμάστε Ανανέωση.
            </p>
          ) : (
            failures.data &&
            (failures.data.items.length ? (
              <ul className="space-y-2">
                {failures.data.items.slice(0, 3).map((failure) => (
                  <li
                    key={failure.id}
                    className="text-xs text-slate-600 dark:text-slate-300 break-words"
                  >
                    {failure.message}
                    <time dateTime={failure.createdAt} className="block text-slate-400 mt-0.5">
                      {new Date(failure.createdAt).toLocaleString('el-GR')}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">
                Δεν καταγράφηκαν αποτυχίες το τελευταίο 24ωρο.
              </p>
            ))
          )}
          <Link to="/activity?level=error" className={linkClass}>
            Προβολή αποτυχιών στο ιστορικό
          </Link>
        </div>
      </div>
    </section>
  );
}
