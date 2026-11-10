import { useEffect, useState } from 'react';

const dateFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export default function GreeceClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <time
      dateTime={now.toISOString()}
      title="Ώρα Ελλάδας"
      className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-brand"
    >
      <span className="capitalize">{dateFormatter.format(now)}</span>
      <span className="tabular-nums">{timeFormatter.format(now)}</span>
    </time>
  );
}
