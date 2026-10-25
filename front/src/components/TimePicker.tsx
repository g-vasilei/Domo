import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { timeParts, TimePeriod, to24HourTime } from '../lib/time';

interface Props {
  value: string; // HH:mm, independent of browser locale
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}
const pad = (value: number) => String(value).padStart(2, '0');
const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function TimePicker({
  value,
  onChange,
  label = 'Ώρα',
  required = false,
  disabled = false,
  className = '',
}: Props) {
  const [hours, setHours] = useState(timeParts(value).hours);
  const [minutes, setMinutes] = useState(timeParts(value).minutes);
  const [period, setPeriod] = useState<TimePeriod>(timeParts(value).period);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });
  const popupId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    const parts = timeParts(value);
    setHours(parts.hours);
    setMinutes(parts.minutes);
    setPeriod(parts.period);
  }, [value]);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(300, window.innerWidth - 24);
    const height = Math.min(392, window.innerHeight - 24);
    const below = window.innerHeight - rect.bottom - 12;
    setPosition({
      width,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(
        12,
        below >= height
          ? rect.bottom + 8
          : Math.min(rect.top - height - 8, window.innerHeight - height - 12),
      ),
    });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (
        !containerRef.current?.contains(event.target as Node) &&
        !popupRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const scroll = (event: Event) => {
      if (!popupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    popupRef.current
      ?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
      ?.focus({ preventScroll: true });
    popupRef.current
      ?.querySelectorAll<HTMLElement>('[aria-pressed="true"]')
      .forEach((option) => option.scrollIntoView({ block: 'nearest' }));
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  const publish = (h: string, m: string, nextPeriod = period) => {
    const next = to24HourTime(h, m, nextPeriod);
    lastEmitted.current = next;
    onChange(next);
  };
  const choose = (segment: 'hours' | 'minutes', number: number) => {
    const h =
      segment === 'hours' ? pad(number) : pad(Math.max(1, Math.min(12, Number(hours) || 12)));
    const m = segment === 'minutes' ? pad(number) : pad(Math.min(59, Number(minutes) || 0));
    setHours(h);
    setMinutes(m);
    publish(h, m);
  };
  const choosePeriod = (next: TimePeriod) => {
    setPeriod(next);
    publish(hours, minutes, next);
  };
  const step = (segment: 'hours' | 'minutes', amount: number) => {
    const h = Math.max(1, Math.min(12, Number(hours) || 12));
    const m = Number(minutes) || 0;
    const nextH = segment === 'hours' ? ((h - 1 + amount + 12) % 12) + 1 : h;
    const nextM = segment === 'minutes' ? (m + amount + 60) % 60 : m % 60;
    setHours(pad(nextH));
    setMinutes(pad(nextM));
    publish(pad(nextH), pad(nextM));
  };
  const segmentClass =
    'h-10 w-9 rounded-xl bg-transparent text-center text-base font-semibold tabular-nums text-slate-800 outline-none transition placeholder:text-slate-300 hover:bg-slate-100 focus:bg-brand/10 focus:text-brand disabled:cursor-not-allowed dark:text-slate-100 dark:placeholder:text-slate-600 dark:hover:bg-white/5 dark:focus:bg-brand/20';

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={label}
      className={`flex h-12 min-w-0 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 shadow-sm transition-all focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/10 dark:border-white/10 dark:bg-white/5 ${disabled ? 'opacity-40' : ''} ${className}`}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Επιλογή: ${label.toLowerCase()}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? popupId : undefined}
        disabled={disabled}
        onClick={toggle}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand transition hover:bg-brand/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-indigo-400"
      >
        <Clock3 size={16} aria-hidden="true" />
      </button>
      <div className="flex flex-1 items-center justify-center gap-0.5">
        <input
          ref={hourRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          pattern="(0?[1-9]|1[0-2])"
          aria-label={`${label} — ώρες`}
          placeholder="HH"
          required={required || minutes !== ''}
          disabled={disabled}
          value={hours}
          className={segmentClass}
          onFocus={(e) => e.currentTarget.select()}
          onInput={(e) => {
            const next = e.currentTarget.value.replace(/\D/g, '').slice(0, 2);
            setHours(next);
            publish(next, minutes);
          }}
          onBlur={() => {
            if (hours !== '' && Number(hours) >= 1 && Number(hours) <= 12)
              setHours(pad(Number(hours)));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              step('hours', e.key === 'ArrowUp' ? 1 : -1);
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              minuteRef.current?.focus();
            }
          }}
        />
        <span
          aria-hidden="true"
          className="pb-0.5 text-base font-medium text-slate-300 dark:text-slate-500"
        >
          :
        </span>
        <input
          ref={minuteRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          pattern="[0-5]?[0-9]"
          aria-label={`${label} — λεπτά`}
          placeholder="MM"
          required={required || hours !== ''}
          disabled={disabled}
          value={minutes}
          className={segmentClass}
          onFocus={(e) => e.currentTarget.select()}
          onInput={(e) => {
            const next = e.currentTarget.value.replace(/\D/g, '').slice(0, 2);
            setMinutes(next);
            publish(hours, next);
          }}
          onBlur={() => {
            if (minutes !== '' && Number(minutes) <= 59) setMinutes(pad(Number(minutes)));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              step('minutes', e.key === 'ArrowUp' ? 1 : -1);
            }
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              hourRef.current?.focus();
            }
          }}
        />
      </div>
      <select
        aria-label={`${label} — AM ή PM`}
        value={period}
        disabled={disabled}
        onChange={(event) => choosePeriod(event.target.value as TimePeriod)}
        className="rounded-xl bg-transparent py-1 text-xs font-semibold text-brand outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-indigo-400"
      >
        <option value="AM" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-white">
          AM
        </option>
        <option value="PM" className="bg-white text-slate-800 dark:bg-slate-800 dark:text-white">
          PM
        </option>
      </select>
      <div className="flex flex-col border-l border-slate-100 pl-1.5 dark:border-white/10">
        <button
          type="button"
          aria-label={`Αύξηση: ${label.toLowerCase()} κατά ένα λεπτό`}
          disabled={disabled}
          onClick={() => step('minutes', 1)}
          className="rounded-xl px-0.5 text-slate-400 hover:bg-brand/10 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          aria-label={`Μείωση: ${label.toLowerCase()} κατά ένα λεπτό`}
          disabled={disabled}
          onClick={() => step('minutes', -1)}
          className="rounded-xl px-0.5 text-slate-400 hover:bg-brand/10 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
        >
          <ChevronDown size={13} />
        </button>
      </div>
      {open &&
        !disabled &&
        createPortal(
          <div
            ref={popupRef}
            id={popupId}
            role="dialog"
            aria-label={`Επιλογή: ${label.toLowerCase()}`}
            style={{ ...position, maxHeight: 'calc(100vh - 24px)' }}
            className="fixed z-[100] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-300/40 dark:border-white/10 dark:bg-[#1A222C] dark:shadow-black/40"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-white">Επιλογή ώρας</p>
                <p className="mt-0.5 text-[10px] text-slate-400">12ωρη μορφή</p>
              </div>
              <span className="rounded-xl bg-brand/10 px-3 py-1.5 text-lg font-semibold tabular-nums text-brand dark:text-indigo-400">
                {pad(Math.max(1, Math.min(12, Number(hours) || 12)))}:
                {pad(Math.min(59, Number(minutes) || 0))} {period}
              </span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
              {(['AM', 'PM'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Επιλογή ${option}`}
                  aria-pressed={period === option}
                  onClick={() => choosePeriod(option)}
                  className={`rounded-xl py-2 text-xs font-semibold transition ${period === option ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-brand'}`}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 grid-cols-2 gap-3">
              {(['hours', 'minutes'] as const).map((segment) => (
                <div key={segment} className="min-h-0">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {segment === 'hours' ? 'Ώρες' : 'Λεπτά'}
                  </p>
                  <div
                    role="group"
                    aria-label={`Επιλογή ${segment === 'hours' ? 'ωρών' : 'λεπτών'}`}
                    className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto overscroll-contain rounded-xl bg-slate-50 p-1.5 dark:bg-white/5"
                  >
                    {Array.from({ length: segment === 'hours' ? 12 : 60 }, (_, index) => {
                      const number = segment === 'hours' ? index + 1 : index;
                      const selected =
                        (segment === 'hours' ? hours : minutes) !== '' &&
                        Number(segment === 'hours' ? hours : minutes) === number;
                      return (
                        <button
                          key={number}
                          type="button"
                          aria-label={`${pad(number)} ${segment === 'hours' ? 'Ώρες' : 'Λεπτά'}`}
                          aria-pressed={selected}
                          onClick={() => choose(segment, number)}
                          className={`flex h-8 shrink-0 items-center justify-center rounded-xl text-xs font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${selected ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-brand/10 hover:text-brand dark:text-slate-300'}`}
                        >
                          {pad(number)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => close(true)}
              className="mt-3 w-full rounded-xl bg-brand py-2 text-xs font-semibold text-white hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
            >
              Έτοιμο
            </button>
          </div>,
          document.body,
        )}
      {value && !validTime.test(value) && <span className="sr-only">Εισαγάγετε έγκυρη ώρα.</span>}
    </div>
  );
}
