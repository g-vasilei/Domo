import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, RefreshCw, Plug, Lightbulb, Thermometer, Wind,
  Eye, DoorOpen, Cpu, Zap, Wifi, WifiOff, Bell, BellOff,
} from 'lucide-react';
import { api } from '../lib/api';
import { usePrefsStore, convertTemp } from '../store/prefs.store';

// ─── helpers ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; Icon: any }> = {
  cz:    { label: 'Socket',        Icon: Plug },
  kg:    { label: 'Switch',        Icon: Zap },
  dj:    { label: 'Light',         Icon: Lightbulb },
  dd:    { label: 'LED Strip',     Icon: Lightbulb },
  xdd:   { label: 'Ceiling Light', Icon: Lightbulb },
  wk:    { label: 'Thermostat',    Icon: Thermometer },
  kj:    { label: 'Air Purifier',  Icon: Wind },
  fs:    { label: 'Fan',           Icon: Wind },
  wsdcg: { label: 'Sensor',        Icon: Thermometer },
  mcs:   { label: 'Door Sensor',   Icon: DoorOpen },
  pir:   { label: 'Motion',        Icon: Eye },
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
  if (total === 1) return 'Power';
  const num = code.match(/\d+$/)?.[0];
  return num ? `Switch ${num}` : code;
}

function formatIconUrl(url: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : `https://images.tuyaeu.com/${url}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function PowerToggle({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{on ? 'On' : 'Off'}</p>
      </div>
      <button
        onClick={() => onChange(!on)}
        disabled={disabled}
        className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
          on ? 'bg-brand' : 'bg-slate-200 dark:bg-slate-600'
        }`}
      >
        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${on ? 'translate-x-9' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function Slider({
  label, value, min, max, step = 1, unit = '', onChange, disabled,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void; disabled: boolean;
}) {
  const [local, setLocal] = useState(value);

  const pct = ((local - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        <span className="text-sm font-semibold text-brand">{local}{unit}</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 dark:bg-white/10">
        <div className="absolute h-2 rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min} max={max} step={step}
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(Number(e.target.value))}
          onMouseUp={() => onChange(local)}
          onTouchEnd={() => onChange(local)}
          className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, unit = '' }: { label: string; value: any; unit?: string }) {
  return (
    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-sm p-4 text-center">
      <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{value}<span className="text-sm font-normal ml-0.5">{unit}</span></p>
      <p className="text-[11px] text-slate-400 mt-1">{label}</p>
    </div>
  );
}

function RawStatus({ status }: { status: any[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
      >
        <span>Raw Status ({status.length} codes)</span>
        <span className="text-slate-300">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-6 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-200 dark:border-white/10 pt-4">
          {status.map((s) => (
            <div key={s.code} className="bg-slate-50 dark:bg-white/5 rounded px-3 py-2">
              <p className="text-[10px] font-mono text-slate-400">{s.code}</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{String(s.value)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── controls per category ───────────────────────────────────────────────────

function DeviceControls({ device, sendCommand, isPending }: { device: any; sendCommand: any; isPending: boolean }) {
  const status: any[] = device.status ?? [];
  const switchCodes = detectSwitchCodes(status);

  const brightness = sv(status, 'bright_value') ?? sv(status, 'bright_value_v2');
  const tempUnit = usePrefsStore((s) => s.tempUnit);
  const colorTemp  = sv(status, 'temp_value')   ?? sv(status, 'colour_temp');
  const tempCurrent = sv(status, 'temp_current') ?? sv(status, 'va_temperature');
  const humidity    = sv(status, 'humidity_value') ?? sv(status, 'va_humidity');
  const curPower    = sv(status, 'cur_power');
  const curVoltage  = sv(status, 'cur_voltage');
  const curCurrent  = sv(status, 'cur_current');

  const disabled = isPending || !device.online;

  return (
    <div className="space-y-4">
      {/* Power — one toggle per switch code */}
      {switchCodes.length > 0 && (
        <Card title="Power Control">
          <div className="divide-y divide-stroke dark:divide-white/10">
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
        <Card title="Light Settings">
          <div className="space-y-6">
            {brightness !== undefined && (
              <Slider
                label="Brightness"
                value={brightness}
                min={10} max={1000}
                unit=""
                disabled={disabled}
                onChange={(v) => sendCommand([{ code: sv(status, 'bright_value') !== undefined ? 'bright_value' : 'bright_value_v2', value: v }])}
              />
            )}
            {colorTemp !== undefined && (
              <Slider
                label="Color Temperature"
                value={colorTemp}
                min={0} max={1000}
                unit=""
                disabled={disabled}
                onChange={(v) => sendCommand([{ code: sv(status, 'temp_value') !== undefined ? 'temp_value' : 'colour_temp', value: v }])}
              />
            )}
          </div>
        </Card>
      )}

      {/* Sensor readings */}
      {(tempCurrent !== undefined || humidity !== undefined) && (
        <Card title="Readings">
          <div className="grid grid-cols-2 gap-3">
            {tempCurrent !== undefined && (
              <StatPill
                label="Temperature"
                value={typeof tempCurrent === 'number' ? `${convertTemp(tempCurrent, tempUnit)}°${tempUnit}` : tempCurrent}
                unit="°C"
              />
            )}
            {humidity !== undefined && (
              <StatPill label="Humidity" value={typeof humidity === 'number' && humidity > 100 ? (humidity / 10).toFixed(1) : humidity} unit="%" />
            )}
          </div>
        </Card>
      )}

      {/* Energy monitoring (smart plugs) */}
      {(curPower !== undefined || curVoltage !== undefined || curCurrent !== undefined) && (
        <Card title="Energy Monitor">
          <div className="grid grid-cols-3 gap-3">
            {curPower   !== undefined && <StatPill label="Power"   value={(curPower   / 10).toFixed(1)} unit="W" />}
            {curVoltage !== undefined && <StatPill label="Voltage" value={(curVoltage / 10).toFixed(1)} unit="V" />}
            {curCurrent !== undefined && <StatPill label="Current" value={curCurrent}                  unit="mA" />}
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
      title={enabled ? 'Disable notifications for this device' : 'Enable notifications for this device'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
        enabled
          ? 'bg-brand/10 text-brand hover:bg-brand/20'
          : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
      }`}
    >
      {enabled ? <Bell size={12} /> : <BellOff size={12} />}
      {enabled ? 'Notifying' : 'Notify me'}
    </button>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [imgError, setImgError] = useState(false);

  const { data: device, isLoading, error, isFetching } = useQuery({
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
        status: old.status.map((s: any) => {
          const cmd = commands.find((c) => c.code === s.code);
          return cmd ? { ...s, value: cmd.value } : s;
        }),
      }));
      return { previous };
    },
    onSuccess: () => setCmdError(null),
    onError: (e: any, _vars, ctx: any) => {
      queryClient.setQueryData(['device', id], ctx?.previous);
      setCmdError(e?.response?.data?.message ?? e?.message ?? 'Command failed');
    },
  });

  const meta = device ? (CATEGORY_META[device.category] ?? { label: device.category, Icon: Cpu }) : { label: '', Icon: Cpu };
  const iconUrl = device?.icon ? formatIconUrl(device.icon) : '';

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {isLoading && (
        <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-8 animate-pulse h-48" />
      )}

      {error && (
        <div className="bg-white dark:bg-[#1A222C] border border-red-200 dark:border-red-500/20 rounded-sm p-6 text-center">
          <p className="text-sm text-red-400">Failed to load device.</p>
        </div>
      )}

      {device && (
        <>
          {/* Device header */}
          <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6">
            <div className="flex items-center gap-4">
              <div className={`w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0 ${
                device.online ? 'bg-brand/10' : 'bg-slate-100 dark:bg-white/5'
              }`}>
                {iconUrl && !imgError ? (
                  <img src={iconUrl} alt={meta.label} className="w-10 h-10 object-contain" onError={() => setImgError(true)} />
                ) : (
                  <meta.Icon size={28} className={device.online ? 'text-brand' : 'text-slate-400'} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">{device.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-slate-400">{meta.label}</span>
                  <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    device.online
                      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10'
                      : 'bg-slate-100 text-slate-400 dark:bg-white/5'
                  }`}>
                    {device.online ? <Wifi size={10} /> : <WifiOff size={10} />}
                    {device.online ? 'Online' : 'Offline'}
                  </span>
                </div>
                {device.model && <p className="text-xs text-slate-400 mt-1">{device.model}</p>}
              </div>

              <div className="flex items-center gap-2">
                <NotifToggle deviceId={device.id} deviceName={device.name} />
                <button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['device', id] })}
                  className={`p-2 rounded-md text-slate-400 hover:text-brand hover:bg-brand/5 transition-colors ${isFetching ? 'animate-spin text-brand' : ''}`}
                  title="Refresh"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Command error */}
          {cmdError && (
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-sm px-5 py-3 flex items-center justify-between">
              <p className="text-sm text-red-500">{cmdError}</p>
              <button onClick={() => setCmdError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          )}

          {/* Controls */}
          {!device.online && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-sm px-5 py-3">
              <p className="text-sm text-amber-600 dark:text-amber-400">This device is offline. Controls are disabled until it reconnects.</p>
            </div>
          )}

          <DeviceControls device={device} sendCommand={sendCommand} isPending={isPending} />

          {/* Raw status */}
          {device.status?.length > 0 && <RawStatus status={device.status} />}
        </>
      )}
    </div>
  );
}
