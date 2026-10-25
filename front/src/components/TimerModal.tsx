import { Timer, X } from 'lucide-react';
import { useState } from 'react';

interface Props {
  deviceName: string;
  onConfirm: (minutes: number) => void | Promise<void>;
  onClose: () => void;
}

const PRESETS = [15, 30, 40, 60];

function formatTime(m: number): string {
  if (m < 60) return `${m} λεπτά`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}ώρ.` : `${h}ώρ. ${rem}λ.`;
}

export default function TimerModal({ deviceName, onConfirm, onClose }: Props) {
  const [minutes, setMinutes] = useState(40);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return;
    setPending(true);
    setError(null);
    try {
      await onConfirm(minutes);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Δεν ξεκίνησε ο χρονοδιακόπτης. Δοκιμάστε ξανά.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Χρονοδιακόπτης σβησίματος"
        className="bg-white dark:bg-[#1A222C] rounded-xl border border-slate-200 dark:border-white/10 shadow-xl w-full max-w-sm mx-4 p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
              <Timer size={16} className="text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Αυτόματο σβήσιμο
              </p>
              <p className="text-xs text-slate-400 truncate max-w-[160px]">{deviceName}</p>
            </div>
          </div>
          <button
            aria-label="Κλείσιμο χρονοδιακόπτη"
            onClick={onClose}
            disabled={pending}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Time display */}
        <div className="text-center my-6">
          <p className="text-5xl font-bold text-brand tabular-nums">{formatTime(minutes)}</p>
          <p className="text-xs text-slate-400 mt-2">
            Ανάβει τώρα και σβήνει αυτόματα, ακόμη και με κλειστή εφαρμογή
          </p>
        </div>

        {/* Slider */}
        <div className="space-y-3">
          <div className="relative h-2 rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="absolute h-2 rounded-full bg-brand transition-all"
              style={{ width: `${Math.min(100, ((minutes - 1) / (120 - 1)) * 100)}%` }}
            />
            <input
              aria-label="Επιλογή διάρκειας χρονοδιακόπτη"
              disabled={pending}
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
            <span>1λ.</span>
            <span>30λ.</span>
            <span>1ώρ.</span>
            <span>2ώρ.</span>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 mt-4">
          {PRESETS.map((m) => (
            <button
              key={m}
              disabled={pending}
              onClick={() => setMinutes(m)}
              className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                minutes === m
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {m < 60 ? `${m}λ.` : '1ώρ.'}
            </button>
          ))}
        </div>

        <label className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
          Διάρκεια (λεπτά)
          <input
            aria-label="Διάρκεια χρονοδιακόπτη σε λεπτά"
            type="number"
            min={1}
            max={1440}
            step={1}
            value={minutes}
            disabled={pending}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-24 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-white"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-xs text-red-500">
            {error}
          </p>
        )}
        <button
          disabled={pending || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440}
          onClick={confirm}
          className="w-full mt-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand/90 transition-colors"
        >
          {pending ? 'Εκκίνηση…' : 'Άναμμα και έναρξη μέτρησης'}
        </button>
      </div>
    </div>
  );
}
