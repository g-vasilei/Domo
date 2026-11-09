import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Check, Eye, EyeOff, Shield, Thermometer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import PinPromptModal from '../components/PinPromptModal';
import { api } from '../lib/api';
import { getWeatherCity, GREEK_CITIES } from '../lib/greekCities';
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
        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 pr-10 focus:outline-none focus:border-brand"
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
        <Check size={13} /> Αποθηκεύτηκε
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
  const {
    saving,
    saveError,
    tempUnit,
    setTempUnit,
    notificationsEnabled,
    setNotificationsEnabled,
    weatherCityId,
    setWeatherCityId,
  } = usePrefsStore();
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
      new Notification('Έξυπνο σπίτι', {
        body: 'Οι ειδοποιήσεις ενεργοποιήθηκαν!',
        icon: '/favicon.ico',
      });
    }
  }

  const isGranted = permission === 'granted';
  const isDenied = permission === 'denied';

  return (
    <fieldset disabled={saving} className="flex flex-col gap-6 max-w-sm">
      <SectionHeader title="Προτιμήσεις" description="Προσαρμόστε την εμπειρία σας." />

      <Field
        label="Πόλη για τον καιρό"
        hint="Ο καιρός στην αρχική ενημερώνεται αυτόματα. Η επιλογή αποθηκεύεται στον λογαριασμό σας."
      >
        <select
          aria-label="Πόλη για τον καιρό"
          value={getWeatherCity(weatherCityId).id}
          onChange={(e) => setWeatherCityId(e.target.value)}
          className="w-full bg-slate-50 dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
        >
          {GREEK_CITIES.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Temperature unit */}
      <Field label="Μονάδα θερμοκρασίας">
        <div className="flex gap-2">
          {(['C', 'F'] as const).map((u) => (
            <button
              key={u}
              onClick={() => setTempUnit(u)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
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
          title="Ειδοποιήσεις"
          description="Λάβετε ειδοποιήσεις για ενεργοποίηση, όπλιση και αφόπλιση του συναγερμού."
        />

        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
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
              ? 'Αποκλείστηκε από τον browser — ενεργοποιήστε το στις ρυθμίσεις του'
              : isGranted && notificationsEnabled
                ? 'Οι ειδοποιήσεις είναι ενεργές'
                : 'Οι ειδοποιήσεις είναι απενεργοποιημένες'}
          </p>
        </div>

        {isDenied ? (
          <p className="text-xs text-slate-400">
            Ο browser έχει αποκλείσει τις ειδοποιήσεις. Ανοίξτε τις ρυθμίσεις ιστοτόπου δίπλα στη
            διεύθυνση και επιτρέψτε τις ειδοποιήσεις.
          </p>
        ) : isGranted ? (
          <button
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`self-start px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              notificationsEnabled
                ? 'border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500'
                : 'bg-brand text-white hover:bg-brand/90'
            }`}
          >
            {notificationsEnabled ? 'Απενεργοποίηση' : 'Ενεργοποίηση'} ειδοποιήσεις
          </button>
        ) : (
          <button
            onClick={requestNotifications}
            className="self-start px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand/90 transition-colors"
          >
            Ενεργοποίηση ειδοποιήσεων
          </button>
        )}
      </div>
      {saving && (
        <p role="status" className="text-xs text-slate-400">
          Αποθήκευση…
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-red-500">
          {saveError}
        </p>
      )}
    </fieldset>
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
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Η ενημέρωση κωδικού απέτυχε'),
  });

  const valid = current && next.length >= 8 && next === confirm;

  return (
    <div className="flex flex-col gap-5 max-w-sm">
      <SectionHeader title="Αλλαγή κωδικού" description="Αλλάξτε τον κωδικό σύνδεσής σας." />

      <Field label="Τρέχων κωδικός">
        <PasswordInput
          value={current}
          onChange={(v) => {
            setCurrent(v);
            setError('');
          }}
        />
      </Field>

      <Field label="Νέος κωδικός" hint="Τουλάχιστον 8 χαρακτήρες">
        <PasswordInput
          value={next}
          onChange={(v) => {
            setNext(v);
            setError('');
          }}
        />
      </Field>

      <Field label="Επιβεβαίωση νέου κωδικού">
        <PasswordInput
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setError('');
          }}
        />
        {confirm && next !== confirm && (
          <p className="text-xs text-red-500">Οι κωδικοί δεν ταιριάζουν</p>
        )}
      </Field>

      <SaveFeedback error={error} success={success} />

      <button
        onClick={() => {
          setError('');
          mutation.mutate();
        }}
        disabled={!valid || mutation.isPending || success}
        className="self-start px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors"
      >
        {mutation.isPending ? 'Αποθήκευση…' : 'Ενημέρωση κωδικού'}
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
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Μη έγκυρα στοιχεία σύνδεσης'),
  });

  const valid = accessId && accessSecret;

  return (
    <div className="flex flex-col gap-5 max-w-sm">
      <SectionHeader
        title="Στοιχεία Tuya"
        description={
          saved
            ? 'Συνδέθηκε. Εισαγάγετε ξανά το μυστικό πρόσβασης για ενημέρωση.'
            : 'Εισαγάγετε τα στοιχεία της πλατφόρμας Tuya IoT για να συνδέσετε τις συσκευές σας.'
        }
      />

      <Field label="Αναγνωριστικό πρόσβασης">
        <input
          value={accessId}
          onChange={(e) => {
            setAccessId(e.target.value);
            setError('');
          }}
          placeholder="Το αναγνωριστικό πρόσβασης Tuya"
          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
        />
      </Field>

      <Field label="Μυστικό πρόσβασης">
        <PasswordInput
          value={accessSecret}
          onChange={(v) => {
            setAccessSecret(v);
            setError('');
          }}
          placeholder={saved ? '••••••••••••••••' : 'Το μυστικό πρόσβασης Tuya'}
        />
      </Field>

      <Field label="Περιοχή">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as any)}
          className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:border-brand"
        >
          <option value="eu">Ευρώπη</option>
          <option value="us">Ηνωμένες Πολιτείες</option>
          <option value="cn">Κίνα</option>
        </select>
      </Field>

      <SaveFeedback error={error} success={success} />

      <button
        onClick={() => {
          setError('');
          mutation.mutate();
        }}
        disabled={!valid || mutation.isPending || success}
        className="self-start px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-brand/90 transition-colors"
      >
        {mutation.isPending ? 'Έλεγχος…' : saved ? 'Ενημέρωση στοιχείων' : 'Σύνδεση'}
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
    onError: (e: any) => setError(e?.response?.data?.message ?? 'Η αποθήκευση PIN απέτυχε'),
  });

  function handleNew(pin: string) {
    setNewPin(pin);
    setError('');
    setStep('confirm');
  }
  function handleConfirm(pin: string) {
    if (pin !== newPin) {
      setError('Τα PIN δεν ταιριάζουν');
      setStep('new');
      return;
    }
    mutation.mutate(pin);
  }

  return (
    <div className="flex flex-col gap-5 max-w-sm">
      <SectionHeader
        title="PIN συναγερμού"
        description={
          hasPinSet
            ? 'Απαιτείται για όπλιση και αφόπλιση του συναγερμού.'
            : 'Δημιουργήστε PIN για την προστασία όπλισης και αφόπλισης.'
        }
      />

      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
        <Shield size={16} className={hasPinSet ? 'text-emerald-500' : 'text-slate-400'} />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {hasPinSet
            ? 'Έχει οριστεί PIN'
            : 'Δεν έχει οριστεί PIN — ο συναγερμός λειτουργεί χωρίς PIN'}
        </p>
      </div>

      {success && (
        <p className="text-sm text-emerald-500 flex items-center gap-1">
          <Check size={13} /> Το PIN αποθηκεύτηκε
        </p>
      )}

      <button
        onClick={() => {
          setError('');
          setStep(hasPinSet ? 'current' : 'new');
        }}
        className="self-start px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand/90 transition-colors"
      >
        {hasPinSet ? 'Ενημέρωση' : 'Δημιουργία'}
      </button>

      {step === 'current' && (
        <PinPromptModal
          title="Τρέχον PIN"
          description="Εισαγάγετε το τρέχον PIN για συνέχεια"
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
          title={hasPinSet ? 'Νέο PIN' : 'Δημιουργία PIN'}
          description="Εισαγάγετε το νέο PIN"
          onConfirm={handleNew}
          onClose={close}
          error={error}
        />
      )}
      {step === 'confirm' && (
        <PinPromptModal
          title="Επιβεβαίωση PIN"
          description="Εισαγάγετε ξανά το νέο PIN για επιβεβαίωση"
          onConfirm={handleConfirm}
          onClose={close}
          error={error}
          loading={mutation.isPending}
        />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const TABS = ['Προτιμήσεις', 'Κωδικός πρόσβασης', 'Tuya', 'Συναγερμός'] as const;
type Tab = (typeof TABS)[number];
const TAB_IDS: Record<Tab, string> = {
  Προτιμήσεις: 'preferences',
  'Κωδικός πρόσβασης': 'password',
  Tuya: 'tuya',
  Συναγερμός: 'alarm',
};

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((tab) => TAB_IDS[tab] === params.get('tab')) ?? 'Προτιμήσεις';

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/users/me').then((r) => r.data),
    staleTime: 60_000,
  });

  const isOwner = me?.role === 'OWNER';
  const canSeeAlarm = isOwner || me?.permissions?.canArmAlarm;
  const visibleTabs = TABS.filter((t) => {
    if (t === 'Tuya') return isOwner;
    if (t === 'Συναγερμός') return canSeeAlarm;
    return true;
  });
  const activeTab = visibleTabs.includes(active) ? active : (visibleTabs[0] ?? 'Προτιμήσεις');
  if (params.get('tab') === 'history') {
    const legacyParams = new URLSearchParams(params);
    legacyParams.delete('tab');
    return (
      <Navigate
        to={{ pathname: '/activity', search: legacyParams.toString() ? `?${legacyParams}` : '' }}
        replace
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Ρυθμίσεις</h1>

      <div className="flex gap-1 bg-slate-100 dark:bg-white/5 rounded-xl p-1 self-start flex-wrap">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set('tab', TAB_IDS[tab]);
                next.delete('level');
                return next;
              })
            }
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-[#1A222C] text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-xl p-6">
        {activeTab === 'Προτιμήσεις' && <UserTab />}
        {activeTab === 'Κωδικός πρόσβασης' && <PasswordTab />}
        {activeTab === 'Tuya' && isOwner && <TuyaTab />}
        {activeTab === 'Συναγερμός' && <AlarmTab />}
      </div>
    </div>
  );
}
