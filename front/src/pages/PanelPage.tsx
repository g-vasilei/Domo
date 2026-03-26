import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Delete,Home, LogOut, Shield, ShieldAlert, ShieldOff } from 'lucide-react';
import { useCallback,useEffect, useState } from 'react';

import { api } from '../lib/api';
import { useCountdownSound } from '../lib/useCountdownSound';
import { AlarmSettings,secondsLeft, useAlarmStore } from '../store/alarm.store';

function useAlarmSettings() {
  const { setSettings } = useAlarmStore();
  return useQuery({
    queryKey: ['alarm'],
    queryFn: () =>
      api.get('/alarm').then((r) => {
        setSettings(r.data);
        return r.data as AlarmSettings;
      }),
    staleTime: 60_000,
  });
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useSecondsLeft(settings: AlarmSettings | null) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!settings) return;
    const update = () => setSecs(secondsLeft(settings));
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [settings]);
  return secs;
}

// ── PIN Pad ──────────────────────────────────────────────────────────────────
function PinPad({ onConfirm, label }: { onConfirm: (pin: string) => void; label: string }) {
  const [pin, setPin] = useState('');

  const press = useCallback((digit: string) => {
    setPin((p) => (p.length < 8 ? p + digit : p));
  }, []);

  const del = useCallback(() => setPin((p) => p.slice(0, -1)), []);

  const confirm = useCallback(() => {
    if (pin.length >= 4) {
      onConfirm(pin);
      setPin('');
    }
  }, [pin, onConfirm]);

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-slate-400 text-sm tracking-widest uppercase">{label}</p>

      {/* dots */}
      <div className="flex gap-3">
        {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              i < pin.length ? 'bg-white border-white' : 'border-slate-600'
            }`}
          />
        ))}
      </div>

      {/* keypad */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-xl font-semibold transition-colors"
          >
            {d}
          </button>
        ))}
        <button
          onClick={del}
          className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        >
          <Delete size={20} />
        </button>
        <button
          onClick={() => press('0')}
          className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white text-xl font-semibold transition-colors"
        >
          0
        </button>
        <button
          onClick={confirm}
          disabled={pin.length < 4}
          className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-white text-sm font-bold transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  );
}

// ── Clock + sensors ──────────────────────────────────────────────────────────
function InfoDisplay({ settings, now }: { settings: AlarmSettings; now: Date }) {
  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get('/devices').then((r) => r.data),
    staleTime: 30_000,
  });

  function getSensorValue(deviceId: string | null, code: string): number | undefined {
    if (!deviceId || !devices) return undefined;
    const device = devices.find((d: any) => d.id === deviceId);
    return device?.status?.find((s: any) => s.code === code)?.value;
  }

  function fmt(val: number | undefined, threshold: number) {
    if (val === undefined) return null;
    return val > threshold ? (val / 10).toFixed(1) : val;
  }

  const temp = fmt(
    getSensorValue(settings.tempDeviceId, 'temp_current') ??
      getSensorValue(settings.tempDeviceId, 'va_temperature'),
    500,
  );
  const humidity = fmt(
    getSensorValue(settings.humidDeviceId, 'humidity_value') ??
      getSensorValue(settings.humidDeviceId, 'va_humidity'),
    100,
  );

  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      {settings.showClock && (
        <>
          <p className="text-8xl md:text-9xl font-bold text-white tracking-tight tabular-nums">
            {timeStr}
          </p>
          <p className="text-slate-400 text-lg capitalize">{dateStr}</p>
        </>
      )}
      <div className="flex gap-8 mt-2">
        {settings.showTemp && temp !== null && (
          <div className="text-center">
            <p className="text-4xl font-semibold text-white">{temp}°</p>
            <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest">Temp</p>
          </div>
        )}
        {settings.showHumidity && humidity !== null && (
          <div className="text-center">
            <p className="text-4xl font-semibold text-white">{humidity}%</p>
            <p className="text-slate-500 text-xs mt-1 uppercase tracking-widest">Humidity</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Countdown ring ───────────────────────────────────────────────────────────
function CountdownRing({ secs, total, color }: { secs: number; total: number; color: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const progress = secs / total;
  const dash = circ * progress;

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.5s linear' }}
        />
      </svg>
      <span className={`text-5xl font-bold tabular-nums`} style={{ color }}>
        {secs}
      </span>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────
export default function PanelPage() {
  const _queryClient = useQueryClient();
  const { settings: storeSettings, setSettings } = useAlarmStore();
  const { isLoading } = useAlarmSettings();
  const now = useClock();
  const secs = useSecondsLeft(storeSettings);

  const isExitDelay = storeSettings?.state === 'EXIT_DELAY';
  const isEntryDelay = storeSettings?.state === 'ENTRY_DELAY';
  const isTriggered = storeSettings?.state === 'TRIGGERED';
  const isArmedHome = storeSettings?.state === 'ARMED_HOME';
  const isArmedAway = storeSettings?.state === 'ARMED_AWAY';
  const _isDisarmed = !storeSettings || storeSettings?.state === 'DISARMED';

  useCountdownSound(isExitDelay, secs);

  const [armingMode, setArmingMode] = useState<'home' | 'away' | null>(null);
  const [armPinError, setArmPinError] = useState('');
  const [disarmError, setDisarmError] = useState('');

  const arm = useMutation({
    mutationFn: ({ mode, pin }: { mode: 'home' | 'away'; pin?: string }) =>
      api.post('/alarm/arm', { mode, pin }).then((r) => {
        setSettings(r.data);
        return r.data;
      }),
    onSuccess: () => {
      setArmingMode(null);
      setArmPinError('');
    },
    onError: () => setArmPinError('Wrong PIN. Try again.'),
  });

  const disarm = useMutation({
    mutationFn: (pin?: string) =>
      api.post('/alarm/disarm', { pin }).then((r) => {
        setSettings(r.data);
        return r.data;
      }),
    onError: () => {
      /* PIN input will handle error display */
    },
  });

  const hasPinSet = !!storeSettings?.pinHash;

  const handleArmPin = async (pin: string) => {
    if (!armingMode) return;
    setArmPinError('');
    arm.mutate({ mode: armingMode, pin });
  };

  const handleDisarm = async (pin?: string) => {
    setDisarmError('');
    try {
      await disarm.mutateAsync(pin);
    } catch {
      setDisarmError('Wrong PIN. Try again.');
    }
  };

  if (isLoading || !storeSettings) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-slate-500">
        Loading...
      </div>
    );
  }

  // ── TRIGGERED ──
  if (isTriggered) {
    return (
      <div className="min-h-screen bg-red-950 flex flex-col items-center justify-center gap-10 p-8">
        <ShieldAlert size={64} className="text-red-400 animate-pulse" />
        <div className="text-center">
          <p className="text-red-300 text-3xl font-bold uppercase tracking-widest">
            Alarm Triggered
          </p>
          <p className="text-red-400/60 text-sm mt-2">Enter PIN to disarm</p>
        </div>
        <PinPad label="Enter PIN" onConfirm={handleDisarm} />
        {disarmError && <p className="text-red-400 text-sm">{disarmError}</p>}
      </div>
    );
  }

  // ── ENTRY DELAY (silent) ──
  if (isEntryDelay) {
    return (
      <div className="min-h-screen bg-amber-950 flex flex-col items-center justify-center gap-10 p-8">
        <div className="text-center">
          <p className="text-amber-300 text-2xl font-bold uppercase tracking-widest">
            Enter PIN to Disarm
          </p>
          <p className="text-amber-500/60 text-sm mt-1">Alarm will trigger in {secs}s</p>
        </div>
        <CountdownRing secs={secs} total={storeSettings.entryDelaySecs} color="#f59e0b" />
        <PinPad label="PIN" onConfirm={handleDisarm} />
        {disarmError && <p className="text-amber-400 text-sm">{disarmError}</p>}
      </div>
    );
  }

  // ── EXIT DELAY ──
  if (isExitDelay) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-8 p-8">
        <p className="text-slate-400 text-lg uppercase tracking-widest">Leave now</p>
        <CountdownRing secs={secs} total={storeSettings.exitDelaySecs} color="#3b82f6" />
        <p className="text-slate-500 text-sm">System will arm when countdown ends</p>
        <button
          onClick={() => handleDisarm()}
          className="mt-4 px-6 py-2.5 rounded-full border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── ARMED AWAY ──
  if (isArmedAway) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-10 p-8">
        <Shield size={56} className="text-blue-500" />
        <div className="text-center">
          <p className="text-blue-400 text-2xl font-bold uppercase tracking-widest">Armed — Away</p>
          <p className="text-slate-600 text-sm mt-2">Door sensors active</p>
        </div>
        <PinPad label="Enter PIN to disarm" onConfirm={handleDisarm} />
        {disarmError && <p className="text-red-400 text-sm">{disarmError}</p>}
      </div>
    );
  }

  // ── ARMED HOME ──
  if (isArmedHome) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-8 p-8">
        <Home size={56} className="text-emerald-400" />
        <div className="text-center">
          <p className="text-emerald-400 text-2xl font-bold uppercase tracking-widest">
            Armed — Home
          </p>
          <p className="text-slate-600 text-sm mt-2">Perimeter active</p>
        </div>
        <button
          onClick={() => handleDisarm()}
          className="mt-2 px-8 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
        >
          <ShieldOff size={16} /> Disarm
        </button>
      </div>
    );
  }

  // ── ARMING (PIN required) ──
  if (armingMode) {
    const isHome = armingMode === 'home';
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center gap-10 p-8 ${isHome ? 'bg-[#0a1a12]' : 'bg-[#0a0f1a]'}`}
      >
        <div className="text-center">
          <p
            className={`text-2xl font-bold uppercase tracking-widest ${isHome ? 'text-emerald-400' : 'text-blue-400'}`}
          >
            {isHome ? 'Arm — Home' : 'Arm — Away'}
          </p>
          <p className="text-slate-500 text-sm mt-2">
            {hasPinSet ? 'Enter your PIN to confirm' : 'Confirm to arm'}
          </p>
        </div>
        {hasPinSet ? (
          <PinPad label="Enter PIN" onConfirm={handleArmPin} />
        ) : (
          <button
            onClick={() => arm.mutate({ mode: armingMode })}
            disabled={arm.isPending}
            className={`px-8 py-3 rounded-full font-semibold text-white transition-colors ${isHome ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-blue-500 hover:bg-blue-400'}`}
          >
            {arm.isPending ? '…' : 'Confirm'}
          </button>
        )}
        {armPinError && <p className="text-red-400 text-sm">{armPinError}</p>}
        <button
          onClick={() => {
            setArmingMode(null);
            setArmPinError('');
          }}
          className="px-6 py-2.5 rounded-full border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200 text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── DISARMED (main display) ──
  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-between p-8 md:p-12">
      {/* Info display */}
      <div className="flex-1 flex items-center justify-center w-full">
        <InfoDisplay settings={storeSettings} now={now} />
      </div>

      {/* Arm buttons */}
      <div className="flex gap-4 w-full max-w-sm">
        <button
          onClick={() => setArmingMode('home')}
          className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-slate-400 hover:text-emerald-400 transition-all"
        >
          <Home size={24} />
          <span className="text-xs uppercase tracking-widest font-medium">Lock Inside</span>
        </button>

        <button
          onClick={() => setArmingMode('away')}
          className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl bg-white/5 hover:bg-blue-500/20 border border-white/10 hover:border-blue-500/40 text-slate-400 hover:text-blue-400 transition-all"
        >
          <LogOut size={24} />
          <span className="text-xs uppercase tracking-widest font-medium">Lock Away</span>
        </button>
      </div>
    </div>
  );
}
