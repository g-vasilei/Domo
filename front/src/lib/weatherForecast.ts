import { parseWeather, Weather } from './weather';

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'is_day',
] as const;
const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_probability_max',
  'precipitation_sum',
  'wind_speed_10m_max',
  'uv_index_max',
] as const;
const CURRENT_EXTRA_FIELDS = [
  'wind_direction_10m',
  'wind_gusts_10m',
  'pressure_msl',
  'cloud_cover',
  'precipitation',
] as const;
type Values<T extends string> = Record<T, (number | null)[]>;
export interface WeatherForecast extends Weather {
  timezone: string;
  current: Weather['current'] &
    Record<(typeof CURRENT_EXTRA_FIELDS)[number], number | null> & { time: string };
  hourly: Values<(typeof HOURLY_FIELDS)[number]> & { time: string[] };
  daily: Values<(typeof DAILY_FIELDS)[number]> & {
    time: string[];
    sunrise: (string | null)[];
    sunset: (string | null)[];
  };
}

export function forecastUrl(city: { latitude: number; longitude: number }, unit: 'C' | 'F') {
  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'weather_code',
      'is_day',
      ...CURRENT_EXTRA_FIELDS,
    ].join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: [...DAILY_FIELDS, 'sunrise', 'sunset'].join(','),
    temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
    wind_speed_unit: 'kmh',
    timezone: 'Europe/Athens',
    forecast_days: '7',
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseForecast(input: unknown): WeatherForecast {
  parseWeather(input);
  const data = input as WeatherForecast;
  const validNumber = (value: unknown) =>
    value === null || (typeof value === 'number' && Number.isFinite(value));
  const validTime = (value: unknown) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
  for (const [section, fields] of [
    [data.hourly, HOURLY_FIELDS],
    [data.daily, DAILY_FIELDS],
  ] as const) {
    if (
      !section ||
      !Array.isArray(section.time) ||
      !section.time.length ||
      !section.time.every((time) => typeof time === 'string' && /^\d{4}-\d{2}-\d{2}/.test(time))
    )
      throw new Error('Invalid forecast response');
    for (const field of fields) {
      const values = (section as unknown as Record<string, unknown>)[field];
      if (
        !Array.isArray(values) ||
        values.length !== section.time.length ||
        !values.every(validNumber)
      )
        throw new Error('Invalid forecast response');
    }
  }
  if (
    !validTime(data.current.time) ||
    !data.hourly.time.every(validTime) ||
    data.timezone !== 'Europe/Athens' ||
    !CURRENT_EXTRA_FIELDS.every((field) => validNumber(data.current[field]))
  )
    throw new Error('Invalid forecast response');
  for (const field of ['sunrise', 'sunset'] as const) {
    const values = data.daily[field];
    if (
      !Array.isArray(values) ||
      values.length !== data.daily.time.length ||
      !values.every((value) => value === null || validTime(value))
    )
      throw new Error('Invalid forecast response');
  }
  return data;
}

// Provider timestamps are local to the requested city; avoid interpreting them in the browser's timezone.
export function hoursForDay(forecast: WeatherForecast, day: string) {
  return forecast.hourly.time.flatMap((time, index) => (time.startsWith(`${day}T`) ? [index] : []));
}
export function forecastDate(
  day: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' },
) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('el-GR', { ...options, timeZone: 'UTC' });
}
export function windDirection(degrees: number | null) {
  if (degrees === null || !Number.isFinite(degrees)) return '—';
  return ['Β', 'ΒΑ', 'Α', 'ΝΑ', 'Ν', 'ΝΔ', 'Δ', 'ΒΔ'][
    Math.round((((degrees % 360) + 360) % 360) / 45) % 8
  ];
}
export function weatherValue(value: number | null | undefined, suffix = '', digits = 0) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString('el-GR', { maximumFractionDigits: digits })}${suffix}`
    : '—';
}
