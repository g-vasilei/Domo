import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Clock3, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api';
import { formatTime12 } from '../lib/time';
import TimePicker from './TimePicker';

interface Slot {
  time: string;
  minutes: number;
}
interface Schedule {
  id?: string;
  name: string;
  timezone: string;
  days: number[];
  enabled: boolean;
  slots: Slot[];
}
const DAYS = [
  { n: 1, label: 'Δευ' },
  { n: 2, label: 'Τρί' },
  { n: 3, label: 'Τετ' },
  { n: 4, label: 'Πέμ' },
  { n: 5, label: 'Παρ' },
  { n: 6, label: 'Σάβ' },
  { n: 0, label: 'Κυρ' },
];
const field =
  'w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white';
function endTime(slot: Slot) {
  const [h, m] = slot.time.split(':').map(Number);
  const end = h * 60 + m + slot.minutes;
  return `${formatTime12(`${String(Math.floor(end / 60) % 24).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`)}${end >= 1440 ? ' (+1 ημέρα)' : ''}`;
}
function message(error: any) {
  const detail = error?.response?.data?.message;
  return Array.isArray(detail)
    ? detail.join('. ')
    : (detail ?? 'Δεν αποθηκεύτηκαν οι αλλαγές. Δοκιμάστε ξανά.');
}

export default function DeviceSchedules({
  deviceId,
  deviceName,
  switchCode,
}: {
  deviceId: string;
  deviceName: string;
  switchCode: string;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<Schedule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const key = ['device-schedules', deviceId];
  const {
    data: schedules = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Schedule[]>({
    queryKey: key,
    queryFn: () => api.get(`/devices/${deviceId}/schedules`).then((r) => r.data),
  });
  const { data: location } = useQuery({
    queryKey: ['schedule-location'],
    queryFn: () => api.get('/automations/location').then((r) => r.data),
    staleTime: 60_000,
  });
  const me: any = client.getQueryData(['me']);
  const canManage =
    me?.role === 'OWNER' ||
    (me?.permissions?.canCreateSchedules && me?.permissions?.canControlDevices);
  const mutation = useMutation({
    mutationFn: async (
      operation:
        | { kind: 'save'; schedule: Schedule }
        | { kind: 'toggle'; id: string; enabled: boolean }
        | { kind: 'delete'; id: string },
    ) => {
      const base = `/devices/${deviceId}/schedules`;
      if (operation.kind === 'delete') return api.delete(`${base}/${operation.id}`);
      if (operation.kind === 'toggle')
        return api.patch(`${base}/${operation.id}`, { enabled: operation.enabled });
      const { id, name, timezone, days, enabled, slots } = operation.schedule;
      const body = {
        name,
        timezone,
        days,
        enabled,
        deviceName,
        switchCode,
        slots: slots.map(({ time, minutes }) => ({ time, minutes })),
      };
      return id ? api.put(`${base}/${id}`, body) : api.post(base, body);
    },
    onSuccess: async (_data, operation) => {
      if (operation.kind === 'save') setDraft(null);
      setDeleteId(null);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const edit = (schedule?: Schedule) => {
    mutation.reset();
    setDraft(
      schedule
        ? { ...schedule, slots: schedule.slots.map(({ time, minutes }) => ({ time, minutes })) }
        : {
            name: `Πρόγραμμα ${schedules.length + 1}`,
            enabled: true,
            timezone: location?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
            days: [1, 2, 3, 4, 5, 6, 0],
            slots: [{ time: '14:15', minutes: 40 }],
          },
    );
  };
  const updateSlot = (index: number, update: Partial<Slot>) =>
    setDraft(
      (current) =>
        current && {
          ...current,
          slots: current.slots.map((slot, i) => (i === index ? { ...slot, ...update } : slot)),
        },
    );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-[#1A222C]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <CalendarClock size={19} />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Προγράμματα</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Ορίστε ώρα έναρξης και διάρκεια λειτουργίας.
            </p>
          </div>
        </div>
        {canManage && !draft && (
          <button
            onClick={() => edit()}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2.5 text-xs font-semibold text-white hover:bg-brand/90"
          >
            <Plus size={14} /> Νέο πρόγραμμα
          </button>
        )}
      </div>
      {isLoading && <p className="mt-5 text-sm text-slate-400">Φόρτωση προγραμμάτων…</p>}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          Δεν φορτώθηκαν τα προγράμματα.{' '}
          <button onClick={() => refetch()} className="underline">
            Δοκιμάστε ξανά
          </button>
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {message(mutation.error)}
        </p>
      )}
      {!isLoading && !error && !schedules.length && !draft && (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-5 text-center dark:border-white/10">
          <Clock3 size={22} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-500">Δεν υπάρχουν προγράμματα ακόμη</p>
          <p className="mt-1 text-xs text-slate-400">
            Για παράδειγμα: 2:15 PM για 40 λεπτά και μετά 4:15 PM για 40 λεπτά.
          </p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {schedules.map((schedule) => (
          <div
            key={schedule.id}
            className="rounded-xl border border-slate-200/80 p-4 dark:border-white/10"
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-sm text-slate-800 dark:text-white">
                {schedule.name}
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {schedule.enabled ? 'Ενεργό' : 'Σε παύση'}
                </span>
                {canManage && (
                  <>
                    <button
                      role="switch"
                      aria-label={`Ενεργοποίηση ${schedule.name}`}
                      aria-checked={schedule.enabled}
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          kind: 'toggle',
                          id: schedule.id!,
                          enabled: !schedule.enabled,
                        })
                      }
                      className={`relative h-6 w-10 rounded-full transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 ${schedule.enabled ? 'bg-brand' : 'bg-slate-200 dark:bg-slate-600'}`}
                    >
                      <span
                        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${schedule.enabled ? 'left-5' : 'left-1'}`}
                      />
                    </button>
                    <button
                      aria-label={`Επεξεργασία ${schedule.name}`}
                      disabled={mutation.isPending}
                      onClick={() => edit(schedule)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-brand/10 hover:text-brand"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      aria-label={`Διαγραφή ${schedule.name}`}
                      disabled={mutation.isPending}
                      onClick={() => setDeleteId(schedule.id!)}
                      className="rounded-xl p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {schedule.days.length === 7
                ? 'Κάθε μέρα'
                : DAYS.filter((d) => schedule.days.includes(d.n))
                    .map((d) => d.label)
                    .join(', ')}{' '}
              · {schedule.timezone}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {schedule.slots.map((slot) => (
                <span
                  key={slot.time}
                  className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300"
                >
                  <Clock3 size={13} className="text-brand" />
                  <span className="font-semibold tabular-nums">
                    {formatTime12(slot.time)} → {endTime(slot)}
                  </span>
                  <span className="text-slate-400">{slot.minutes} λεπτά</span>
                </span>
              ))}
            </div>
            {deleteId === schedule.id && (
              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="text-slate-500">Διαγραφή αυτού του προγράμματος;</span>
                <button
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ kind: 'delete', id: schedule.id! })}
                  className="font-semibold text-red-500"
                >
                  Διαγραφή
                </button>
                <button onClick={() => setDeleteId(null)} className="text-slate-400">
                  Διατήρηση
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {draft && (
        <form
          aria-label="Επεξεργασία προγράμματος"
          className="mt-5 space-y-5 rounded-xl border border-brand/20 bg-brand/[0.025] p-4 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.days.length) mutation.mutate({ kind: 'save', schedule: draft });
          }}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">
              {draft.id ? 'Επεξεργασία προγράμματος' : 'Νέο πρόγραμμα'}
            </h4>
            <button
              type="button"
              aria-label="Κλείσιμο επεξεργασίας προγράμματος"
              disabled={mutation.isPending}
              onClick={() => setDraft(null)}
              className="text-slate-400"
            >
              <X size={17} />
            </button>
          </div>
          <fieldset disabled={mutation.isPending} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-slate-500">
                Όνομα προγράμματος
                <input
                  aria-label="Όνομα προγράμματος"
                  required
                  maxLength={80}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={field}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-500">
                Ζώνη ώρας
                <input
                  aria-label="Ζώνη ώρας προγράμματος"
                  required
                  value={draft.timezone}
                  onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                  className={field}
                />
              </label>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-500">Επανάληψη</p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day.n}
                    type="button"
                    aria-pressed={draft.days.includes(day.n)}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        days: draft.days.includes(day.n)
                          ? draft.days.filter((d) => d !== day.n)
                          : [...draft.days, day.n],
                      })
                    }
                    className={`rounded-xl px-2.5 py-2 text-xs font-medium transition ${draft.days.includes(day.n) ? 'bg-brand text-white' : 'bg-slate-100 text-slate-400 dark:bg-white/5'}`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
              {!draft.days.length && (
                <p className="mt-2 text-xs text-red-500">Επιλέξτε τουλάχιστον μία ημέρα.</p>
              )}
            </div>
            <div className="space-y-3">
              {draft.slots.map((slot, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500">Κανόνας {index + 1}</p>
                    <button
                      type="button"
                      aria-label={`Αφαίρεση κανόνα ${index + 1}`}
                      disabled={draft.slots.length === 1}
                      onClick={() =>
                        setDraft({ ...draft, slots: draft.slots.filter((_, i) => i !== index) })
                      }
                      className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-20"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5 text-xs text-slate-500">
                      <p>Ώρα έναρξης</p>
                      <TimePicker
                        label={`Κανόνας ${index + 1} — ώρα έναρξης`}
                        required
                        value={slot.time}
                        onChange={(time) => updateSlot(index, { time })}
                      />
                    </div>
                    <label className="flex flex-col gap-1.5 text-xs text-slate-500">
                      <span>Διάρκεια (λεπτά)</span>
                      <input
                        aria-label={`Κανόνας ${index + 1} — διάρκεια`}
                        type="number"
                        required
                        min={1}
                        max={1440}
                        step={1}
                        value={slot.minutes || ''}
                        onChange={(e) => updateSlot(index, { minutes: Number(e.target.value) })}
                        className={`${field} h-12`}
                      />
                    </label>
                  </div>
                  {slot.time && slot.minutes > 0 && (
                    <p className="mt-2 text-[11px] text-slate-400">Σβήσιμο στις {endTime(slot)}</p>
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={draft.slots.length >= 48}
                onClick={() =>
                  setDraft({ ...draft, slots: [...draft.slots, { time: '', minutes: 40 }] })
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-brand disabled:opacity-40"
              >
                <Plus size={14} /> Προσθήκη κανόνα
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="accent-brand"
              />{' '}
              Ενεργοποίηση προγράμματος
            </label>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-xs font-medium text-slate-400"
              >
                Ακύρωση
              </button>
              <button
                type="submit"
                disabled={!draft.days.length}
                className="rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {mutation.isPending ? 'Αποθήκευση…' : 'Αποθήκευση προγράμματος'}
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
        Τα προγράμματα εκτελούνται αυτόματα όσο λειτουργεί ο server, ακόμη και με κλειστή εφαρμογή.
        Αν συμπίπτουν, η συσκευή μένει αναμμένη μέχρι την τελευταία ώρα λήξης. Η παύση προγράμματος
        δεν ακυρώνει μια ενεργή αντίστροφη μέτρηση.
      </p>
    </section>
  );
}
