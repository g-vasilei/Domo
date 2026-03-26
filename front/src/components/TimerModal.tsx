import { Timer, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  deviceName: string;
  onConfirm: (minutes: number) => void;
  onClose: () => void;
}

const PRESETS = [5, 15, 30, 60];

function formatTime(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export default function TimerModal({ deviceName, onConfirm, onClose }: Props) {
  const [minutes, setMinutes] = useState(30);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A222C] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl w-full max-w-sm mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <Timer size={16} className="text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Auto-off Timer
              </p>
              <p className="text-xs text-slate-400 truncate max-w-[160px]">{deviceName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Time display */}
        <div className="text-center my-6">
          <p className="text-5xl font-bold text-brand tabular-nums">{formatTime(minutes)}</p>
          <p className="text-xs text-slate-400 mt-2">
            Device turns off automatically after this delay
          </p>
        </div>

        {/* Slider */}
        <div className="space-y-3">
          <div className="relative h-2 rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="absolute h-2 rounded-full bg-brand transition-all"
              style={{ width: `${((minutes - 1) / (120 - 1)) * 100}%` }}
            />
            <input
              type="range"
              min={1}
              max={120}
              step={1}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>1m</span>
            <span>30m</span>
            <span>1h</span>
            <span>2h</span>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 mt-4">
          {PRESETS.map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                minutes === m
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {m < 60 ? `${m}m` : '1h'}
            </button>
          ))}
        </div>

        <button
          onClick={() => onConfirm(minutes)}
          className="w-full mt-5 py-2.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-brand/90 transition-colors"
        >
          Turn On & Start Timer
        </button>
      </div>
    </div>
  );
}
