import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, Eye, EyeOff, Shield, Thermometer } from 'lucide-react';
import { useEffect, useState } from 'react';

import PinPromptModal from '../components/PinPromptModal';
import { api } from '../lib/api';
import { usePrefsStore } from '../store/prefs.store';

// ── Shared UI ──────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-slate-500 uppercase tracking-widest">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 pr-10 focus:outline-none focus:border-brand"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function SaveFeedback({ error, success }: { error: string; success: boolean }) {
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (success)
    return (
      <p className="text-sm text-emerald-500 flex items-center gap-1">
        <Check size={13} /> Saved
      </p>
    );
  return null;
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-widest">
        {title}
      </h2>
      {description && <p className="text-xs text-slate-400 mt-1">{description}</p>}
    </div>
  );
}

function Divider() {
  return <hr className="border-slate-200 dark:border-white/10" />;
}

// ── Tab: User (preferences) ────────────────────────────────────────────────

function UserTab() {
  const { tempUnit, setTempUnit, notificationsEnabled, setNotificationsEnabled } = usePrefsStore();
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if ('Notification' in window) setPermission(Notification.permission);
  }, []);

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      setNotificationsEnabled(true);
      new Notification('Smart Home', { body: 'Notifications enabled!', icon: '/favicon.ico' });
    }
  }

  const isGranted = permission === 'granted';
  const isDenied = permission === 'denied';

  return (
    <div className="flex flex-col gap-6 max-w-sm">
      <SectionHeader title="Preferences" description="Customize your experience." />

      {/* Temperature unit */}
      <Field label="Temperature Unit">
        <div className="flex gap-2">
          {(['C', 'F'] as const).map((u) => (
            <button
              key={u}
              onClick={() => setTempUnit(u)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-colors ${
                tempUnit === u
                  ? 'bg-brand text-white border-brand'
                  : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-brand/50'
              }`}
            >
              <Thermometer size={14} />°{u}
            </button>
          ))}
        </div>
      </Field>

      <Divider />

      {/* Notifications */}
      <div className="flex flex-col gap-3">
        <SectionHeader
          title="Notifications"
          description="Get browser alerts for alarm events — triggered, armed, disarmed."
        />

        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-md border ${
            isGranted && notificationsEnabled
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
              : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'
          }`}
        >
          {isGranted && notificationsEnabled ? (
            <Bell size={16} className="text-emerald-500 flex-shrink-0" />
          ) : (
            <BellOff size={16} className="text-slate-400 flex-shrink-0" />
          )}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isDenied
              ? 'Blocked by browser — enable in browser settings'
              : isGranted && notificationsEnabled
                ? 'Notifications are enabled'
                : 'Notifications are disabled'}
          </p>
        </div>

        {isDenied ? (
          <p className="text-xs text-slate-400">
            Your browser has blocked notifications for this site. To enable them, click the lock
            icon in your browser's address bar and allow notifications.
          </p>
        ) : isGranted ? (
          <button
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`self-start px-5 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              notificationsEnabled
                ? 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500'
                : 'bg-brand text-white hover:bg-brand/90'
            }`}
          >
            {notificationsEnabled ? 'Disable' : 'Enable'} notifications
          </button>
        ) : (
          <button
            onClick={requestNotifications}
            className="self-start px-5 py-2.5 bg-brand text-white rounded-md text-sm font-semibold hover:bg-brand/90 transition-colors"
          >
            Enable notifications
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tab: Password (change password) ───────────────────────────────────────

function PasswordTab() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch('/users/me/password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to update password'),
  });

  const valid = current && next.length >= 8 && next === confirm;

  return (
    <div className="flex flex-col gap-5 max-w-sm">
      <SectionHeader title="Change Password" description="Update your login password." />

      <Field label="Current Password">
        <PasswordInput
          value={current}
          onChange={(v) => {
            setCurrent(v);
            setError('');
          }}
        />
      </Field>

      <Field label="New Password" hint="Minimum 8 characters">
        <PasswordInput
          value={next}
          onChange={(v) => {
            setNext(v);
            setError('');
          }}
        />
      </Field>

      <Field label="Confirm New Password">
        <PasswordInput
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setError('');
          }}
        />
        {confirm && next !== confirm && (
          <p className="text-xs text-red-500">Passwords don't match</p>
        )}
      </Field>

      <SaveFeedback error={error} success={success} />

      <button
        onClick={() => {
          setError('');
          mutation.mutate();
        }}
        disabled={!valid || mutation.isPending || success}
        className="self-start px-5 py-2.5 bg-brand text-white rounded-md text-sm font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors"
      >
        {mutation.isPending ? 'Saving…' : 'Update Password'}
      </button>
    </div>
  );
}

// ── Tab: Tuya (owner only) ─────────────────────────────────────────────────

function TuyaTab() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 60_000,
  });

  const saved = me?.tuyaCredentials;
  const [accessId, setAccessId] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [region, setRegion] = useState<'eu' | 'us' | 'cn'>('eu');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (saved) {
      setAccessId(saved.accessId ?? '');
      setRegion(saved.region ?? 'eu');
    }
  }, [saved?.accessId, saved?.region]);

  const mutation = useMutation({
    mutationFn: () => api.post('/users/tuya-credentials', { accessId, accessSecret, region }),
    onSuccess: () => {
      setSuccess(true);
      setAccessSecret('');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Invalid credentials'),
  });

  const valid = accessId && accessSecret;

  return (
    <div className="flex flex-col gap-5 max-w-sm">
      <SectionHeader
        title="Tuya Credentials"
        description={
          saved
            ? 'Connected. Re-enter the Access Secret to update.'
            : 'Enter your Tuya IoT Platform credentials to link your devices.'
        }
      />

      <Field label="Access ID">
        <input
          value={accessId}
          onChange={(e) => {
            setAccessId(e.target.value);
            setError('');
          }}
          placeholder="Your Tuya Access ID"
          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
        />
      </Field>

      <Field label="Access Secret">
        <PasswordInput
          value={accessSecret}
          onChange={(v) => {
            setAccessSecret(v);
            setError('');
          }}
          placeholder={saved ? '••••••••••••••••' : 'Your Tuya Access Secret'}
        />
      </Field>

      <Field label="Region">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as any)}
          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
        >
          <option value="eu">Europe</option>
          <option value="us">United States</option>
          <option value="cn">China</option>
        </select>
      </Field>

      <SaveFeedback error={error} success={success} />

      <button
        onClick={() => {
          setError('');
          mutation.mutate();
        }}
        disabled={!valid || mutation.isPending || success}
        className="self-start px-5 py-2.5 bg-brand text-white rounded-md text-sm font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors"
      >
        {mutation.isPending ? 'Validating…' : saved ? 'Update Credentials' : 'Connect'}
      </button>
    </div>
  );
}

// ── Tab: Alarm PIN ─────────────────────────────────────────────────────────

function AlarmTab() {
  const { data: alarm } = useQuery({
    queryKey: ['alarm'],
    queryFn: () => api.get('/alarm').then((r) => r.data),
    staleTime: 30_000,
  });

  const hasPinSet = !!alarm?.pinHash;
  const [step, setStep] = useState<null | 'current' | 'new' | 'confirm'>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function close() {
    setStep(null);
    setCurrentPin('');
    setNewPin('');
    setError('');
  }

  const mutation = useMutation({
    mutationFn: (confirm: string) =>
      api.post('/alarm/pin', { pin: confirm, ...(hasPinSet ? { currentPin } : {}) }),
    onSuccess: () => {
      close();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Failed to set PIN'),
  });

  function handleNew(pin: string) {
    setNewPin(pin);
    setError('');
    setStep('confirm');
  }
  function handleConfirm(pin: string) {
    if (pin !== newPin) {
      setError('PINs do not match');
      setStep('new');
      return;
    }
    mutation.mutate(pin);
  }

  return (
    <div className="flex flex-col gap-5 max-w-sm">
      <SectionHeader
        title="Alarm PIN"
        description={
          hasPinSet
            ? 'Required to arm and disarm the alarm.'
            : 'Create a PIN to protect arm and disarm actions.'
        }
      />

      <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
        <Shield size={16} className={hasPinSet ? 'text-emerald-500' : 'text-slate-400'} />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {hasPinSet ? 'PIN is currently set' : 'No PIN set — alarm runs without a PIN'}
        </p>
      </div>

      {success && (
        <p className="text-sm text-emerald-500 flex items-center gap-1">
          <Check size={13} /> PIN saved
        </p>
      )}

      <button
        onClick={() => {
          setError('');
          setStep(hasPinSet ? 'current' : 'new');
        }}
        className="self-start px-5 py-2.5 bg-brand text-white rounded-md text-sm font-semibold hover:bg-brand/90 transition-colors"
      >
        {hasPinSet ? 'Update' : 'Create'}
      </button>

      {step === 'current' && (
        <PinPromptModal
          title="Current PIN"
          description="Enter your current PIN to continue"
          onConfirm={(pin) => {
            setCurrentPin(pin);
            setError('');
            setStep('new');
          }}
          onClose={close}
          error={error}
        />
      )}
      {step === 'new' && (
        <PinPromptModal
          title={hasPinSet ? 'New PIN' : 'Create PIN'}
          description="Enter your new PIN"
          onConfirm={handleNew}
          onClose={close}
          error={error}
        />
      )}
      {step === 'confirm' && (
        <PinPromptModal
          title="Confirm PIN"
          description="Re-enter your new PIN to confirm"
          onConfirm={handleConfirm}
          onClose={close}
          error={error}
          loading={mutation.isPending}
        />
      )}
    </div>
  );
}

// ── Tab: Logs ──────────────────────────────────────────────────────────────

function logBadge(log: any): { label: string; color: string } {
  const ctx = log.context;
  const action = log.metadata?.action as string | undefined;
  if (ctx === 'alarm') {
    const map: Record<string, { label: string; color: string }> = {
      arm_home: {
        label: 'Armed — Home',
        color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10',
      },
      arm_away: { label: 'Armed — Away', color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10' },
      disarm: { label: 'Disarmed', color: 'text-slate-500 bg-slate-100 dark:bg-white/5' },
      triggered: { label: 'Triggered', color: 'text-red-600 bg-red-50 dark:bg-red-500/10' },
    };
    return (
      map[action ?? ''] ?? { label: 'Alarm', color: 'text-slate-500 bg-slate-100 dark:bg-white/5' }
    );
  }
  if (ctx === 'device') {
    const cmds: { code: string; value: unknown }[] = log.metadata?.commands ?? [];
    const summary = cmds.map((c) => `${c.code}: ${c.value}`).join(', ');
    return {
      label: summary || 'Device command',
      color: 'text-violet-600 bg-violet-50 dark:bg-violet-500/10',
    };
  }
  return { label: log.message, color: 'text-slate-500 bg-slate-100 dark:bg-white/5' };
}

function LogsTab() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: () => api.get('/users/logs').then((r) => r.data),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="py-16 text-center text-slate-400">
        <p className="text-sm">No activity logged yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {logs.map((log: any) => {
        const { label, color } = logBadge(log);
        return (
          <div
            key={log.id}
            className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap ${color}`}
            >
              {label}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400 truncate flex-1">
              {log.user?.email ?? 'Unknown'}
            </span>
            <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
              {new Date(log.createdAt).toLocaleString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const TABS = ['Preferences', 'Password', 'Tuya', 'Alarm', 'Logs'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() {
  const [active, setActive] = useState<Tab>('Preferences');

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 60_000,
  });

  const isOwner = me?.role === 'OWNER';
  const canSeeAlarm = isOwner || me?.permissions?.canArmAlarm;
  const visibleTabs = TABS.filter((t) => {
    if (t === 'Tuya') return isOwner;
    if (t === 'Alarm') return canSeeAlarm;
    if (t === 'Logs') return canSeeAlarm;
    return true;
  });
  const activeTab = visibleTabs.includes(active) ? active : (visibleTabs[0] ?? 'Preferences');

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Settings</h1>

      <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-md p-1 self-start flex-wrap">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-[#1A222C] text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-sm p-6">
        {activeTab === 'Preferences' && <UserTab />}
        {activeTab === 'Password' && <PasswordTab />}
        {activeTab === 'Tuya' && isOwner && <TuyaTab />}
        {activeTab === 'Alarm' && <AlarmTab />}
        {activeTab === 'Logs' && <LogsTab />}
      </div>
    </div>
  );
}
