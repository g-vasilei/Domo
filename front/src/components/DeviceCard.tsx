import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Cpu,
  DoorOpen,
  Eye,
  Lightbulb,
  Plug,
  Power,
  Thermometer,
  Timer,
  Wind,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { convertTemp, usePrefsStore } from '../store/prefs.store';
import { useTimerStore } from '../store/timer.store';
import TimerModal from './TimerModal';

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  cz: { label: 'Socket', Icon: Plug },
  kg: { label: 'Switch', Icon: Zap },
  dj: { label: 'Light', Icon: Lightbulb },
  dd: { label: 'LED Strip', Icon: Lightbulb },
  xdd: { label: 'Ceiling Light', Icon: Lightbulb },
  dlq: { label: 'Dimmer', Icon: Lightbulb },
  wk: { label: 'Thermostat', Icon: Thermometer },
  kj: { label: 'Air Purifier', Icon: Wind },
  fs: { label: 'Fan', Icon: Wind },
  wsdcg: { label: 'Sensor', Icon: Thermometer },
  mcs: { label: 'Door Sensor', Icon: DoorOpen },
  pir: { label: 'Motion', Icon: Eye },
};

function sv(status: any[], code: string) {
  return status?.find((s: any) => s.code === code)?.value;
}

function detectSwitchCode(status: any[]): string | null {
  for (const code of ['switch', 'switch_1', 'switch_led', 'switch_on']) {
    const e = status.find((s) => s.code === code);
    if (e && typeof e.value === 'boolean') return code;
  }
  return (
    status.find((s) => s.code.includes('switch') && typeof s.value === 'boolean')?.code ?? null
  );
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
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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

  const meta = CATEGORY_META[device.category] ?? { label: device.category ?? 'Device', Icon: Cpu };
  const { Icon, label } = meta;

  const tempUnit = usePrefsStore((s) => s.tempUnit);
  const status: any[] = device.status ?? [];
  const switchCode = detectSwitchCode(status);
  const isOn = switchCode ? sv(status, switchCode) === true : null;

  const temp = sv(status, 'temp_current') ?? sv(status, 'va_temperature');
  const humidity = sv(status, 'humidity_value') ?? sv(status, 'va_humidity');
  const iconUrl = device.icon ? formatIconUrl(device.icon) : '';

  const activeTimer = useTimerStore((s) => s.timers.find((t) => t.deviceId === device.id));
  const { start: startTimer, cancel: cancelTimer } = useTimerStore();

  const { mutate: sendCommand, isPending } = useMutation({
    mutationFn: (commands: { code: string; value: unknown }[]) =>
      api.post(`/devices/${device.id}/commands`, { commands }),
    onMutate: async (commands) => {
      await queryClient.cancelQueries({ queryKey: ['rooms'] });
      const previous = queryClient.getQueryData(['rooms']);
      queryClient.setQueryData(['rooms'], (old: any[]) =>
        old?.map((room) => ({
          ...room,
          devices: room.devices.map((d: any) =>
            d.id !== device.id
              ? d
              : {
                  ...d,
                  status: d.status.map((s: any) => {
                    const cmd = commands.find((c) => c.code === s.code);
                    return cmd ? { ...s, value: cmd.value } : s;
                  }),
                },
          ),
        })),
      );
      return { previous };
    },
    onError: (_e, _vars, ctx: any) => {
      queryClient.setQueryData(['rooms'], ctx?.previous);
    },
  });

  function handleTimerConfirm(minutes: number) {
    if (!switchCode) return;
    sendCommand([{ code: switchCode, value: true }]);
    startTimer(device.id, device.name, switchCode, minutes);
    setShowTimerModal(false);
  }

  return (
    <>
      <div className="bg-white dark:bg-[#1A222C] border border-gray-200 dark:border-white/10 rounded-xl p-5 flex flex-col gap-3 hover:border-brand/30 transition-colors duration-200 group">
        {/* Top row: icon + name + online dot */}
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 ${
              device.online ? 'bg-brand/10' : 'bg-slate-100 dark:bg-white/5'
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
                className={device.online ? 'text-brand' : 'text-slate-300 dark:text-slate-600'}
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug truncate">
              {device.name}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <p className="text-[11px] text-slate-400">{label}</p>
              <TimerBadge deviceId={device.id} />
            </div>
          </div>

          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 self-start mt-1 ${
              device.online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'
            }`}
            title={device.online ? 'Online' : 'Offline'}
          />
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

        {/* Bottom row */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-white/10 mt-auto">
          {switchCode !== null ? (
            <div className="flex items-center gap-2">
              {/* Power toggle */}
              <button
                onClick={() => sendCommand([{ code: switchCode, value: !isOn }])}
                disabled={isPending || !device.online}
                title={isOn ? 'Turn off' : 'Turn on'}
                className={`flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isOn
                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                    : 'border-red-400 bg-red-400/10 text-red-400 hover:bg-red-400 hover:text-white'
                }`}
              >
                <Power size={15} />
              </button>

              {/* Timer button */}
              <button
                onClick={() => (activeTimer ? cancelTimer(device.id) : setShowTimerModal(true))}
                disabled={!device.online}
                title={activeTimer ? 'Cancel timer' : 'Set auto-off timer'}
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
            <span className="text-[11px] text-slate-400">Read only</span>
          )}

          <button
            onClick={() => navigate(`/devices/${device.id}`)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand transition-colors"
          >
            Details <ArrowRight size={12} />
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
