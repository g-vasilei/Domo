import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseDate(val: string): Date {
  const [y, m, d] = val.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(val: string): string {
  if (!val) return 'Pick a date';
  const d = parseDate(val);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
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
  const [viewDate, setViewDate] = useState(() => {
    const d = value ? parseDate(value) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay();
  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const daysInPrev = new Date(viewDate.year, viewDate.month, 0).getDate();

  const cells: { date: Date; current: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ date: new Date(viewDate.year, viewDate.month - 1, daysInPrev - i), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(viewDate.year, viewDate.month, d), current: true });
  while (cells.length < 42)
    cells.push({ date: new Date(viewDate.year, viewDate.month + 1, cells.length - firstDay - daysInMonth + 1), current: false });

  const prevMonth = () => {
    setViewDate(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  };
  const nextMonth = () => {
    setViewDate(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  };

  const today = new Date();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 text-slate-800 dark:text-white text-sm text-left focus:outline-none focus:ring-2 focus:ring-brand"
      >
        {formatDisplay(value)}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl shadow-xl p-3 w-64">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-800 dark:text-white">
              {MONTHS[viewDate.month]} {viewDate.year}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_SHORT.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-400 uppercase py-1">{d}</div>
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
                  onClick={() => { onChange(val); setOpen(false); }}
                  className={[
                    'w-8 h-8 text-xs rounded-full flex items-center justify-center transition-colors',
                    !current ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200',
                    isSelected ? 'bg-brand text-white' : isToday ? 'border border-brand text-brand' : 'hover:bg-slate-100 dark:hover:bg-white/10',
                  ].join(' ')}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
