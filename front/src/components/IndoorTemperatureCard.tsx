import { Thermometer, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';

import { usePrefsStore } from '../store/prefs.store';

type Sensor = {
  id: string;
  name: string;
  category?: string;
  online?: boolean;
  status?: { code: string; value: unknown }[];
};

export default function IndoorTemperatureCard({
  devices,
  preferredDeviceId,
  loading,
  failed,
}: {
  devices: Sensor[];
  preferredDeviceId?: string | null;
  loading: boolean;
  failed: boolean;
}) {
  const unit = usePrefsStore((s) => s.tempUnit);
  const sensor = preferredDeviceId
    ? devices.find((device) => device.id === preferredDeviceId)
    : (devices.find((device) => device.category === 'wsdcg') ??
      devices.find((device) => device.status?.some((s) => s.code === 'va_temperature')));
  const reading =
    sensor?.status?.find((s) => s.code === 'va_temperature') ??
    sensor?.status?.find((s) => s.code === 'temp_current');
  const raw = reading?.value;
  const celsius =
    typeof raw === 'number' && Number.isFinite(raw)
      ? reading?.code === 'va_temperature'
        ? raw / 10
        : raw
      : null;
  const temperature = celsius === null ? null : unit === 'F' ? (celsius * 9) / 5 + 32 : celsius;

  return (
    <section
      aria-label="Θερμοκρασία σπιτιού"
      className="flex h-full min-w-0 flex-col rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 dark:border-orange-400/20 dark:from-orange-950/30 dark:to-[#1A222C]"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <Thermometer size={17} className="text-orange-500" /> Θερμοκρασία σπιτιού
      </h2>
      <div aria-live="polite" className="flex flex-1 flex-col justify-center py-5">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Φόρτωση θερμομέτρου…</p>
        ) : failed ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Δεν ήταν δυνατή η ενημέρωση του θερμομέτρου.
          </p>
        ) : sensor ? (
          <>
            <p className="text-4xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
              {temperature === null
                ? '—'
                : temperature.toLocaleString('el-GR', { maximumFractionDigits: 1 })}
              {temperature !== null && `°${unit}`}
            </p>
            <Link
              to={`/devices/${sensor.id}`}
              className="mt-2 text-sm text-slate-500 hover:underline dark:text-slate-400"
            >
              {sensor.name}
            </Link>
            {sensor.online === false ? (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <WifiOff size={13} /> Εκτός σύνδεσης · τελευταία ένδειξη
              </p>
            ) : (
              temperature === null && (
                <p className="mt-3 text-xs text-slate-400">Δεν υπάρχει διαθέσιμη μέτρηση.</p>
              )
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Δεν βρέθηκε διαθέσιμο θερμόμετρο.
          </p>
        )}
      </div>
    </section>
  );
}
