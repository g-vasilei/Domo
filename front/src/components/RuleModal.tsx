import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api';

interface Condition {
  type: 'device_state' | 'time' | 'sun';
  deviceId?: string;
  deviceName?: string;
  statusCode?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'lt';
  value?: unknown;
  timeValue?: string;
  sunEvent?: 'sunrise' | 'sunset';
  sunOffsetMin?: number;
  nextOperator?: 'AND' | 'OR';
}

interface Action {
  type: 'device_control' | 'countdown' | 'notification';
  deviceId?: string;
  deviceName?: string;
  statusCode?: string;
  value?: unknown;
  minutes?: number;
}

interface Props {
  rule?: any;
  onClose: () => void;
}

const SEL =
  'text-xs bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-slate-700 dark:text-slate-300 outline-none focus:border-brand';

function emptyCondition(): Condition {
  return { type: 'device_state', operator: 'eq', nextOperator: 'AND' };
}

function emptyAction(): Action {
  return { type: 'device_control' };
}

/** Fetch current status codes for a device */
function useDeviceStatus(deviceId?: string) {
  const { data, isLoading } = useQuery<{ code: string; value: unknown }[]>({
    queryKey: ['device-status', deviceId],
    queryFn: () => api.get(`/devices/${deviceId}/status`).then((r) => r.data),
    enabled: !!deviceId,
    staleTime: 30_000,
  });
  return { status: data ?? [], isLoading };
}

function ValuePicker({
  statusEntry,
  value,
  onChange,
}: {
  statusEntry: { code: string; value: unknown } | undefined;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (!statusEntry) return null;

  if (typeof statusEntry.value === 'boolean') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value === 'true')}
        className={SEL}
      >
        <option value="">— value —</option>
        <option value="true">true (on / open)</option>
        <option value="false">false (off / closed)</option>
      </select>
    );
  }

  if (typeof statusEntry.value === 'number') {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder="value"
          className={`w-24 ${SEL}`}
        />
        <span className="text-[10px] text-slate-400" title="current raw device value">
          now: {statusEntry.value}
        </span>
      </div>
    );
  }

  // string or anything else — text input
  return (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value"
      className={`w-32 ${SEL}`}
    />
  );
}

function ConditionRow({
  cond,
  isLast,
  devices,
  onChange,
  onRemove,
}: {
  cond: Condition;
  isLast: boolean;
  devices: any[];
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Condition>) => onChange({ ...cond, ...patch });
  const { status, isLoading } = useDeviceStatus(
    cond.type === 'device_state' ? cond.deviceId : undefined,
  );
  const selectedStatus = status.find((s) => s.code === cond.statusCode);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          {/* Row 1: type + device + operator */}
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={cond.type}
              onChange={(e) =>
                set({
                  type: e.target.value as Condition['type'],
                  deviceId: undefined,
                  statusCode: undefined,
                  value: undefined,
                  timeValue: undefined,
                  sunEvent: undefined,
                  sunOffsetMin: undefined,
                })
              }
              className={SEL}
            >
              <option value="device_state">Device state</option>
              <option value="time">Time</option>
              <option value="sun">Sun event</option>
            </select>

            {cond.type === 'device_state' && (
              <>
                <select
                  value={cond.deviceId ?? ''}
                  onChange={(e) => {
                    const dev = devices.find((d) => d.id === e.target.value);
                    set({
                      deviceId: e.target.value,
                      deviceName: dev?.name,
                      statusCode: undefined,
                      value: undefined,
                    });
                  }}
                  className={SEL}
                >
                  <option value="">— device —</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  value={cond.operator ?? 'eq'}
                  onChange={(e) => set({ operator: e.target.value as Condition['operator'] })}
                  className={SEL}
                >
                  <option value="eq">=</option>
                  <option value="neq">≠</option>
                  {typeof selectedStatus?.value === 'number' && (
                    <>
                      <option value="gt">&gt;</option>
                      <option value="lt">&lt;</option>
                    </>
                  )}
                </select>
              </>
            )}

            {cond.type === 'time' && (
              <>
                <select
                  value={cond.operator ?? 'eq'}
                  onChange={(e) => set({ operator: e.target.value as Condition['operator'] })}
                  className={SEL}
                >
                  <option value="eq">at (=)</option>
                  <option value="gt">after (&gt;)</option>
                  <option value="lt">before (&lt;)</option>
                </select>
                <input
                  type="time"
                  value={cond.timeValue ?? ''}
                  onChange={(e) => set({ timeValue: e.target.value })}
                  className={SEL}
                />
              </>
            )}

            {cond.type === 'sun' && (
              <>
                <select
                  value={cond.operator ?? 'eq'}
                  onChange={(e) => set({ operator: e.target.value as Condition['operator'] })}
                  className={SEL}
                >
                  <option value="eq">at (=)</option>
                  <option value="gt">after (&gt;)</option>
                  <option value="lt">before (&lt;)</option>
                </select>
                <select
                  value={cond.sunEvent ?? 'sunrise'}
                  onChange={(e) => set({ sunEvent: e.target.value as 'sunrise' | 'sunset' })}
                  className={SEL}
                >
                  <option value="sunrise">Sunrise</option>
                  <option value="sunset">Sunset</option>
                </select>
                <input
                  type="number"
                  value={cond.sunOffsetMin ?? ''}
                  onChange={(e) =>
                    set({ sunOffsetMin: e.target.value ? Number(e.target.value) : undefined })
                  }
                  placeholder="offset min"
                  className={`w-24 ${SEL}`}
                />
                <span className="text-xs text-slate-400">min</span>
              </>
            )}
          </div>

          {/* Row 2: status code + value (device_state only) */}
          {cond.type === 'device_state' && cond.deviceId && (
            <div className="flex gap-2 flex-wrap items-center pl-2 border-l-2 border-slate-100 dark:border-white/10">
              {isLoading ? (
                <span className="text-xs text-slate-400">Loading status codes…</span>
              ) : (
                <>
                  <select
                    value={cond.statusCode ?? ''}
                    onChange={(e) => set({ statusCode: e.target.value, value: undefined })}
                    className={SEL}
                  >
                    <option value="">— status code —</option>
                    {status.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>

                  {cond.statusCode && (
                    <ValuePicker
                      statusEntry={selectedStatus}
                      value={cond.value}
                      onChange={(v) => set({ value: v })}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onRemove}
          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors flex-shrink-0 mt-0.5"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* AND/OR connector */}
      {!isLast && (
        <div className="flex items-center gap-2 pl-1">
          <div className="w-4 h-px bg-slate-200 dark:bg-white/10" />
          <button
            onClick={() => set({ nextOperator: cond.nextOperator === 'AND' ? 'OR' : 'AND' })}
            className="text-[10px] font-bold text-brand border border-brand/30 rounded px-1.5 py-0.5 hover:bg-brand/10 transition-colors"
          >
            {cond.nextOperator ?? 'AND'}
          </button>
          <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
        </div>
      )}
    </div>
  );
}

function ActionRow({
  action,
  devices,
  onChange,
  onRemove,
}: {
  action: Action;
  devices: any[];
  onChange: (a: Action) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<Action>) => onChange({ ...action, ...patch });
  const { status, isLoading } = useDeviceStatus(
    action.type === 'device_control' ? action.deviceId : undefined,
  );
  const selectedStatus = status.find((s) => s.code === action.statusCode);

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 space-y-2">
        {/* Row 1: type + device */}
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={action.type}
            onChange={(e) =>
              set({
                type: e.target.value as Action['type'],
                deviceId: undefined,
                statusCode: undefined,
                value: undefined,
                minutes: undefined,
              })
            }
            className={SEL}
          >
            <option value="device_control">Set device state</option>
            <option value="countdown">Countdown (on for N min)</option>
            <option value="notification">Send notification</option>
          </select>

          {action.type !== 'notification' && (
            <select
              value={action.deviceId ?? ''}
              onChange={(e) => {
                const dev = devices.find((d) => d.id === e.target.value);
                set({
                  deviceId: e.target.value,
                  deviceName: dev?.name,
                  statusCode: undefined,
                  value: undefined,
                });
              }}
              className={SEL}
            >
              <option value="">— device —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          {action.type === 'countdown' && action.deviceId && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={action.minutes ?? ''}
                onChange={(e) => set({ minutes: Number(e.target.value) })}
                placeholder="minutes"
                className={`w-20 ${SEL}`}
              />
              <span className="text-xs text-slate-400">min</span>
            </div>
          )}

          {action.type === 'notification' && (
            <input
              type="text"
              value={(action.value as string) ?? ''}
              onChange={(e) => set({ value: e.target.value })}
              placeholder="Message (optional)"
              className={`flex-1 min-w-0 ${SEL}`}
            />
          )}
        </div>

        {/* Row 2: status code + value (device_control only) */}
        {action.type === 'device_control' && action.deviceId && (
          <div className="flex gap-2 flex-wrap items-center pl-2 border-l-2 border-slate-100 dark:border-white/10">
            {isLoading ? (
              <span className="text-xs text-slate-400">Loading status codes…</span>
            ) : (
              <>
                <select
                  value={action.statusCode ?? ''}
                  onChange={(e) => set({ statusCode: e.target.value, value: undefined })}
                  className={SEL}
                >
                  <option value="">— status code —</option>
                  {status.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code}
                    </option>
                  ))}
                </select>

                {action.statusCode && (
                  <ValuePicker
                    statusEntry={selectedStatus}
                    value={action.value}
                    onChange={(v) => set({ value: v })}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      <button
        onClick={onRemove}
        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors flex-shrink-0 mt-0.5"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function RuleModal({ rule, onClose }: Props) {
  const qc = useQueryClient();
  const isEdit = !!rule;

  const [name, setName] = useState(rule?.name ?? '');
  const [conditions, setConditions] = useState<Condition[]>(
    rule?.conditions?.length ? rule.conditions.map((c: any) => ({ ...c })) : [emptyCondition()],
  );
  const [actions, setActions] = useState<Action[]>(
    rule?.actions?.length ? rule.actions.map((a: any) => ({ ...a })) : [emptyAction()],
  );

  const { data: devicesData } = useQuery({
    queryKey: ['devices', 'flat'],
    queryFn: () => api.get('/devices').then((r) => r.data),
  });
  const devices: any[] = devicesData ?? [];

  const mutation = useMutation({
    mutationFn: (body: any) =>
      isEdit ? api.put(`/automations/${rule.id}`, body) : api.post('/automations', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automations'] });
      onClose();
    },
  });

  const handleSave = () => {
    if (!name.trim()) return;
    mutation.mutate({
      name: name.trim(),
      conditions: conditions.map((c, i) => ({
        ...c,
        order: i,
        nextOperator: i < conditions.length - 1 ? (c.nextOperator ?? 'AND') : undefined,
      })),
      actions: actions.map((a, i) => ({ ...a, order: i })),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#1A222C] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {isEdit ? 'Edit Rule' : 'New Rule'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Rule name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Turn off lights at sunset"
              className="w-full text-sm bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-3 py-2 text-slate-800 dark:text-slate-100 outline-none focus:border-brand"
            />
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                When
              </span>
              <button
                onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <Plus size={12} /> Add condition
              </button>
            </div>
            <div className="space-y-4">
              {conditions.map((c, i) => (
                <ConditionRow
                  key={i}
                  cond={c}
                  isLast={i === conditions.length - 1}
                  devices={devices}
                  onChange={(updated) =>
                    setConditions((prev) => prev.map((x, idx) => (idx === i ? updated : x)))
                  }
                  onRemove={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Then
              </span>
              <button
                onClick={() => setActions((prev) => [...prev, emptyAction()])}
                className="flex items-center gap-1 text-xs text-brand hover:underline"
              >
                <Plus size={12} /> Add action
              </button>
            </div>
            <div className="space-y-3">
              {actions.map((a, i) => (
                <ActionRow
                  key={i}
                  action={a}
                  devices={devices}
                  onChange={(updated) =>
                    setActions((prev) => prev.map((x, idx) => (idx === i ? updated : x)))
                  }
                  onRemove={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-white/10">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-slate-200 dark:border-white/10 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || mutation.isPending}
            className="flex-1 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {mutation.isPending ? 'Saving…' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}
