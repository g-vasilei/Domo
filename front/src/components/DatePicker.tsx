import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MONTHS = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
];
const DAYS_SHORT = ['Κυ', 'Δε', 'Τρ', 'Τε', 'Πέ', 'Πα', 'Σά'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseDate(val: string): Date {
  const [y, m, d] = val.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(val: string): string {
  if (!val) return 'Επιλέξτε ημερομηνία';
  const d = parseDate(val);
  return d.toLocaleDateString('el-GR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export default function DatePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ above: false, maxHeight: 360 });
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? parseDate(value) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    if (open) {
      document.addEventListener('mousedown', onClickOutside);
      document.addEventListener('keydown', onEscape);
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const daysInPrev = new Date(viewDate.year, viewDate.month, 0).getDate();

  const cells: { date: Date; current: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({
      date: new Date(viewDate.year, viewDate.month - 1, daysInPrev - i),
      current: false,
    });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(viewDate.year, viewDate.month, d), current: true });
  while (cells.length < 42)
    cells.push({
      date: new Date(viewDate.year, viewDate.month + 1, cells.length - firstDay - daysInMonth + 1),
      current: false,
    });

  const prevMonth = () => {
    setViewDate((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 },
    );
  };
  const nextMonth = () => {
    setViewDate((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 },
    );
  };

  const today = new Date();

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Επιλογή ημερομηνίας"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (rect) {
              const below = window.innerHeight - rect.bottom - 16;
              const above = rect.top - 16;
              const useAbove = below < 360 && above > below;
              setPlacement({ above: useAbove, maxHeight: Math.max(160, useAbove ? above : below) });
            }
            const date = value ? parseDate(value) : new Date();
            setViewDate({ year: date.getFullYear(), month: date.getMonth() });
          }
          setOpen((o) => !o);
        }}
        className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 text-left text-sm font-medium text-slate-700 shadow-sm transition hover:border-brand/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 dark:border-white/10 dark:bg-white/5 dark:text-white"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand dark:text-indigo-400">
          <CalendarDays size={15} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate">{formatDisplay(value)}</span>
        <ChevronDown size={14} aria-hidden="true" className="text-slate-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Επιλογή ημερομηνίας"
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute z-50 left-0 overflow-y-auto bg-white dark:bg-[#1A222C] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/30 p-4 w-[280px] max-w-[calc(100vw-3rem)] ${placement.above ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              aria-label="Προηγούμενος μήνας"
              onClick={prevMonth}
              className="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-800 dark:text-white">
              {MONTHS[viewDate.month]} {viewDate.year}
            </span>
            <button
              type="button"
              aria-label="Επόμενος μήνας"
              onClick={nextMonth}
              className="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold text-slate-400 uppercase py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(({ date, current }, i) => {
              const val = toValue(date);
              const isSelected = val === value;
              const isToday = toValue(date) === toValue(today);
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={date.toLocaleDateString('el-GR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(val);
                    close();
                  }}
                  className={[
                    'h-8 w-full text-xs rounded-xl flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    !current
                      ? 'text-slate-300 dark:text-slate-600'
                      : 'text-slate-700 dark:text-slate-200',
                    isSelected
                      ? 'bg-brand text-white'
                      : isToday
                        ? 'border border-brand text-brand'
                        : 'hover:bg-slate-100 dark:hover:bg-white/10',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/10">
            <span className="text-[10px] text-slate-400">
              {value ? formatDisplay(value) : 'Επιλέξτε ημέρα'}
            </span>
            <button
              type="button"
              onClick={() => {
                onChange(toValue(today));
                close();
              }}
              className="rounded-xl bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand"
            >
              Σήμερα
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
