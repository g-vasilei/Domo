import { Home, LogOut, ShieldCheck,X } from 'lucide-react';
import { useEffect, useRef,useState } from 'react';

interface Props {
  mode: 'home' | 'away';
  seconds: number;
  isExitDelay?: boolean;
  onClose: () => void;
  onCancel: () => void;
}

export default function ArmCountdownModal({
  mode,
  seconds,
  isExitDelay = true,
  onClose,
  onCancel,
}: Props) {
  const [remaining, setRemaining] = useState(seconds);
  const [done, setDone] = useState(false);
  const closedRef = useRef(false);

  // Countdown tick
  useEffect(() => {
    if (remaining <= 0) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  // Auto-close after showing success for 1.5s
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      if (!closedRef.current) {
        closedRef.current = true;
        onClose();
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [done, onClose]);

  const progress = done ? 0 : (remaining / seconds) * 100;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (progress / 100) * circumference;

  const isHome = mode === 'home';
  const Icon = isHome ? Home : LogOut;
  const color = isHome ? '#10b981' : '#3b82f6';
  const label = isHome ? 'Armed — Home' : 'Armed — Away';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A222C] rounded-2xl w-full max-w-xs shadow-2xl flex flex-col items-center px-8 py-8 gap-6">
        {/* Cancel (only while counting) */}
        <div className="w-full flex justify-end -mb-2">
          {!done && (
            <button
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Cancel arming"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {done ? (
          /* ── Success state ── */
          <div className="flex flex-col items-center gap-4 py-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              <ShieldCheck size={32} style={{ color }} />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{label}</p>
              <p className="text-sm text-slate-400 mt-1">Armed successfully</p>
            </div>
          </div>
        ) : (
          <>
            {/* Circular countdown */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              <svg
                className="absolute inset-0 -rotate-90"
                width="128"
                height="128"
                viewBox="0 0 128 128"
              >
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-slate-100 dark:text-white/10"
                />
                <circle
                  cx="64"
                  cy="64"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  style={{ transition: 'stroke-dasharray 0.9s linear' }}
                />
              </svg>
              <div className="flex flex-col items-center">
                <span className="text-3xl font-bold tabular-nums" style={{ color }}>
                  {remaining}
                </span>
                <span className="text-[11px] text-slate-400 uppercase tracking-widest">sec</span>
              </div>
            </div>

            {/* Label */}
            <div className="flex flex-col items-center gap-2 text-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${color}18` }}
              >
                <Icon size={18} style={{ color }} />
              </div>
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{label}</p>
              <p className="text-sm text-slate-400">
                {isExitDelay ? (
                  <>
                    Leave the premises.
                    <br />
                    Alarm arms when countdown ends.
                  </>
                ) : (
                  <>Alarm is now active.</>
                )}
              </p>
            </div>

            {/* Cancel button */}
            <button
              onClick={onCancel}
              className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300 hover:border-red-400 hover:text-red-500 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
