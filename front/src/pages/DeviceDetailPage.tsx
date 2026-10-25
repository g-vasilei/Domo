import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Cpu,
  DoorOpen,
  Eye,
  Lightbulb,
  Plug,
  RefreshCw,
  Thermometer,
  Timer,
  Wifi,
  WifiOff,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import AirConditionerControls from '../components/AirConditionerControls';
import DeviceSchedules from '../components/DeviceSchedules';
import TimerModal from '../components/TimerModal';
import { api } from '../lib/api';
import { convertTemp, usePrefsStore } from '../store/prefs.store';
import { useTimerStore } from '../store/timer.store';

// ─── helpers ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  cz: { label: 'Πρίζα', Icon: Plug },
  kg: { label: 'Διακόπτης', Icon: Zap },
  dj: { label: 'Φωτισμός', Icon: Lightbulb },
  dd: { label: 'Ταινία LED', Icon: Lightbulb },
  xdd: { label: 'Φωτιστικό οροφής', Icon: Lightbulb },
  kt: { label: 'Κλιματιστικό', Icon: Wind },
  wk: { label: 'Θερμοστάτης', Icon: Thermometer },
  kj: { label: 'Καθαριστής αέρα', Icon: Wind },
  fs: { label: 'Ανεμιστήρας', Icon: Wind },
  wsdcg: { label: 'Αισθητήρας', Icon: Thermometer },
  mcs: { label: 'Αισθητήρας πόρτας', Icon: DoorOpen },
  pir: { label: 'Κίνηση', Icon: Eye },
};

function sv(status: any[], code: string) {
  return status?.find((s: any) => s.code === code)?.value;
}

// Return ALL boolean switch codes in a consistent order
function detectSwitchCodes(status: any[]): string[] {
  return status
    .filter((s) => s.code.includes('switch') && typeof s.value === 'boolean')
    .map((s) => s.code)
    .sort();
}

function switchLabel(code: string, total: number): string {
  if (total === 1) return 'Τροφοδοσία';
  const num = code.match(/\d+$/)?.[0];
  return num ? `Διακόπτης ${num}` : code;
}

function formatIconUrl(url: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://images.tuyaeu.com/${url}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl p-6">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PowerToggle({
  label,
  on,
  onChange,
  disabled,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{on ? 'Ενεργό' : 'Ανενεργό'}</p>
      </div>
      <button
        role="switch"
        aria-label={label}
        aria-checked={on}
        onClick={() => onChange(!on)}
        disabled={disabled}
        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
          on ? 'bg-brand' : 'bg-slate-200 dark:bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? 'translate-x-9' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => setLocal(value), [value]);

  const pct = ((local - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <span className="text-sm font-semibold text-brand">
          {local}
          {unit}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 dark:bg-white/10">
        <div
          className="absolute h-2 rounded-full bg-brand transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => onChange(local)}
          onTouchEnd={() => onChange(local)}
          className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

function StatPill({ label, value, unit = '' }: { label: string; value: any; unit?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-center">
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
        {value}
        <span className="text-sm font-normal ml-0.5">{unit}</span>
      </p>
      <p className="text-[11px] text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function RawStatus({ status }: { status: any[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
      >
        <span>Αναλυτική κατάσταση ({status.length} κωδικοί)</span>
        <span className="text-slate-300">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-6 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-200 dark:border-white/10 pt-4">
          {status.map((s) => (
            <div key={s.code} className="bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-2">
              <p className="text-[10px] font-mono text-slate-400">{s.code}</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                {String(s.value)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── controls per category ───────────────────────────────────────────────────

function DeviceControls({
  device,
  sendCommand,
  isPending,
}: {
  device: any;
  sendCommand: any;
  isPending: boolean;
}) {
  const status: any[] = device.status ?? [];
  const isAc = device.category === 'kt';
  const switchCodes = detectSwitchCodes(status);

  const brightness = sv(status, 'bright_value') ?? sv(status, 'bright_value_v2');
  const tempUnit = usePrefsStore((s) => s.tempUnit);
  const colorTemp = sv(status, 'temp_value') ?? sv(status, 'colour_temp');
  const tempCurrent = sv(status, 'temp_current') ?? sv(status, 'va_temperature');
  const humidity = sv(status, 'humidity_value') ?? sv(status, 'va_humidity');
  const curPower = sv(status, 'cur_power');
  const curVoltage = sv(status, 'cur_voltage');
  const curCurrent = sv(status, 'cur_current');

  const disabled = isPending || !device.online;

  return (
    <div className="space-y-4">
      {isAc && <AirConditionerControls device={device} disabled={disabled} send={sendCommand} />}
      {/* Power — one toggle per switch code */}
      {!isAc && switchCodes.length > 0 && (
        <Card title="Έλεγχος τροφοδοσίας">
          <div className="divide-y divide-slate-200 dark:divide-white/10">
            {switchCodes.map((code) => (
              <PowerToggle
                key={code}
                label={switchLabel(code, switchCodes.length)}
                on={sv(status, code) === true}
                disabled={disabled}
                onChange={(v) => sendCommand([{ code, value: v }])}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Brightness + Color Temp (lights) */}
      {(brightness !== undefined || colorTemp !== undefined) && (
        <Card title="Ρυθμίσεις φωτισμού">
          <div className="space-y-6">
            {brightness !== undefined && (
              <Slider
                label="Φωτεινότητα"
                value={brightness}
                min={10}
                max={1000}
                unit=""
                disabled={disabled}
                onChange={(v) =>
                  sendCommand([
                    {
                      code:
                        sv(status, 'bright_value') !== undefined
                          ? 'bright_value'
                          : 'bright_value_v2',
                      value: v,
                    },
                  ])
                }
              />
            )}
            {colorTemp !== undefined && (
              <Slider
                label="Θερμοκρασία χρώματος"
                value={colorTemp}
                min={0}
                max={1000}
                unit=""
                disabled={disabled}
                onChange={(v) =>
                  sendCommand([
                    {
                      code: sv(status, 'temp_value') !== undefined ? 'temp_value' : 'colour_temp',
                      value: v,
                    },
                  ])
                }
              />
            )}
          </div>
        </Card>
      )}

      {/* Sensor readings */}
      {(tempCurrent !== undefined || humidity !== undefined) && (
        <Card title="Μετρήσεις">
          <div className="grid grid-cols-2 gap-3">
            {tempCurrent !== undefined && (
              <StatPill
                label="Θερμοκρασία"
                value={
                  typeof tempCurrent === 'number'
                    ? `${convertTemp(tempCurrent, tempUnit)}°${tempUnit}`
                    : tempCurrent
                }
              />
            )}
            {humidity !== undefined && (
              <StatPill
                label="Υγρασία"
                value={
                  typeof humidity === 'number' && humidity > 100
                    ? (humidity / 10).toFixed(1)
                    : humidity
                }
                unit="%"
              />
            )}
          </div>
        </Card>
      )}

      {/* Energy monitoring (smart plugs) */}
      {(curPower !== undefined || curVoltage !== undefined || curCurrent !== undefined) && (
        <Card title="Κατανάλωση ενέργειας">
          <div className="grid grid-cols-3 gap-3">
            {curPower !== undefined && (
              <StatPill label="Τροφοδοσία" value={(curPower / 10).toFixed(1)} unit="W" />
            )}
            {curVoltage !== undefined && (
              <StatPill label="Τάση" value={(curVoltage / 10).toFixed(1)} unit="V" />
            )}
            {curCurrent !== undefined && <StatPill label="Ένταση" value={curCurrent} unit="mA" />}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── notification toggle ─────────────────────────────────────────────────────

function NotifToggle({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['device-notif-pref', deviceId],
    queryFn: () => api.get(`/devices/${deviceId}/notif-pref`).then((r) => r.data),
    staleTime: 60_000,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(`/devices/${deviceId}/notif-pref`, { enabled, deviceName }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['device-notif-pref', deviceId] }),
  });

  const enabled = data?.enabled ?? false;

  return (
    <button
      onClick={() => mutate(!enabled)}
      disabled={isPending}
      title={
        enabled ? 'Απενεργοποίηση ειδοποιήσεων συσκευής' : 'Ενεργοποίηση ειδοποιήσεων συσκευής'
      }
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
        enabled
          ? 'bg-brand/10 text-brand hover:bg-brand/20'
          : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
      }`}
    >
      {enabled ? <Bell size={12} /> : <BellOff size={12} />}
      {enabled ? 'Ειδοποιήσεις ενεργές' : 'Ειδοποιήσεις'}
    </button>
  );
}

// ─── timer button ─────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}ώρ. ${m}λ.`;
  if (m > 0) return `${m}λ. ${s}δ.`;
  return `${s}δ.`;
}

function TimerControl({
  deviceId,
  deviceName,
  switchCode,
  online,
}: {
  deviceId: string;
  deviceName: string;
  switchCode: string | null;
  online: boolean;
}) {
  const queryClient = useQueryClient();
  const [timerError, setTimerError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [, setTick] = useState(0);
  const activeTimer = useTimerStore((s) => s.timers.find((t) => t.deviceId === deviceId));
  const { start: startTimer, cancel: cancelTimer } = useTimerStore();

  useEffect(() => {
    if (!activeTimer) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  if (!switchCode) return null;

  async function handleConfirm(minutes: number) {
    await startTimer(deviceId, deviceName, switchCode!, minutes);
    await queryClient.invalidateQueries({ queryKey: ['device', deviceId] });
    setShowModal(false);
  }

  const remaining = activeTimer ? activeTimer.endsAt - Date.now() : 0;

  return (
    <>
      {activeTimer && remaining > 0 ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
          <Timer size={13} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums">
            Αυτόματο σβήσιμο σε {formatCountdown(remaining)}
          </span>
          <button
            onClick={() => {
              setTimerError(null);
              cancelTimer(deviceId).catch(() =>
                setTimerError('Δεν ακυρώθηκε ο χρονοδιακόπτης. Δοκιμάστε ξανά.'),
              );
            }}
            className="ml-1 text-amber-400 hover:text-amber-600 transition-colors"
            title="Ακύρωση χρονοδιακόπτη"
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          disabled={!online}
          title="Ορισμός αυτόματου σβησίματος"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Timer size={12} />
          Λειτουργία για…
        </button>
      )}

      {timerError && (
        <p role="alert" className="text-xs text-red-500">
          {timerError}
        </p>
      )}
      {showModal && (
        <TimerModal
          deviceName={deviceName}
          onConfirm={handleConfirm}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [imgError, setImgError] = useState(false);

  const {
    data: device,
    isLoading,
    error,
    isFetching,
  } = useQuery({
    queryKey: ['device', id],
    queryFn: () => api.get(`/devices/${id}`).then((r) => r.data),
    refetchInterval: 15_000,
    enabled: !!id,
  });

  const [cmdError, setCmdError] = useState<string | null>(null);

  const { mutate: sendCommand, isPending } = useMutation({
    mutationFn: (commands: { code: string; value: unknown }[]) =>
      api.post(`/devices/${id}/commands`, { commands }),
    onMutate: async (commands) => {
      await queryClient.cancelQueries({ queryKey: ['device', id] });
      const previous = queryClient.getQueryData(['device', id]);
      queryClient.setQueryData(['device', id], (old: any) => ({
        ...old,
        status: [
          ...(old.status ?? []).filter((s: any) => !commands.some((c) => c.code === s.code)),
          ...commands,
        ],
      }));
      return { previous };
    },
    onSuccess: () => setCmdError(null),
    onError: (e: any, _vars, ctx: any) => {
      queryClient.setQueryData(['device', id], ctx?.previous);
      setCmdError(e?.response?.data?.message ?? e?.message ?? 'Η εντολή απέτυχε');
    },
  });

  const meta = device
    ? (CATEGORY_META[device.category] ?? { label: device.category, Icon: Cpu })
    : { label: '', Icon: Cpu };
  const iconUrl = device?.icon ? formatIconUrl(device.icon) : '';
  const primarySwitchCode = device
    ? device.category === 'kt'
      ? (device.status ?? []).some((s: any) => s.code === 'switch' && typeof s.value === 'boolean')
        ? 'switch'
        : null
      : (detectSwitchCodes(device.status ?? [])[0] ?? null)
    : null;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} /> Επιστροφή στην επισκόπηση
      </button>

      {isLoading && (
        <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl p-8 animate-pulse h-48" />
      )}

      {error && (
        <div className="bg-white dark:bg-[#1A222C] border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-center">
          <p className="text-sm text-red-400">Δεν φορτώθηκε η συσκευή.</p>
        </div>
      )}

      {device && (
        <>
          {/* Device header */}
          <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-4">
              <div
                className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  device.online ? 'bg-brand/10' : 'bg-slate-100 dark:bg-white/5'
                }`}
              >
                {iconUrl && !imgError ? (
                  <img
                    src={iconUrl}
                    alt={meta.label}
                    className="w-10 h-10 object-contain"
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <meta.Icon
                    size={28}
                    className={device.online ? 'text-brand' : 'text-slate-400'}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0 flex-wrap">
                <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">
                  {device.name}
                </h1>
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  <span className="text-sm text-slate-400">{meta.label}</span>
                  <span
                    className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      device.online
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'
                        : 'bg-slate-100 text-slate-400 dark:bg-white/5'
                    }`}
                  >
                    {device.online ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {device.online ? 'Σε σύνδεση' : 'Εκτός σύνδεσης'}
                  </span>
                </div>
                {device.model && <p className="text-xs text-slate-400 mt-1">{device.model}</p>}
              </div>

              <div className="flex flex-col items-end gap-2 flex-wrap justify-end md:flex-row md:items-center">
                <TimerControl
                  deviceId={device.id}
                  deviceName={device.name}
                  switchCode={primarySwitchCode}
                  online={device.online}
                />
                <NotifToggle deviceId={device.id} deviceName={device.name} />
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['device', id] })}
                  className="p-2 rounded-xl text-slate-400 hover:text-brand hover:bg-brand/5"
                  title="Ανανέωση"
                >
                  <RefreshCw
                    size={16}
                    className={`transition-colors ${isFetching ? 'animate-spin text-brand' : ''}`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Command error */}
          {cmdError && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-5 py-3 flex items-center justify-between">
              <p className="text-sm text-red-500">{cmdError}</p>
              <button
                onClick={() => setCmdError(null)}
                className="text-red-400 hover:text-red-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
          )}

          {/* Controls */}
          {!device.online && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl px-5 py-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                Η συσκευή είναι εκτός σύνδεσης. Τα χειριστήρια ενεργοποιούνται όταν επανασυνδεθεί.
              </p>
            </div>
          )}

          <DeviceControls device={device} sendCommand={sendCommand} isPending={isPending} />
          {primarySwitchCode && (
            <DeviceSchedules
              deviceId={device.id}
              deviceName={device.name}
              switchCode={primarySwitchCode}
            />
          )}

          {/* Raw status */}
          {device.status?.length > 0 && <RawStatus status={device.status} />}
        </>
      )}
    </div>
  );
}
