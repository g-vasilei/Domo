export default function PowerSwitch({
  on,
  label,
  disabled = false,
  pending = false,
  onChange,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={on}
      aria-busy={pending}
      title={`${label}: ${on ? 'Ενεργό' : 'Ανενεργό'}`}
      disabled={disabled || pending}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-11 w-28 shrink-0 items-center rounded-xl border border-slate-200 bg-slate-100 p-1 transition-opacity focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-slate-900/60 dark:focus-visible:ring-offset-slate-800"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg border shadow-sm transition-all duration-200 motion-reduce:transition-none ${on ? 'translate-x-full border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/15' : 'translate-x-0 border-slate-200 bg-white dark:border-white/10 dark:bg-slate-700'}`}
      />
      <span
        aria-hidden="true"
        className={`relative z-10 flex flex-1 items-center justify-center text-[11px] font-semibold tracking-wide transition-colors ${on ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-100'}`}
      >
        OFF
      </span>
      <span
        aria-hidden="true"
        className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wide transition-colors ${on ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400 dark:text-slate-500'}`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
        />
        ON
      </span>
    </button>
  );
}
