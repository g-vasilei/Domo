import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

import { api } from '../lib/api';

const COLORS = [
  { value: 'blue', bg: 'bg-blue-500' },
  { value: 'green', bg: 'bg-emerald-500' },
  { value: 'red', bg: 'bg-red-500' },
  { value: 'yellow', bg: 'bg-amber-400' },
  { value: 'purple', bg: 'bg-purple-500' },
  { value: 'orange', bg: 'bg-orange-400' },
];

function toDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toTimeInput(date: Date) {
  return date.toTimeString().slice(0, 5);
}

interface Props {
  event?: any;
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}

export default function EventModal({ event, defaultDate, onClose, onSaved }: Props) {
  const isEdit = !!event;
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [date, setDate] = useState(() => {
    const d = event ? new Date(event.startAt) : (defaultDate ?? new Date());
    return toDateInput(d);
  });
  const [time, setTime] = useState(() => {
    if (!event || event.allDay) return '';
    return toTimeInput(new Date(event.startAt));
  });
  const [allDay, setAllDay] = useState<boolean>(event?.allDay ?? true);
  const [color, setColor] = useState(event?.color ?? 'blue');

  function buildStartAt() {
    if (allDay) return new Date(`${date}T00:00:00`).toISOString();
    return new Date(`${date}T${time || '00:00'}`).toISOString();
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        description: description || undefined,
        startAt: buildStartAt(),
        allDay,
        color,
      };
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-base font-semibold text-slate-800 dark:text-white">
            {isEdit ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {!allDay && (
              <div className="w-32">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="rounded accent-brand"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">All day</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Color
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full ${c.bg} transition-transform ${
                    color === c.value
                      ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1e293b] ring-slate-500 scale-110'
                      : ''
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-between">
          {isEdit ? (
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="text-sm text-red-500 hover:text-red-600 font-medium disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={!title.trim() || save.isPending}
              className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50"
            >
              {save.isPending ? 'Saving...' : isEdit ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
