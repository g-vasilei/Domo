import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import EventModal from '../components/EventModal';
import { api } from '../lib/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  purple: 'bg-purple-500',
  orange: 'bg-orange-400',
};

function getCalendarCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; current: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), current: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), current: false });
  }
  return cells;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toISODate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [modal, setModal] = useState<{ event?: any; date?: Date } | null>(null);
  const qc = useQueryClient();

  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const { data: events = [] } = useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => api.get('/calendar', { params: { from, to } }).then((r) => r.data),
  });

  const prev = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const next = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const cells = getCalendarCells(year, month);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white w-48 text-center">
            {MONTHS[month]} {year}
          </h2>
          <button
            onClick={next}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); }}
            className="ml-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            Today
          </button>
        </div>
        <button
          onClick={() => setModal({ date: today })}
          className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
        >
          <Plus size={16} />
          Add Event
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-white/10">
          {DAYS.map((d) => (
            <div
              key={d}
              className="py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {cells.map(({ date, current }, idx) => {
            const isToday = isSameDay(date, today);
            const dayEvents = events.filter((e: any) =>
              isSameDay(new Date(e.startAt), date),
            );
            const isLastCol = idx % 7 === 6;
            const isLastRow = idx >= 35;

            return (
              <div
                key={idx}
                onClick={() => setModal({ date })}
                className={[
                  'border-b border-r border-slate-200 dark:border-white/10',
                  'min-h-[110px] p-1.5 cursor-pointer transition-colors',
                  'hover:bg-slate-50 dark:hover:bg-white/5',
                  !current ? 'opacity-40' : '',
                  isLastCol ? 'border-r-0' : '',
                  isLastRow ? 'border-b-0' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full mb-1',
                    isToday
                      ? 'bg-brand text-white'
                      : 'text-slate-700 dark:text-slate-300',
                  ].join(' ')}
                >
                  {date.getDate()}
                </div>

                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((event: any) => (
                    <div
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); setModal({ event }); }}
                      className={[
                        'text-xs px-1.5 py-0.5 rounded text-white truncate cursor-pointer',
                        'hover:opacity-90 transition-opacity',
                        COLOR_BG[event.color] ?? 'bg-blue-500',
                      ].join(' ')}
                    >
                      {!event.allDay && (
                        <span className="mr-1 opacity-80">
                          {new Date(event.startAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 px-1">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modal && (
        <EventModal
          event={modal.event}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['calendar', year, month] });
            setModal(null);
          }}
        />
      )}
    </div>
  );
}
