import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Cpu,
  DoorOpen,
  Eye,
  Lightbulb,
  Plug,
  Thermometer,
  Timer,
  Wind,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDeviceCommand } from '../hooks/useDeviceCommand';
import { useDevicePermissions } from '../hooks/useDevicePermissions';
import { refreshDeviceCaches } from '../lib/deviceCommands';
import { powerSwitchCodes } from '../lib/devicePower';
import { convertTemp, usePrefsStore } from '../store/prefs.store';
import { useTimerStore } from '../store/timer.store';
import CommandFeedback from './CommandFeedback';
import PowerSwitch from './PowerSwitch';
import TimerModal from './TimerModal';

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  cz: { label: 'Πρίζα', Icon: Plug },
  kg: { label: 'Διακόπτης', Icon: Zap },
  dj: { label: 'Φωτισμός', Icon: Lightbulb },
  dd: { label: 'Ταινία LED', Icon: Lightbulb },
  xdd: { label: 'Φωτιστικό οροφής', Icon: Lightbulb },
  dlq: { label: 'Ροοστάτης', Icon: Lightbulb },
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

function formatIconUrl(url: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://images.tuyaeu.com/${url}`;
}

function fmt(val: number, threshold = 100) {
  return val > threshold ? (val / 10).toFixed(1) : val;
}

function formatCountdown(ms: number): string {
  const totalSecs = Math.ceil(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}ώρ. ${m}λ.`;
  if (m > 0) return `${m}λ. ${s}δ.`;
  return `${s}δ.`;
}

function TimerBadge({ deviceId }: { deviceId: string }) {
  const timer = useTimerStore((s) => s.timers.find((t) => t.deviceId === deviceId));
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!timer) return;
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  if (!timer) return null;
  const remaining = timer.endsAt - Date.now();
  if (remaining <= 0) return null;

  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded-full">
      <Timer size={9} />
      {formatCountdown(remaining)}
    </span>
  );
}

export default function DeviceCard({ device }: { device: any }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);

  const meta = CATEGORY_META[device.category] ?? { label: device.category ?? 'Συσκευή', Icon: Cpu };
  const { Icon, label } = meta;

  const tempUnit = usePrefsStore((s) => s.tempUnit);
  const status: any[] = device.status ?? [];
  const switchCode = powerSwitchCodes(device)[0] ?? null;
  const isOn = switchCode ? sv(status, switchCode) === true : null;
  const expectsPower = ['cz', 'kg', 'dj', 'dd', 'xdd', 'dlq', 'kt', 'wk', 'kj', 'fs'].includes(
    device.category,
  );
  const online = device.online === true;
  const connectionLabel = online
    ? 'Σε σύνδεση'
    : device.online === false
      ? 'Εκτός σύνδεσης'
      : 'Άγνωστη σύνδεση';

  const temp = sv(status, 'temp_current') ?? sv(status, 'va_temperature');
  const humidity = sv(status, 'humidity_value') ?? sv(status, 'va_humidity');
  const iconUrl = device.icon ? formatIconUrl(device.icon) : '';

  const activeTimer = useTimerStore((s) => s.timers.find((t) => t.deviceId === device.id));
  const { start: startTimer, cancel: cancelTimer } = useTimerStore();

  const { sendCommand, isPending, feedback } = useDeviceCommand(device.id);
  const { canControl } = useDevicePermissions(device.id);

  async function handleTimerConfirm(minutes: number) {
    if (!switchCode) return;
    await startTimer(device.id, device.name, switchCode, minutes);
    await refreshDeviceCaches(queryClient, device.id);
    setShowTimerModal(false);
  }

  return (
    <>
      <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl p-5 flex flex-col gap-3 hover:border-brand/30 transition-colors duration-200 group">
        {/* Top row: icon + name + online dot */}
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 ${
              online ? 'bg-brand/10' : 'bg-slate-100 dark:bg-white/5'
            }`}
          >
            {iconUrl && !imgError ? (
              <img
                src={iconUrl}
                alt={label}
                className="w-8 h-8 object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <Icon
                size={22}
                className={online ? 'text-brand' : 'text-slate-300 dark:text-slate-600'}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug truncate">
              {device.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-[11px] text-slate-400">{label}</p>
              {isOn !== null && (
                <span
                  className={`text-[11px] font-medium ${online && isOn ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {online ? '' : 'Τελευταία ένδειξη: '}
                  {isOn ? 'Αναμμένη' : 'Σβηστή'}
                </span>
              )}
              {isOn === null && expectsPower && (
                <span className="text-[11px] text-slate-500">Άγνωστη κατάσταση</span>
              )}
              <TimerBadge deviceId={device.id} />
            </div>
          </div>

          <span
            className="flex items-center gap-1.5 flex-shrink-0 self-start mt-1 text-[10px] text-slate-400"
            title={connectionLabel}
          >
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`}
            />
            {connectionLabel}
          </span>
        </div>

        {/* Sensor readings */}
        {(temp !== undefined || humidity !== undefined) && (
          <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
            {temp !== undefined && (
              <span>
                🌡 {convertTemp(temp, tempUnit)}°{tempUnit}
              </span>
            )}
            {humidity !== undefined && <span>💧 {fmt(humidity, 100)}%</span>}
          </div>
        )}

        <CommandFeedback feedback={feedback} />
        {typeof device.statusUpdatedAt === 'number' && (
          <p className="text-[10px] text-slate-400">
            Τελευταία ενημέρωση: {new Date(device.statusUpdatedAt).toLocaleTimeString('el-GR')}
          </p>
        )}
        {timerError && (
          <p role="alert" className="text-xs text-red-500">
            {timerError}
          </p>
        )}
        {/* Bottom row */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10 mt-auto">
          {switchCode !== null && canControl ? (
            <div className="flex items-center gap-2">
              {/* Power toggle */}
              <PowerSwitch
                compact
                on={isOn === true}
                label={`${device.name ?? 'Συσκευή'}: Τροφοδοσία`}
                disabled={!online}
                pending={isPending}
                onChange={(value) => sendCommand([{ code: switchCode, value }])}
              />

              {/* Timer button */}
              <button
                onClick={() => {
                  setTimerError(null);
                  if (activeTimer)
                    cancelTimer(device.id).catch(() =>
                      setTimerError('Δεν ακυρώθηκε ο χρονοδιακόπτης'),
                    );
                  else setShowTimerModal(true);
                }}
                disabled={isPending || !online}
                title={activeTimer ? 'Ακύρωση χρονοδιακόπτη' : 'Ορισμός αυτόματου σβησίματος'}
                className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                  activeTimer
                    ? 'border-amber-400 bg-amber-400/10 text-amber-500 hover:bg-amber-400 hover:text-white'
                    : 'border-slate-200 dark:border-white/10 text-slate-400 hover:border-brand hover:text-brand'
                }`}
              >
                <Timer size={13} />
              </button>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400">Μόνο προβολή</span>
          )}

          <button
            onClick={() => navigate(`/devices/${device.id}`)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand transition-colors"
          >
            Λεπτομέρειες <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {showTimerModal && (
        <TimerModal
          deviceName={device.name}
          onConfirm={handleTimerConfirm}
          onClose={() => setShowTimerModal(false)}
        />
      )}
    </>
  );
}
