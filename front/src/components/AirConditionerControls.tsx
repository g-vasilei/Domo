import { useQuery } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Fan,
  Minus,
  Plus,
  SlidersHorizontal,
  Snowflake,
  Sun,
  Wind,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';

interface Capability {
  code: string;
  type: string;
  values: string | Record<string, unknown>;
}
type Command = { code: string; value: unknown };

const LABELS: Record<string, string> = {
  switch: 'Power',
  temp_set: 'Target temperature',
  temp_set_f: 'Target temperature (°F)',
  mode: 'Operating mode',
  work_mode: 'Operating mode',
  fan_speed_enum: 'Fan speed',
  fan_speed: 'Fan speed',
  windspeed: 'Fan speed',
  fan_speed_percent: 'Fan speed',
  anion: 'Ionizer',
  display: 'Display light',
  gear_vertical: 'Vertical louver position',
  switch_horizontal: 'Horizontal swing',
  switch_vertical: 'Vertical swing',
  swing: 'Swing',
  sleep: 'Sleep mode',
  switch_sleep: 'Sleep mode',
  eco: 'Eco mode',
  switch_eco: 'Eco mode',
  turbo: 'Turbo',
  switch_turbo: 'Turbo',
  switch_led: 'Display light',
  light: 'Display light',
  temp_unit_convert: 'Temperature unit',
  child_lock: 'Child lock',
  clean: 'Self cleaning',
  switch_clean: 'Self cleaning',
  wet: 'Dehumidification',
  health: 'Health mode',
};
const OPTIONS: Record<string, string> = {
  cold: 'Cooling',
  cool: 'Cooling',
  hot: 'Heating',
  heat: 'Heating',
  wet: 'Dry',
  dry: 'Dry',
  wind: 'Fan only',
  fan: 'Fan only',
  auto: 'Automatic',
  low: 'Low',
  mid: 'Medium',
  middle: 'Medium',
  medium: 'Medium',
  high: 'High',
  strong: 'Turbo',
  quiet: 'Quiet',
  mute: 'Silent',
  sleep: 'Sleep',
  off: 'Off',
  on: 'On',
};
function label(code: string) {
  return LABELS[code] ?? code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
function metadata(capability: Capability): any {
  try {
    return typeof capability.values === 'string'
      ? JSON.parse(capability.values)
      : (capability.values ?? {});
  } catch {
    return {};
  }
}

function Control({
  capability,
  value,
  disabled,
  send,
}: {
  capability: Capability;
  value: unknown;
  disabled: boolean;
  send: (commands: Command[]) => void;
}) {
  const { code } = capability;
  const spec = metadata(capability);
  const type = capability.type.toLowerCase();
  const [draft, setDraft] = useState(
    typeof value === 'number' ? String(value / 10 ** (spec.scale ?? 0)) : '',
  );
  useEffect(() => {
    setDraft(typeof value === 'number' ? String(value / 10 ** (spec.scale ?? 0)) : '');
  }, [value, spec.scale]);
  const common =
    'transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-40';
  let input;
  if (type === 'boolean') {
    input = (
      <button
        type="button"
        role="switch"
        aria-label={label(code)}
        aria-checked={value === true}
        disabled={disabled}
        onClick={() => send([{ code, value: value !== true }])}
        className={`${common} relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border ${value === true ? 'border-brand bg-brand shadow-sm shadow-brand/20' : 'border-slate-200 bg-slate-200/80 dark:border-slate-600 dark:bg-slate-700'}`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${value === true ? 'translate-x-6' : 'translate-x-0.5'}`}
        />
      </button>
    );
  } else if (type === 'enum' && Array.isArray(spec.range) && spec.range.length) {
    const Icon =
      code.includes('fan') || code === 'windspeed'
        ? Fan
        : code.includes('mode')
          ? ['hot', 'heat'].includes(String(value))
            ? Sun
            : ['cold', 'cool'].includes(String(value))
              ? Snowflake
              : Wind
          : SlidersHorizontal;
    input = (
      <div className="relative w-full sm:w-52 shrink-0 group">
        <Icon
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand dark:text-indigo-400"
        />
        <select
          aria-label={label(code)}
          className={`${common} h-12 w-full appearance-none rounded-xl border border-slate-200/80 bg-white pl-10 pr-10 text-sm font-medium text-slate-700 shadow-sm hover:border-brand/40 hover:bg-slate-50 focus-visible:border-brand dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:border-brand/50`}
          value={typeof value === 'string' ? value : ''}
          disabled={disabled}
          onChange={(e) => send([{ code, value: e.target.value }])}
        >
          <option value="" disabled>
            Select…
          </option>
          {spec.range.map((option: string) => (
            <option
              key={option}
              value={option}
              className="bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            >
              {OPTIONS[option] ?? label(option)}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          size={15}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-brand"
        />
      </div>
    );
  } else if (type === 'integer' && Number.isFinite(spec.min) && Number.isFinite(spec.max)) {
    const factor = 10 ** (spec.scale ?? 0);
    const min = spec.min / factor;
    const max = spec.max / factor;
    const step = (spec.step || 1) / factor;
    const changeByStep = (direction: number) => {
      const current = draft === '' ? spec.min : Math.round(Number(draft) * factor);
      const next = Math.min(spec.max, Math.max(spec.min, current + direction * (spec.step || 1)));
      setDraft(String(next / factor));
    };
    const changed = draft !== '' && Number(draft) * factor !== value;
    input = (
      <form
        className="flex w-full sm:w-auto items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = Math.round(Number(draft) * factor);
          if (
            draft !== '' &&
            raw >= spec.min &&
            raw <= spec.max &&
            (raw - spec.min) % (spec.step || 1) === 0
          )
            send([{ code, value: raw }]);
        }}
      >
        <div className="flex h-12 flex-1 sm:flex-none items-center rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 shadow-sm transition-all focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/10 dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            aria-label={`Decrease ${label(code).toLowerCase()}`}
            disabled={disabled || (draft !== '' && Number(draft) <= min)}
            onClick={() => changeByStep(-1)}
            className={`${common} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm hover:bg-brand/10 hover:text-brand dark:bg-white/5 dark:text-slate-300`}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <div className="flex flex-1 items-baseline justify-center gap-0.5 px-1">
            <input
              aria-label={label(code)}
              type="number"
              required
              min={min}
              max={max}
              step={step}
              value={draft}
              placeholder="—"
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 w-12 appearance-none bg-transparent text-center text-lg font-semibold tabular-nums text-slate-800 outline-none disabled:opacity-40 dark:text-white [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {spec.unit && (
              <span className="pr-1 text-xs font-medium text-slate-400">{spec.unit}</span>
            )}
          </div>
          <button
            type="button"
            aria-label={`Increase ${label(code).toLowerCase()}`}
            disabled={disabled || (draft !== '' && Number(draft) >= max)}
            onClick={() => changeByStep(1)}
            className={`${common} flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm hover:bg-brand/10 hover:text-brand dark:bg-white/5 dark:text-slate-300`}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
        <button
          type="submit"
          disabled={disabled || !changed}
          className={`${common} flex h-12 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold ${changed ? 'bg-brand text-white shadow-sm shadow-brand/20 hover:bg-brand/90' : 'bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500'}`}
        >
          <Check size={14} aria-hidden="true" /> Apply
        </button>
      </form>
    );
  } else {
    return (
      <div className="py-3 text-xs text-slate-400">
        {label(code)}: {String(value ?? 'Unknown')} · No standard control available (
        {capability.type})
      </div>
    );
  }
  return (
    <div
      className={`flex gap-3 py-5 ${type === 'boolean' ? 'items-center justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between'}`}
    >
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label(code)}</p>
        <p className="text-xs text-slate-400 mt-1">
          {typeof value === 'boolean'
            ? value
              ? 'On'
              : 'Off'
            : value === undefined
              ? 'Awaiting device status'
              : type === 'integer'
                ? `${Number(value) / 10 ** (spec.scale ?? 0)} ${spec.unit ?? ''}`
                : (OPTIONS[String(value)] ?? String(value))}
        </p>
      </div>
      {input}
    </div>
  );
}

export default function AirConditionerControls({
  device,
  disabled,
  send,
}: {
  device: { id: string; status?: Command[] };
  disabled: boolean;
  send: (commands: Command[]) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['device-specifications', device.id],
    queryFn: () => api.get(`/devices/${device.id}/specifications`).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const functions: Capability[] = data?.functions ?? [];
  // Keep known AC switches available if capability discovery is unavailable.
  // Enum choices and numeric limits must still come from device specifications.
  const fallbackFunctions: Capability[] = (device.status ?? [])
    .filter((entry) => entry.code in LABELS && typeof entry.value === 'boolean')
    .map((entry) => ({ code: entry.code, type: 'Boolean', values: {} }));
  const availableFunctions = functions.length ? functions : fallbackFunctions;
  const errorMessage = (error as any)?.response?.data?.message ?? (error as Error)?.message;

  const priority = [
    'switch',
    'temp_set',
    'temp_set_f',
    'mode',
    'work_mode',
    'fan_speed_enum',
    'fan_speed',
    'switch_vertical',
    'switch_horizontal',
  ];
  const sorted = [...availableFunctions].sort((a, b) => {
    const rank = (code: string) =>
      priority.includes(code) ? priority.indexOf(code) : priority.length;
    return rank(a.code) - rank(b.code);
  });
  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6">
      <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">
        Air conditioner
      </h3>
      {isLoading && <p className="text-sm text-slate-400">Loading supported controls…</p>}
      {isError && (
        <div role="alert" className="space-y-2 text-sm text-amber-600 dark:text-amber-400">
          <p>Advanced controls could not be loaded. Available switches are shown below.</p>
          {errorMessage && <p className="text-xs break-words">{errorMessage}</p>}
          <button onClick={() => refetch()} className="underline">
            Retry
          </button>
        </div>
      )}
      {!isLoading && !isError && !functions.length && (
        <p className="text-sm text-slate-400">Tuya has not exposed any controls for this device.</p>
      )}
      <div className="divide-y divide-slate-200 dark:divide-white/10">
        {sorted.map((capability) => (
          <Control
            key={capability.code}
            capability={capability}
            disabled={disabled}
            send={send}
            value={device.status?.find((s) => s.code === capability.code)?.value}
          />
        ))}
      </div>
    </div>
  );
}
