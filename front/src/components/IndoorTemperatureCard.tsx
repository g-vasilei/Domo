import { Droplets, Plus, Settings2, Thermometer, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  selectedTemperatureSensors,
  TemperatureDevice,
  TemperatureRoom,
  TemperatureSensor,
  temperatureSensors,
} from '../lib/temperatureSensors';
import { usePrefsStore } from '../store/prefs.store';

function SensorReadings({ sensor, unit }: { sensor: TemperatureSensor; unit: 'C' | 'F' }) {
  const temperature =
    sensor.celsius === null ? null : unit === 'F' ? (sensor.celsius * 9) / 5 + 32 : sensor.celsius;
  const format = (value: number) => value.toLocaleString('el-GR', { maximumFractionDigits: 1 });
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          {temperature === null ? '—' : `${format(temperature)}°${unit}`}
        </p>
        {sensor.humidity !== null && (
          <p className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            <Droplets size={14} />
            {format(sensor.humidity)}%
          </p>
        )}
      </div>
      {sensor.device.online === false && (
        <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
          <WifiOff size={12} /> Εκτός σύνδεσης · τελευταία ένδειξη
        </p>
      )}
      {temperature === null && (
        <p className="mt-1 text-xs text-slate-400">Δεν υπάρχει διαθέσιμη μέτρηση θερμοκρασίας.</p>
      )}
    </>
  );
}

function TemperatureModal({
  sensors,
  selectedIds,
  onClose,
}: {
  sensors: TemperatureSensor[];
  selectedIds: string[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() =>
    selectedTemperatureSensors(sensors, selectedIds).map((s) => s.device.id),
  );
  const unit = usePrefsStore((s) => s.tempUnit);
  const saving = usePrefsStore((s) => s.saving);
  const saveError = usePrefsStore((s) => s.saveError);
  const save = usePrefsStore((s) => s.setDashboardTemperatureDeviceIds);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const groups = [...new Set(sensors.map((sensor) => sensor.room))];
  return (
    <dialog
      ref={dialog}
      aria-labelledby="temperature-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-black/50 backdrop:backdrop-blur-sm dark:border-white/10 dark:bg-[#1A222C] dark:text-slate-100"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-white/10">
          <div>
            <h2 id="temperature-modal-title" className="font-semibold">
              Θερμοκρασία ανά δωμάτιο / συσκευή
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Επιλέξτε έως 2 συσκευές για την αρχική · {draft.length}/2
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Κλείσιμο"
            className="rounded-lg p-2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-5">
          {groups.map((room) => (
            <section key={room} aria-label={room}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {room}
              </h3>
              <div className="space-y-2">
                {sensors
                  .filter((sensor) => sensor.room === room)
                  .map((sensor) => {
                    const checked = draft.includes(sensor.device.id);
                    return (
                      <div
                        key={sensor.device.id}
                        className="rounded-xl border border-slate-200 p-3 dark:border-white/10"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <Link
                            to={`/devices/${sensor.device.id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {sensor.device.name}
                          </Link>
                          <label className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <input
                              type="checkbox"
                              aria-label={`Εμφάνιση στην αρχική: ${sensor.device.name}`}
                              checked={checked}
                              disabled={saving || (!checked && draft.length >= 2)}
                              onChange={() =>
                                setDraft((ids) =>
                                  checked
                                    ? ids.filter((id) => id !== sensor.device.id)
                                    : [...ids, sensor.device.id],
                                )
                              }
                              className="accent-orange-500"
                            />
                            Στην αρχική
                          </label>
                        </div>
                        <SensorReadings sensor={sensor} unit={unit} />
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
          {sensors.length === 0 && (
            <p className="text-sm text-slate-400">Δεν βρέθηκαν συσκευές με θερμοκρασία.</p>
          )}
        </div>
        <div className="border-t border-slate-100 p-4 dark:border-white/10">
          {saveError && (
            <p role="alert" className="mb-3 text-sm text-red-500">
              {saveError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl px-4 py-2 text-sm text-slate-500 disabled:opacity-40"
            >
              Ακύρωση
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                if (await save(draft)) onClose();
              }}
              className="rounded-xl bg-brand px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

export default function IndoorTemperatureCard({
  devices,
  rooms,
  loading,
  failed,
}: {
  devices: TemperatureDevice[];
  rooms: TemperatureRoom[];
  loading: boolean;
  failed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unit = usePrefsStore((s) => s.tempUnit);
  const selectedIds = usePrefsStore((s) => s.dashboardTemperatureDeviceIds);
  const sensors = temperatureSensors(devices, rooms);
  const selected = selectedTemperatureSensors(sensors, selectedIds);
  return (
    <section
      aria-label="Θερμοκρασία σπιτιού"
      className="flex h-full min-w-0 flex-col rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 dark:border-orange-400/20 dark:from-orange-950/30 dark:to-[#1A222C]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Thermometer size={17} className="shrink-0 text-orange-500" /> Θερμοκρασία σπιτιού
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {sensors.length > 2 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Προβολή όλων των θερμοκρασιών"
              disabled={loading || failed}
              className="flex items-center gap-0.5 rounded-lg bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
            >
              <Plus size={13} />
              {sensors.length - selected.length}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={loading || failed}
            aria-label="Επιλογή συσκευών θερμοκρασίας"
            className="rounded-lg p-1.5 text-slate-400 hover:text-orange-500 disabled:opacity-40"
          >
            <Settings2 size={15} />
          </button>
        </div>
      </div>
      <div aria-live="polite" className="flex flex-1 flex-col justify-center py-3">
        {loading ? (
          <p className="text-sm text-slate-400">Φόρτωση μετρήσεων…</p>
        ) : failed ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Δεν ήταν δυνατή η ενημέρωση των μετρήσεων.
          </p>
        ) : selected.length ? (
          <div className="divide-y divide-orange-100 dark:divide-white/10">
            {selected.map((sensor) => (
              <div key={sensor.device.id} className="py-3">
                <p className="text-xs text-slate-400">{sensor.room}</p>
                <Link
                  to={`/devices/${sensor.device.id}`}
                  className="mb-1 inline-block text-sm text-slate-600 hover:underline dark:text-slate-300"
                >
                  {sensor.device.name}
                </Link>
                <SensorReadings sensor={sensor} unit={unit} />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-3 text-sm text-slate-500 dark:text-slate-400">
            <p>
              {sensors.length
                ? 'Επιλέξτε έως 2 συσκευές για την αρχική.'
                : 'Δεν βρέθηκαν συσκευές με θερμοκρασία.'}
            </p>
            {sensors.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 text-orange-600 hover:underline dark:text-orange-400"
              >
                Επιλογή συσκευών →
              </button>
            )}
          </div>
        )}
      </div>
      {open && (
        <TemperatureModal
          sensors={sensors}
          selectedIds={selectedIds}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}
