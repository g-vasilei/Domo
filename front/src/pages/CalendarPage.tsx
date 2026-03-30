import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import EventModal from '../components/EventModal';
import { api } from '../lib/api';

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const COLOR_HEX: Record<string, string> = {
  blue: '#3b82f6',
  green: '#10b981',
  red: '#ef4444',
  yellow: '#f59e0b',
  purple: '#a855f7',
  orange: '#f97316',
};

const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-400',
  purple: 'bg-purple-500',
  orange: 'bg-orange-400',
};

const HOUR_HEIGHT = 64; // px per hour in week view

// ── Helpers ────────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function getMonthCells(year: number, month: number): { date: Date; current: boolean }[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: { date: Date; current: boolean }[] = [];

  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(year, month, d), current: true });
  const rem = 42 - cells.length;
  for (let d = 1; d <= rem; d++)
    cells.push({ date: new Date(year, month + 1, d), current: false });
  return cells;
}

function eventTop(event: any): number {
  const d = new Date(event.startAt);
  return (d.getHours() + d.getMinutes() / 60) * HOUR_HEIGHT;
}

function eventHeight(event: any): number {
  if (event.endAt) {
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();
    const hrs = (end - start) / 3_600_000;
    return Math.max(hrs * HOUR_HEIGHT, HOUR_HEIGHT * 0.5);
  }
  return HOUR_HEIGHT; // default 1 hour
}

// ── Week View ──────────────────────────────────────────────────────────────────

interface WeekViewProps {
  anchor: Date;
  events: any[];
  onSlotClick: (date: Date, hour: number) => void;
  onEventClick: (event: any) => void;
}

function WeekView({ anchor, events, onSlotClick, onEventClick }: WeekViewProps) {
  const days = getWeekDays(anchor);
  const today = new Date();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 16;
    }
  }, []);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Now indicator
  const nowTop = (today.getHours() + today.getMinutes() / 60) * HOUR_HEIGHT;
  const isCurrentWeek = days.some(d => isSameDay(d, today));

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
      {/* Day header row */}
      <div className="flex border-b border-slate-200 dark:border-white/10 flex-shrink-0">
        {/* Gutter for hour labels */}
        <div className="w-14 flex-shrink-0" />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today);
          return (
            <div key={i} className="flex-1 text-center py-2 border-l border-slate-200 dark:border-white/10">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {DAYS[day.getDay()]}
              </div>
              <div className={`w-8 h-8 mx-auto mt-0.5 flex items-center justify-center rounded-full text-sm font-semibold ${
                isToday ? 'bg-brand text-white' : 'text-slate-700 dark:text-slate-200'
              }`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Hour labels */}
          <div className="w-14 flex-shrink-0 relative">
            {hours.map(h => (
              <div
                key={h}
                className="absolute w-full flex items-start justify-end pr-2"
                style={{ top: h * HOUR_HEIGHT - 9, height: HOUR_HEIGHT }}
              >
                {h > 0 && (
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {pad(h)}:00
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => {
            const dayEvents = events.filter(e => !e.allDay && isSameDay(new Date(e.startAt), day));
            const isToday = isSameDay(day, today);

            return (
              <div
                key={di}
                className="flex-1 relative border-l border-slate-200 dark:border-white/10"
              >
                {/* Hour lines + click zones */}
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute w-full border-b border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                    style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    onClick={() => onSlotClick(day, h)}
                  />
                ))}

                {/* Current time indicator */}
                {isToday && isCurrentWeek && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: nowTop }}
                  >
                    <div className="flex items-center">
                      <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                      <div className="flex-1 h-px bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Events */}
                {dayEvents.map(event => (
                  <div
                    key={event.id}
                    onClick={e => { e.stopPropagation(); onEventClick(event); }}
                    className="absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 cursor-pointer z-20 overflow-hidden hover:brightness-110 transition-all"
                    style={{
                      top: eventTop(event) + 1,
                      height: Math.max(eventHeight(event) - 2, 20),
                      backgroundColor: COLOR_HEX[event.color] ?? COLOR_HEX.blue,
                    }}
                  >
                    <div className="text-white text-xs font-medium truncate leading-tight">
                      {new Date(event.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-white/90 text-xs truncate leading-tight">{event.title}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* All-day events strip */}
      {events.some(e => e.allDay && days.some(d => isSameDay(new Date(e.startAt), d))) && (
        <div className="flex border-t border-slate-200 dark:border-white/10 flex-shrink-0 min-h-[32px]">
          <div className="w-14 flex-shrink-0 flex items-center justify-end pr-2">
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide">All day</span>
          </div>
          {days.map((day, di) => {
            const dayAllDay = events.filter(e => e.allDay && isSameDay(new Date(e.startAt), day));
            return (
              <div key={di} className="flex-1 border-l border-slate-200 dark:border-white/10 p-0.5 space-y-0.5">
                {dayAllDay.map(ev => (
                  <div
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    className="text-xs text-white rounded px-1 truncate cursor-pointer hover:brightness-110"
                    style={{ backgroundColor: COLOR_HEX[ev.color] ?? COLOR_HEX.blue }}
                  >
                    {ev.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Month View ─────────────────────────────────────────────────────────────────

interface MonthViewProps {
  year: number;
  month: number;
  events: any[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: any) => void;
}

function MonthView({ year, month, events, onDayClick, onEventClick }: MonthViewProps) {
  const today = new Date();
  const cells = getMonthCells(year, month);

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-xl shadow overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-200 dark:border-white/10">
        {DAYS.map(d => (
          <div key={d} className="py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Cells */}
      <div className="grid grid-cols-7">
        {cells.map(({ date, current }, idx) => {
          const isToday = isSameDay(date, today);
          const dayEvents = events.filter(e => isSameDay(new Date(e.startAt), date));
          return (
            <div
              key={idx}
              onClick={() => onDayClick(date)}
              className={[
                'border-b border-r border-slate-200 dark:border-white/10 min-h-[110px] p-1.5 cursor-pointer transition-colors',
                'hover:bg-slate-50 dark:hover:bg-white/5',
                !current ? 'opacity-40' : '',
                idx % 7 === 6 ? 'border-r-0' : '',
                idx >= 35 ? 'border-b-0' : '',
              ].join(' ')}
            >
              <div className={`w-7 h-7 flex items-center justify-center text-sm font-medium rounded-full mb-1 ${
                isToday ? 'bg-brand text-white' : 'text-slate-700 dark:text-slate-300'
              }`}>
                {date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map(event => (
                  <div
                    key={event.id}
                    onClick={e => { e.stopPropagation(); onEventClick(event); }}
                    className="text-xs px-1.5 py-0.5 rounded text-white truncate cursor-pointer hover:brightness-110"
                    style={{ backgroundColor: COLOR_HEX[event.color] ?? COLOR_HEX.blue }}
                  >
                    {!event.allDay && (
                      <span className="mr-1 opacity-80 text-[10px]">
                        {new Date(event.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type View = 'month' | 'week';

export default function CalendarPage() {
  const today = new Date();
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(today);
  const [modal, setModal] = useState<{ event?: any; date?: Date; time?: string } | null>(null);
  const qc = useQueryClient();

  // Compute fetch range
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const from = view === 'month'
    ? new Date(year, month, 1).toISOString()
    : startOfWeek(anchor).toISOString();
  const to = view === 'month'
    ? new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    : (() => { const e = startOfWeek(anchor); e.setDate(e.getDate() + 6); e.setHours(23, 59, 59); return e.toISOString(); })();

  const { data: events = [] } = useQuery({
    queryKey: ['calendar', from, to],
    queryFn: () => api.get('/calendar', { params: { from, to } }).then(r => r.data),
  });

  const prev = () => {
    const d = new Date(anchor);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setAnchor(d);
  };

  const next = () => {
    const d = new Date(anchor);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setAnchor(d);
  };

  const title = view === 'month'
    ? `${MONTHS[month]} ${year}`
    : (() => {
        const days = getWeekDays(anchor);
        const s = days[0], e = days[6];
        if (s.getMonth() === e.getMonth()) return `${s.getDate()} – ${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
        return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${s.getFullYear()}`;
      })();

  const invalidate = () => qc.invalidateQueries({ queryKey: ['calendar'] });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-base font-semibold text-slate-800 dark:text-white min-w-[220px] text-center">
            {title}
          </h2>
          <button onClick={next} className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors">
            <ChevronRight size={20} />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="ml-1 text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-white/20 text-sm">
            {(['month', 'week'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                  view === v
                    ? 'bg-brand text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            onClick={() => setModal({ date: today })}
            className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            <Plus size={16} />
            Add Event
          </button>
        </div>
      </div>

      {/* Views */}
      {view === 'month' ? (
        <MonthView
          year={year}
          month={month}
          events={events}
          onDayClick={date => setModal({ date })}
          onEventClick={event => setModal({ event })}
        />
      ) : (
        <WeekView
          anchor={anchor}
          events={events}
          onSlotClick={(date, hour) => setModal({ date, time: `${pad(hour)}:00` })}
          onEventClick={event => setModal({ event })}
        />
      )}

      {modal && (
        <EventModal
          event={modal.event}
          defaultDate={modal.date}
          defaultTime={modal.time}
          onClose={() => setModal(null)}
          onSaved={() => { invalidate(); setModal(null); }}
        />
      )}
    </div>
  );
}
