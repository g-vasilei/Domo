import { Delete, X } from 'lucide-react';
import { useCallback, useState } from 'react';

interface Props {
  title: string;
  description?: string;
  onConfirm: (pin: string) => void;
  onClose: () => void;
  error?: string;
  loading?: boolean;
}

export default function PinPromptModal({
  title,
  description,
  onConfirm,
  onClose,
  error,
  loading,
}: Props) {
  const [pin, setPin] = useState('');

  const press = useCallback((d: string) => setPin((p) => (p.length < 8 ? p + d : p)), []);
  const del = useCallback(() => setPin((p) => p.slice(0, -1)), []);
  const submit = useCallback(() => {
    if (pin.length >= 4) onConfirm(pin);
  }, [pin, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A222C] rounded-2xl w-full max-w-xs shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6 flex flex-col items-center gap-5">
          {/* Dots */}
          <div className="flex gap-3">
            {Array.from({ length: Math.max(pin.length, 4) }).map((_, i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full border-2 transition-colors ${
                  i < pin.length
                    ? 'bg-brand border-brand'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
              />
            ))}
          </div>

          {error && <p className="text-red-500 text-xs text-center -mt-2">{error}</p>}

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                onClick={() => press(d)}
                disabled={loading}
                className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-brand/10 dark:hover:bg-white/10 active:scale-95 text-slate-800 dark:text-slate-100 text-lg font-semibold transition-all disabled:opacity-40"
              >
                {d}
              </button>
            ))}
            <button
              onClick={del}
              disabled={loading}
              className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 flex items-center justify-center transition-all disabled:opacity-40"
            >
              <Delete size={18} />
            </button>
            <button
              onClick={() => press('0')}
              disabled={loading}
              className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-brand/10 dark:hover:bg-white/10 active:scale-95 text-slate-800 dark:text-slate-100 text-lg font-semibold transition-all disabled:opacity-40"
            >
              0
            </button>
            <button
              onClick={submit}
              disabled={pin.length < 4 || loading}
              className="w-14 h-14 rounded-full bg-brand hover:bg-brand/90 disabled:opacity-30 text-white text-sm font-bold transition-all active:scale-95"
            >
              {loading ? '…' : 'OK'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
