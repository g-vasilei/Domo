const CURRENT_WEATHER_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'wind_speed_10m',
  'weather_code',
  'is_day',
] as const;

export interface Weather {
  current: Record<(typeof CURRENT_WEATHER_FIELDS)[number], number>;
}

export function parseWeather(data: unknown): Weather {
  if (!data || typeof data !== 'object' || !('current' in data)) {
    throw new Error('Invalid weather response');
  }
  const current = data.current;
  if (
    !current ||
    typeof current !== 'object' ||
    !CURRENT_WEATHER_FIELDS.every(
      (field) => field in current && Number.isFinite((current as Record<string, unknown>)[field]),
    )
  ) {
    throw new Error('Invalid weather response');
  }
  // Open-Meteo also includes metadata such as time (ISO string) and interval.
  return data as Weather;
}
