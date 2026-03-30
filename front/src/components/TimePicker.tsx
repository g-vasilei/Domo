import { ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  value: string; // 'HH:MM'
  onChange: (val: string) => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function TimePicker({ value, onChange }: Props) {
  const [hStr, mStr] = (value || '00:00').split(':');
  const h = parseInt(hStr ?? '0', 10);
  const m = parseInt(mStr ?? '0', 10);

  const setH = (next: number) => onChange(`${pad((next + 24) % 24)}:${pad(m)}`);
  const setM = (next: number) => onChange(`${pad(h)}:${pad((next + 60) % 60)}`);

  const spinCls = 'flex flex-col items-center';
  const btnCls = 'p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors';
  const numCls = 'w-10 text-center text-lg font-semibold text-slate-800 dark:text-white select-none leading-none py-1';

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 w-fit">
      {/* Hours */}
      <div className={spinCls}>
        <button type="button" className={btnCls} onClick={() => setH(h + 1)}><ChevronUp size={14} /></button>
        <div className={numCls}>{pad(h)}</div>
        <button type="button" className={btnCls} onClick={() => setH(h - 1)}><ChevronDown size={14} /></button>
      </div>

      <span className="text-lg font-bold text-slate-400 pb-0.5">:</span>

      {/* Minutes */}
      <div className={spinCls}>
        <button type="button" className={btnCls} onClick={() => setM(m + 5)}><ChevronUp size={14} /></button>
        <div className={numCls}>{pad(m)}</div>
        <button type="button" className={btnCls} onClick={() => setM(m - 5)}><ChevronDown size={14} /></button>
      </div>
    </div>
  );
}
