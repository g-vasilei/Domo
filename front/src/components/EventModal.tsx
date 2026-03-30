import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api';
import DatePicker from './DatePicker';
import TimePicker from './TimePicker';

const COLORS = [
  { value: 'blue', hex: '#3b82f6' },
  { value: 'green', hex: '#10b981' },
  { value: 'red', hex: '#ef4444' },
  { value: 'yellow', hex: '#f59e0b' },
  { value: 'purple', hex: '#a855f7' },
  { value: 'orange', hex: '#f97316' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeStr(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface Props {
  event?: any;
  defaultDate?: Date;
  defaultTime?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function EventModal({ event, defaultDate, defaultTime, onClose, onSaved }: Props) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [date, setDate] = useState(() => {
    const d = event ? new Date(event.startAt) : (defaultDate ?? new Date());
    return toDateStr(d);
  });
  const [time, setTime] = useState(() => {
    if (event && !event.allDay) return toTimeStr(new Date(event.startAt));
    return defaultTime ?? '09:00';
  });
  const [allDay, setAllDay] = useState<boolean>(event?.allDay ?? !defaultTime);
  const [color, setColor] = useState(event?.color ?? 'blue');

  function buildStartAt() {
    if (allDay) return new Date(`${date}T00:00:00`).toISOString();
    return new Date(`${date}T${time}`).toISOString();
  }

  const save = useMutation({
    mutationFn: () => {
      const body = { title, description: description || undefined, startAt: buildStartAt(), allDay, color };
      return isEdit
        ? api.put(`/calendar/${event.id}`, body).then((r) => r.data)
        : api.post('/calendar', body).then((r) => r.data);
    },
    onSuccess: onSaved,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/calendar/${event.id}`).then((r) => r.data),
    onSuccess: onSaved,
  });

  const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5';
  const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            {isEdit ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className={labelCls}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's happening?"
              autoFocus
              className={inputCls}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add details (optional)"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Date & all-day toggle */}
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className={labelCls}>Date</label>
              <DatePicker value={date} onChange={setDate} />
            </div>
            <label className="flex items-center gap-2 pb-2 cursor-pointer whitespace-nowrap">
              <div
                onClick={() => setAllDay(a => !a)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${allDay ? 'bg-brand' : 'bg-slate-300 dark:bg-white/20'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allDay ? 'left-4' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-300">All day</span>
            </label>
          </div>

          {/* Time picker — only when not all-day */}
          {!allDay && (
            <div>
              <label className={labelCls}>Time</label>
              <TimePicker value={time} onChange={setTime} />
            </div>
          )}

          {/* Color */}
          <div>
            <label className={labelCls}>Color</label>
            <div className="flex gap-2.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c.value ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1e293b] scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex, ...(color === c.value ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${c.hex}` } : {}) }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-between">
          {isEdit ? (
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
            >
              Delete
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white">
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!title.trim() || save.isPending}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50"
            >
              {save.isPending ? 'Saving…' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
