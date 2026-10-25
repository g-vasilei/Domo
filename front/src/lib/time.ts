export type TimePeriod = 'AM' | 'PM';

export function timeParts(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return { hours: '', minutes: '', period: 'AM' as TimePeriod };
  }
  const [hours, minutes] = value.split(':');
  const hour = Number(hours);
  return {
    hours: String(hour % 12 || 12).padStart(2, '0'),
    minutes,
    period: (hour >= 12 ? 'PM' : 'AM') as TimePeriod,
  };
}

export function to24HourTime(hours: string, minutes: string, period: TimePeriod) {
  const h = Number(hours);
  const m = Number(minutes);
  if (
    !hours ||
    !minutes ||
    !Number.isInteger(h) ||
    h < 1 ||
    h > 12 ||
    !Number.isInteger(m) ||
    m < 0 ||
    m > 59
  )
    return '';
  return `${String((h % 12) + (period === 'PM' ? 12 : 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12(value: string) {
  const { hours, minutes, period } = timeParts(value);
  return hours ? `${Number(hours)}:${minutes} ${period}` : '—';
}
