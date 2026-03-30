import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  DoorOpen,
  Eye,
  EyeOff,
  Lightbulb,
  Phone,
  Plug,
  Plus,
  Shield,
  ShieldAlert,
  Thermometer,
  Trash2,
  Wind,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import ArmControls from '../components/ArmControls';
import { api } from '../lib/api';
import { AlarmSettings, useAlarmStore } from '../store/alarm.store';

// ── Types ─────────────────────────────────────────────────────────────────

type AlarmState = AlarmSettings['state'];
type AlarmAction = 'ENTRY_DELAY' | 'IMMEDIATE';

interface AlarmRule {
  id: string;
  deviceId: string;
  deviceName: string;
  triggerCode: string;
  triggerValue: unknown;
  activeInHome: boolean;
  activeInAway: boolean;
  action: AlarmAction;
  enabled: boolean;
}

interface StatusEntry {
  code: string;
  value: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, any> = {
  mcs: DoorOpen,
  pir: Eye,
  wsdcg: Thermometer,
  ywbj: ShieldAlert,
  cobj: ShieldAlert,
  kj: Wind,
  fs: Wind,
  cz: Plug,
  kg: Zap,
  dj: Lightbulb,
  dd: Lightbulb,
  xdd: Lightbulb,
};

const CATEGORY_LABELS: Record<string, string> = {
  mcs: 'Door Sensor',
  pir: 'Motion',
  wsdcg: 'Sensor',
  ywbj: 'Smoke',
  cobj: 'CO',
  cz: 'Socket',
  kg: 'Switch',
  dj: 'Light',
  dd: 'LED Strip',
  xdd: 'Ceiling Light',
  kj: 'Air Purifier',
  fs: 'Fan',
};

const STATE_META: Record<AlarmState, { label: string; color: string; bg: string }> = {
  DISARMED: { label: 'Disarmed', color: 'text-slate-400', bg: 'bg-slate-100 dark:bg-white/5' },
  ARMED_HOME: {
    label: 'Armed — Home',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
  },
  ARMED_AWAY: {
    label: 'Armed — Away',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-500/10',
  },
  EXIT_DELAY: {
    label: 'Exit Delay…',
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
  },
  ENTRY_DELAY: {
    label: 'Entry Delay…',
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-500/10',
  },
  TRIGGERED: { label: 'TRIGGERED', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
};

// Human-readable label for a trigger value
function _triggerLabel(code: string, value: unknown): string {
  if (typeof value === 'boolean') return value ? `${code} = ON` : `${code} = OFF`;
  return `${code} = ${String(value)}`;
}

// Friendly name for common codes
const CODE_NAMES: Record<string, string> = {
  doorcontact_state: 'Door contact',
  pir: 'Motion detected',
  smoke_sensor_state: 'Smoke sensor',
  co_state: 'CO sensor',
  switch: 'Switch',
  switch_1: 'Switch 1',
  switch_2: 'Switch 2',
  switch_led: 'LED switch',
  occupancy: 'Occupancy',
  alarm_state: 'Alarm state',
};

function codeName(code: string) {
  return CODE_NAMES[code] ?? code;
}

// ── Small shared UI ───────────────────────────────────────────────────────

function StatusBadge({ state }: { state: AlarmState }) {
  const meta = STATE_META[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${meta.color} ${meta.bg}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${state === 'TRIGGERED' ? 'bg-red-500 animate-pulse' : 'bg-current'}`}
      />
      {meta.label}
    </span>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-brand' : 'bg-slate-200 dark:bg-white/10'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`}
      />
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-brand text-white border-brand'
          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-brand/50'
      }`}
    >
      {children}
    </button>
  );
}

// ── Trigger Value Picker ──────────────────────────────────────────────────

function TriggerValuePicker({
  entry,
  value,
  onChange,
}: {
  entry: StatusEntry;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const current = entry.value;

  if (typeof current === 'boolean') {
    return (
      <div className="flex gap-2">
        <Chip active={value === true} onClick={() => onChange(true)}>
          {' '}
          ON{' '}
        </Chip>
        <Chip active={value === false} onClick={() => onChange(false)}>
          {' '}
          OFF{' '}
        </Chip>
      </div>
    );
  }

  if (typeof current === 'string') {
    // Show current value as an option + a text input
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Chip active={value === current} onClick={() => onChange(current)}>
            Current: &quot;{String(current)}&quot;
          </Chip>
        </div>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or type a specific value…"
          className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100"
        />
      </div>
    );
  }

  if (typeof current === 'number') {
    return (
      <input
        type="number"
        value={Number(value ?? current)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 w-32"
      />
    );
  }

  return (
    <input
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-1.5 text-sm w-full"
    />
  );
}

// ── Add Rule Modal ────────────────────────────────────────────────────────
// 3-step wizard: 1) pick device → 2) pick trigger → 3) configure conditions

type Step = 'device' | 'trigger' | 'conditions';

function AddTriggerActionModal({
  devices,
  onAdd,
  onClose,
}: {
  devices: any[];
  onAdd: (data: any) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'device' | 'code'>('device');
  const [device, setDevice] = useState<any | null>(null);
  const [entry, setEntry] = useState<StatusEntry | null>(null);
  const [value, setValue] = useState<unknown>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(
    () => devices.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())),
    [devices, search],
  );

  function selectDevice(d: any) {
    setDevice(d);
    setEntry(null);
    setValue(null);
    setStep('code');
  }

  function selectEntry(e: StatusEntry) {
    setEntry(e);
    setValue(typeof e.value === 'boolean' ? true : e.value);
  }

  function submit() {
    if (!device || !entry) return;
    onAdd({ deviceId: device.id, deviceName: device.name, statusCode: entry.code, value });
  }

  const Icon = device ? (CATEGORY_ICONS[device.category] ?? Cpu) : Cpu;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-[#1A222C] rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          {step === 'code' && (
            <button
              onClick={() => setStep('device')}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 -ml-1"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <h3 className="flex-1 text-base font-semibold text-slate-800 dark:text-slate-100">
            {step === 'device' ? 'Select Device' : 'Choose Command'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-3">
          {step === 'device' && (
            <>
              <input
                type="text"
                placeholder="Search devices…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                autoFocus
              />
              {filtered.map((d) => {
                const DIcon = CATEGORY_ICONS[d.category] ?? Cpu;
                return (
                  <button
                    key={d.id}
                    onClick={() => selectDevice(d)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-brand/50 hover:bg-brand/5 transition-colors text-left"
                  >
                    <DIcon size={16} className="text-brand flex-shrink-0" />
                    <span className="text-sm text-slate-800 dark:text-slate-100">{d.name}</span>
                  </button>
                );
              })}
            </>
          )}

          {step === 'code' && device && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="text-brand" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {device.name}
                </span>
              </div>
              {(device.status ?? []).map((s: StatusEntry) => (
                <button
                  key={s.code}
                  onClick={() => selectEntry(s)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                    entry?.code === s.code
                      ? 'border-brand bg-brand/5'
                      : 'border-slate-200 dark:border-white/10 hover:border-brand/50'
                  }`}
                >
                  <span className="text-sm text-slate-800 dark:text-slate-100 font-mono">
                    {s.code}
                  </span>
                  <span className="text-xs text-slate-400">{JSON.stringify(s.value)}</span>
                </button>
              ))}

              {entry && (
                <div className="mt-2 flex flex-col gap-2 p-3 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10">
                  <p className="text-xs text-slate-400">Set value to:</p>
                  {typeof entry.value === 'boolean' ? (
                    <div className="flex gap-2">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => setValue(v)}
                          className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${value === v ? 'bg-brand text-white border-brand' : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'}`}
                        >
                          {v ? 'On / Open' : 'Off / Closed'}
                        </button>
                      ))}
                    </div>
                  ) : typeof entry.value === 'number' ? (
                    <input
                      type="number"
                      value={value as number}
                      onChange={(e) => setValue(Number(e.target.value))}
                      className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={value as string}
                      onChange={(e) => setValue(e.target.value)}
                      className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {step === 'code' && entry && (
          <div className="px-6 pb-5 flex-shrink-0">
            <button
              onClick={submit}
              className="w-full py-3 bg-brand text-white rounded-xl font-semibold"
            >
              Add Action
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AddRuleModal({
  devices,
  existingDeviceIds,
  onAdd,
  onClose,
}: {
  devices: any[];
  existingDeviceIds: Set<string>;
  onAdd: (data: Omit<AlarmRule, 'id' | 'enabled'>) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('device');
  const [device, setDevice] = useState<any | null>(null);
  const [triggerEntry, setTriggerEntry] = useState<StatusEntry | null>(null);
  const [triggerValue, setTriggerValue] = useState<unknown>(null);
  const [activeInHome, setActiveInHome] = useState(false);
  const [activeInAway, setActiveInAway] = useState(true);
  const [action, setAction] = useState<AlarmAction>('ENTRY_DELAY');
  const [search, setSearch] = useState('');

  const filteredDevices = useMemo(
    () =>
      devices.filter(
        (d) => !existingDeviceIds.has(d.id) && d.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [devices, existingDeviceIds, search],
  );

  // Status codes that make sense as alarm triggers (boolean or string states, not numerics like brightness)
  const triggerCandidates: StatusEntry[] = useMemo(() => {
    if (!device) return [];
    return (device.status ?? []).filter((s: StatusEntry) => {
      // Skip pure numeric control codes (brightness, temp_set, etc.)
      const skip = [
        'bright_value',
        'temp_value',
        'bright_value_v2',
        'countdown',
        'countdown_1',
        'countdown_2',
        'work_power',
        'cur_current',
        'cur_voltage',
        'cur_power',
        'add_ele',
        'temp_set',
        'humidity_set',
      ];
      return !skip.includes(s.code);
    });
  }, [device]);

  function selectDevice(d: any) {
    setDevice(d);
    setTriggerEntry(null);
    setTriggerValue(null);
    setStep('trigger');
  }

  function selectTrigger(entry: StatusEntry) {
    setTriggerEntry(entry);
    // Smart defaults: for booleans default to true (ON/open/detected)
    const defaultVal = typeof entry.value === 'boolean' ? true : entry.value;
    setTriggerValue(defaultVal);
    setStep('conditions');
  }

  function submit() {
    if (!device || !triggerEntry) return;
    onAdd({
      deviceId: device.id,
      deviceName: device.name,
      triggerCode: triggerEntry.code,
      triggerValue,
      activeInHome,
      activeInAway,
      action,
    });
  }

  const stepTitles: Record<Step, string> = {
    device: 'Select Device',
    trigger: 'Choose Trigger',
    conditions: 'Set Conditions',
  };

  function back() {
    if (step === 'trigger') setStep('device');
    if (step === 'conditions') setStep('trigger');
  }

  const Icon = device ? (CATEGORY_ICONS[device.category] ?? Cpu) : Cpu;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="bg-white dark:bg-[#1A222C] rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          {step !== 'device' && (
            <button
              onClick={back}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 -ml-1"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {stepTitles[step]}
            </h3>
            {/* Step dots */}
            <div className="flex gap-1.5 mt-1">
              {(['device', 'trigger', 'conditions'] as Step[]).map((s, i) => (
                <span
                  key={s}
                  className={`h-1 rounded-full transition-all ${
                    s === step
                      ? 'w-4 bg-brand'
                      : i < ['device', 'trigger', 'conditions'].indexOf(step)
                        ? 'w-2 bg-brand/40'
                        : 'w-2 bg-slate-200 dark:bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Device */}
          {step === 'device' && (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Search devices…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100 w-full"
              />
              {filteredDevices.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No devices found.</p>
              ) : (
                filteredDevices.map((d) => {
                  const DIcon = CATEGORY_ICONS[d.category] ?? Cpu;
                  return (
                    <button
                      key={d.id}
                      onClick={() => selectDevice(d)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-brand/40 hover:bg-brand/5 transition-colors text-left"
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          d.online ? 'bg-brand/10' : 'bg-slate-100 dark:bg-white/5'
                        }`}
                      >
                        <DIcon size={16} className={d.online ? 'text-brand' : 'text-slate-400'} />
                      </div>
                      <div className="flex-1 min-w-0 flex-wrap">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {d.name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {CATEGORY_LABELS[d.category] ?? d.category}
                        </p>
                      </div>
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${d.online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`}
                      />
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Step 2: Trigger */}
          {step === 'trigger' && device && (
            <div className="flex flex-col gap-3">
              {/* Selected device recap */}
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-white/5 rounded-lg mb-1">
                <Icon size={15} className="text-brand" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {device.name}
                </span>
              </div>

              <p className="text-xs text-slate-400 uppercase tracking-widest">
                Choose what triggers the alarm
              </p>

              {triggerCandidates.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  No trigger-able status codes found on this device.
                </p>
              ) : (
                triggerCandidates.map((entry) => (
                  <button
                    key={entry.code}
                    onClick={() => selectTrigger(entry)}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/10 hover:border-brand/40 hover:bg-brand/5 transition-colors text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {codeName(entry.code)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Current: <span className="font-mono">{JSON.stringify(entry.value)}</span>
                      </p>
                    </div>
                    <span className="text-xs text-slate-300 dark:text-slate-600 font-mono">
                      {entry.code}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 3: Conditions */}
          {step === 'conditions' && device && triggerEntry && (
            <div className="flex flex-col gap-6">
              {/* Recap */}
              <div className="flex flex-col gap-1 p-3 bg-slate-50 dark:bg-white/5 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-brand" />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {device.name}
                  </span>
                </div>
                <p className="text-xs text-slate-400 pl-5">{codeName(triggerEntry.code)}</p>
              </div>

              {/* Trigger value */}
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400 uppercase tracking-widest">
                  Triggers when value is
                </p>
                <TriggerValuePicker
                  entry={triggerEntry}
                  value={triggerValue}
                  onChange={setTriggerValue}
                />
              </div>

              {/* Active states */}
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400 uppercase tracking-widest">
                  Active when armed
                </p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        Armed Home
                      </p>
                      <p className="text-xs text-slate-400">Active even when you're inside</p>
                    </div>
                    <Toggle value={activeInHome} onChange={setActiveInHome} />
                  </label>
                  <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-white/10 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        Armed Away
                      </p>
                      <p className="text-xs text-slate-400">Active when you leave</p>
                    </div>
                    <Toggle value={activeInAway} onChange={setActiveInAway} />
                  </label>
                </div>
                {!activeInHome && !activeInAway && (
                  <p className="text-xs text-amber-500">Select at least one arm mode.</p>
                )}
              </div>

              {/* Action */}
              <div className="flex flex-col gap-3">
                <p className="text-xs text-slate-400 uppercase tracking-widest">When triggered</p>
                <div className="flex flex-col gap-2">
                  {[
                    {
                      value: 'ENTRY_DELAY' as AlarmAction,
                      label: 'Entry Delay',
                      desc: 'Countdown before alarm fires. You have time to disarm.',
                    },
                    {
                      value: 'IMMEDIATE' as AlarmAction,
                      label: 'Immediate Alarm',
                      desc: 'Alarm fires instantly. Best for smoke / CO / glass break.',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAction(opt.value)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        action === opt.value
                          ? 'border-brand bg-brand/5'
                          : 'border-slate-200 dark:border-white/10 hover:border-brand/30'
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                          action === opt.value
                            ? 'border-brand bg-brand'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {opt.label}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'conditions' && (
          <div className="px-6 pb-6 pt-3 border-t border-slate-200 dark:border-white/10 flex-shrink-0">
            <button
              onClick={submit}
              disabled={!activeInHome && !activeInAway}
              className="w-full py-3 bg-brand text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors"
            >
              Add Rule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rule Card ─────────────────────────────────────────────────────────────

function RuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: AlarmRule;
  onUpdate: (patch: Partial<AlarmRule>) => void;
  onDelete: () => void;
}) {
  const _Icon = CATEGORY_ICONS['mcs'] ?? Cpu; // fallback; could store category in rule

  return (
    <div
      className={`bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-4 transition-opacity ${!rule.enabled && 'opacity-50'}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
          <Shield size={15} className="text-brand" />
        </div>

        <div className="flex-1 min-w-0 flex-wrap">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {rule.deviceName}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Toggle value={rule.enabled} onChange={(v) => onUpdate({ enabled: v })} />
              <button
                onClick={onDelete}
                className="p-1 text-slate-300 hover:text-red-400 dark:text-slate-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            {codeName(rule.triggerCode)} = {JSON.stringify(rule.triggerValue)}
          </p>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[11px] text-slate-400 uppercase tracking-widest">Active</span>
            <Chip
              active={rule.activeInHome}
              onClick={() => onUpdate({ activeInHome: !rule.activeInHome })}
            >
              Home
            </Chip>
            <Chip
              active={rule.activeInAway}
              onClick={() => onUpdate({ activeInAway: !rule.activeInAway })}
            >
              Away
            </Chip>
            <span className="ml-auto">
              <Chip
                active={rule.action === 'ENTRY_DELAY'}
                onClick={() => onUpdate({ action: 'ENTRY_DELAY' })}
              >
                Delay
              </Chip>
            </span>
            <Chip
              active={rule.action === 'IMMEDIATE'}
              onClick={() => onUpdate({ action: 'IMMEDIATE' })}
            >
              Instant
            </Chip>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PIN Section ───────────────────────────────────────────────────────────

function PinSection({ hasPinHash }: { hasPinHash: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (p: string) => api.post('/alarm/pin', { pin: p }),
    onSuccess: () => {
      setSaved(true);
      setEditing(false);
      setPin('');
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Alarm PIN</p>
          <p className="text-xs text-slate-400 mt-0.5">Required to disarm when armed away</p>
        </div>
        {saved && (
          <span className="flex items-center gap-1 text-emerald-500 text-xs">
            <Check size={12} /> Saved
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={visible ? 'text' : 'password'}
              placeholder="4–8 digits"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100 pr-10"
            />
            <button
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
            >
              {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={() => save.mutate(pin)}
            disabled={pin.length < 4 || save.isPending}
            className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setPin('');
            }}
            className="px-3 py-2 border border-slate-200 dark:border-white/10 rounded-md text-sm text-slate-400"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="self-start flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-md text-sm text-slate-600 dark:text-slate-300 hover:border-brand/50 hover:text-brand transition-colors"
        >
          <Shield size={14} />
          {hasPinHash ? 'Change PIN' : 'Set PIN'}
        </button>
      )}
    </div>
  );
}

// ── Phone Notifications Section ───────────────────────────────────────────
// Unified flow: enable → credentials → verify phone → call toggle

function PhoneNotificationsSection({
  settings,
  onRefresh,
  onUpdate,
}: {
  settings: any;
  onRefresh: () => void;
  onUpdate: (data: any) => void;
}) {
  const enabled = settings?.callOnTrigger ?? false;
  const configured = settings?.infobipConfigured ?? false;
  const currentPhone = settings?.phoneNumber ?? null;

  // Credentials form state
  const [editingCreds, setEditingCreds] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(settings?.infobipBaseUrl ?? '');
  const [sender, setSender] = useState(settings?.infobipSender ?? 'Domo');

  // OTP flow state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');

  const saveCreds = useMutation({
    mutationFn: () =>
      api.patch('/alarm/display', {
        infobipApiKey: apiKey,
        infobipBaseUrl: baseUrl,
        infobipSender: sender,
      }),
    onSuccess: () => {
      setEditingCreds(false);
      setApiKey('');
      onRefresh();
    },
  });

  const sendOtp = useMutation({
    mutationFn: () => api.post('/alarm/phone/send-otp', { phoneNumber: phone }),
    onSuccess: () => {
      setOtpSent(true);
      setOtpError('');
    },
    onError: () => setOtpError('Failed to send code. Check the number and try again.'),
  });

  const verifyOtp = useMutation({
    mutationFn: () => api.post('/alarm/phone/verify-otp', { otp }),
    onSuccess: (res) => {
      if (res.data.verified) {
        setEditingPhone(false);
        setOtpSent(false);
        setPhone('');
        setOtp('');
        setOtpError('');
        onRefresh();
      } else {
        setOtpError('Invalid code. Please try again.');
      }
    },
    onError: () => setOtpError('Verification failed. Please try again.'),
  });

  const inputCls =
    'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100 w-full';

  return (
    <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6 flex flex-col gap-5">
      {/* Header row with enable toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
            <Phone size={15} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Phone notifications
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Receive a call when the alarm is triggered
            </p>
          </div>
        </div>
        <Toggle value={enabled} onChange={() => onUpdate({ callOnTrigger: !enabled })} />
      </div>

      {/* Only show the rest when enabled */}
      {enabled && (
        <>
          <hr className="border-slate-200 dark:border-white/10" />

          {/* Step 1 — Infobip credentials */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  Step 1 — Infobip credentials
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  API key, base URL and sender name from your Infobip account
                </p>
              </div>
              {configured && !editingCreds && (
                <span className="flex items-center gap-1 text-emerald-500 text-xs shrink-0">
                  <Check size={12} /> Configured
                </span>
              )}
            </div>

            {!editingCreds ? (
              <button
                onClick={() => {
                  setBaseUrl(settings?.infobipBaseUrl ?? '');
                  setSender(settings?.infobipSender ?? 'Domo');
                  setApiKey('');
                  setEditingCreds(true);
                }}
                className="self-start flex items-center gap-2 px-3 py-1.5 border border-slate-200 dark:border-white/10 rounded-md text-xs text-slate-600 dark:text-slate-300 hover:border-brand/50 hover:text-brand transition-colors"
              >
                {configured ? 'Update credentials' : 'Enter credentials'}
              </button>
            ) : (
              <div className="flex flex-col gap-3 p-4 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">API Key</label>
                  <input
                    type="password"
                    placeholder="Your Infobip API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Base URL</label>
                  <input
                    type="text"
                    placeholder="https://xxxxx.api.infobip.com"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className={`${inputCls} font-mono`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-400">Sender name</label>
                  <input
                    type="text"
                    placeholder="Domo"
                    value={sender}
                    onChange={(e) => setSender(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveCreds.mutate()}
                    disabled={!apiKey || !baseUrl || saveCreds.isPending}
                    className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-40"
                  >
                    {saveCreds.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingCreds(false)}
                    className="px-3 py-2 border border-slate-200 dark:border-white/10 rounded-md text-sm text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Step 2 — Verify phone (only after credentials are set) */}
          {configured && (
            <>
              <hr className="border-slate-200 dark:border-white/10" />
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      Step 2 — Verify phone number
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      We'll send a 6-digit SMS code to confirm
                    </p>
                  </div>
                  {currentPhone && !editingPhone && (
                    <span className="flex items-center gap-1 text-emerald-500 text-xs shrink-0">
                      <Check size={12} /> Verified
                    </span>
                  )}
                </div>

                {currentPhone && !editingPhone && (
                  <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Phone size={13} className="text-brand" />
                      <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">
                        {currentPhone}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingPhone(true);
                        setOtpSent(false);
                        setPhone('');
                        setOtp('');
                        setOtpError('');
                      }}
                      className="text-xs text-slate-400 hover:text-brand transition-colors"
                    >
                      Change
                    </button>
                  </div>
                )}

                {(!currentPhone || editingPhone) && !otpSent && (
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      placeholder="+30 69..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                    />
                    <button
                      onClick={() => sendOtp.mutate()}
                      disabled={phone.length < 7 || sendOtp.isPending}
                      className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-40 whitespace-nowrap"
                    >
                      {sendOtp.isPending ? 'Sending…' : 'Send code'}
                    </button>
                    {editingPhone && (
                      <button
                        onClick={() => setEditingPhone(false)}
                        className="px-3 py-2 border border-slate-200 dark:border-white/10 rounded-md text-sm text-slate-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                {otpSent && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-slate-400">
                      Code sent to{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-200">{phone}</span>.{' '}
                      <button
                        onClick={() => setOtpSent(false)}
                        className="text-brand hover:underline"
                      >
                        Change number
                      </button>
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="6-digit code"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="flex-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-sm text-slate-800 dark:text-slate-100 tracking-widest font-mono"
                      />
                      <button
                        onClick={() => verifyOtp.mutate()}
                        disabled={otp.length !== 6 || verifyOtp.isPending}
                        className="px-4 py-2 bg-brand text-white rounded-md text-sm font-medium disabled:opacity-40"
                      >
                        {verifyOtp.isPending ? 'Verifying…' : 'Verify'}
                      </button>
                    </div>
                  </div>
                )}

                {otpError && <p className="text-xs text-red-500">{otpError}</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AlarmPage() {
  const queryClient = useQueryClient();
  const { settings: storeSettings, setSettings } = useAlarmStore();
  const [addingRule, setAddingRule] = useState(false);
  const [addingTriggerAction, setAddingTriggerAction] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(true);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 60_000,
  });
  const isOwner = me?.role === 'OWNER';

  const { data: alarmSettings } = useQuery({
    queryKey: ['alarm'],
    queryFn: () =>
      api.get('/alarm').then((r) => {
        setSettings(r.data);
        return r.data as AlarmSettings & { pinHash?: string | null };
      }),
    staleTime: 30_000,
  });

  const { data: rules = [], refetch: refetchRules } = useQuery<AlarmRule[]>({
    queryKey: ['alarm-rules'],
    queryFn: () => api.get('/alarm/rules').then((r) => r.data),
  });

  const { data: devices = [] } = useQuery<any[]>({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
    staleTime: 60_000,
  });

  const currentState: AlarmState = storeSettings?.state ?? alarmSettings?.state ?? 'DISARMED';
  const hasPinSet = !!alarmSettings?.pinHash;

  const createRule = useMutation({
    mutationFn: (data: any) => api.post('/alarm/rules', data),
    onSuccess: () => {
      refetchRules();
      setAddingRule(false);
    },
  });

  const updateRule = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) =>
      api.patch(`/alarm/rules/${id}`, patch),
    onSuccess: () => refetchRules(),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.delete(`/alarm/rules/${id}`),
    onSuccess: () => refetchRules(),
  });

  const updateDelay = useMutation({
    mutationFn: (data: any) =>
      api.patch('/alarm/display', data).then((r) => {
        setSettings(r.data);
        return r.data;
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alarm'] }),
  });

  const { data: triggerActions = [], refetch: refetchTriggerActions } = useQuery<any[]>({
    queryKey: ['alarm-trigger-actions'],
    queryFn: () => api.get('/alarm/trigger-actions').then((r) => r.data),
  });

  const createTriggerAction = useMutation({
    mutationFn: (data: any) => api.post('/alarm/trigger-actions', data),
    onSuccess: () => {
      refetchTriggerActions();
      setAddingTriggerAction(false);
    },
  });

  const deleteTriggerAction = useMutation({
    mutationFn: (id: string) => api.delete(`/alarm/trigger-actions/${id}`),
    onSuccess: () => refetchTriggerActions(),
  });

  const existingDeviceIds = new Set(rules.map((r) => r.deviceId));

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Alarm System</h1>

      {/* Status & Controls */}
      <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400 uppercase tracking-widest">Status</p>
            <StatusBadge state={currentState} />
          </div>
          <ArmControls currentState={currentState} hasPinSet={hasPinSet} />
        </div>
        {currentState === 'EXIT_DELAY' && (
          <p className="mt-4 text-sm text-amber-500 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-4 py-2.5">
            Exit delay active — leave now.
          </p>
        )}
        {currentState === 'TRIGGERED' && (
          <p className="mt-4 text-sm text-red-500 bg-red-50 dark:bg-red-500/10 rounded-lg px-4 py-2.5">
            ⚠ Alarm triggered. Go to the panel to disarm with your PIN.
          </p>
        )}
      </div>

      {/* Trigger Rules — owner only */}
      {isOwner && (
        <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                Trigger Rules
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Device conditions that trigger the alarm
              </p>
            </div>
            <button
              onClick={() => setAddingRule(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-md text-xs font-medium hover:bg-brand/90 transition-colors"
            >
              <Plus size={13} /> Add Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <ShieldAlert size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No rules yet.</p>
              <p className="text-xs mt-1">Add sensor rules to trigger the alarm.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onUpdate={(patch) => updateRule.mutate({ id: rule.id, patch })}
                  onDelete={() => deleteRule.mutate(rule.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* On Trigger Actions — owner only */}
      {isOwner && (
        <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                On Trigger — Actions
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Device commands to execute when the alarm fires
              </p>
            </div>
            <button
              onClick={() => setAddingTriggerAction(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-md text-xs font-medium hover:bg-brand/90 transition-colors"
            >
              <Plus size={13} /> Add Action
            </button>
          </div>

          {triggerActions.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Zap size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No actions yet.</p>
              <p className="text-xs mt-1">e.g. turn on a siren or flash lights when triggered.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {triggerActions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200 dark:border-white/10"
                >
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      {action.deviceName}
                    </p>
                    <p className="text-xs text-slate-400 font-mono">
                      {action.statusCode} = {JSON.stringify(action.value)}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteTriggerAction.mutate(action.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Security Settings — owner only */}
      {isOwner && (
        <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm">
          <button
            onClick={() => setSecurityOpen((o) => !o)}
            className="w-full flex items-center justify-between px-6 py-4"
          >
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
              Security Settings
            </h2>
            {securityOpen ? (
              <ChevronUp size={16} className="text-slate-400" />
            ) : (
              <ChevronDown size={16} className="text-slate-400" />
            )}
          </button>

          {securityOpen && (
            <div className="px-6 pb-6 flex flex-col gap-6 border-t border-slate-200 dark:border-white/10 pt-5">
              <PinSection hasPinHash={!!alarmSettings?.pinHash} />

              <hr className="border-slate-200 dark:border-white/10" />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Exit delay
                    </p>
                    <p className="text-xs text-slate-400">Time to leave after arming Away</p>
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {alarmSettings?.exitDelaySecs ?? 30}s
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={alarmSettings?.exitDelaySecs ?? 30}
                  onChange={(e) => updateDelay.mutate({ exitDelaySecs: Number(e.target.value) })}
                  className="w-full accent-brand"
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                      Entry delay
                    </p>
                    <p className="text-xs text-slate-400">Time to disarm after sensor triggers</p>
                  </div>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    {alarmSettings?.entryDelaySecs ?? 30}s
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={alarmSettings?.entryDelaySecs ?? 30}
                  onChange={(e) => updateDelay.mutate({ entryDelaySecs: Number(e.target.value) })}
                  className="w-full accent-brand"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Phone notifications — owner only */}
      {isOwner && (
        <PhoneNotificationsSection
          settings={alarmSettings}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ['alarm'] })}
          onUpdate={(data) => updateDelay.mutate(data)}
        />
      )}

      {isOwner && addingRule && (
        <AddRuleModal
          devices={devices}
          existingDeviceIds={existingDeviceIds}
          onAdd={(data) => createRule.mutate(data)}
          onClose={() => setAddingRule(false)}
        />
      )}

      {isOwner && addingTriggerAction && (
        <AddTriggerActionModal
          devices={devices}
          onAdd={(data) => createTriggerAction.mutate(data)}
          onClose={() => setAddingTriggerAction(false)}
        />
      )}
    </div>
  );
}
