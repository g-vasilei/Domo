import { useQuery } from '@tanstack/react-query';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  MapPin,
  Moon,
  RefreshCw,
  Sun,
  Wind,
} from 'lucide-react';

import { getWeatherCity } from '../lib/greekCities';
import { parseWeather, Weather } from '../lib/weather';
import { usePrefsStore } from '../store/prefs.store';

function conditions(code: number, day: boolean) {
  if (code === 0) return { label: day ? 'Αίθριος καιρός' : 'Ξαστεριά', Icon: day ? Sun : Moon };
  if (code === 1 || code === 2) return { label: 'Λίγες νεφώσεις', Icon: day ? CloudSun : Cloud };
  if (code === 3) return { label: 'Συννεφιά', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Ομίχλη', Icon: CloudFog };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Ψιλόβροχο', Icon: CloudDrizzle };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Βροχή', Icon: CloudRain };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: 'Χιονόπτωση', Icon: CloudSnow };
  if ([95, 96, 99].includes(code)) return { label: 'Καταιγίδα', Icon: CloudLightning };
  return { label: 'Καιρός', Icon: Cloud };
}

export default function WeatherCard() {
  const unit = usePrefsStore((s) => s.tempUnit);
  const cityId = usePrefsStore((s) => s.weatherCityId);
  const city = getWeatherCity(cityId);
  const { latitude, longitude } = city;
  const weather = useQuery<Weather>({
    queryKey: ['weather', latitude, longitude, unit],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current:
          'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day',
        temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
        wind_speed_unit: 'kmh',
        timezone: 'auto',
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
      if (!response.ok) throw new Error('Weather unavailable');
      return parseWeather(await response.json());
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
    retry: 1,
  });
  const current = weather.data?.current;
  const { label, Icon } = conditions(current?.weather_code ?? -1, current?.is_day === 1);
  const failed = weather.isError;
  const loading = weather.isPending;

  return (
    <section
      aria-label={`Καιρός — ${city.name}`}
      className="flex h-full min-w-0 flex-col rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 dark:border-sky-400/20 dark:from-sky-950/50 dark:to-[#1A222C]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <MapPin size={15} className="text-sky-500" /> Καιρός — {city.name}
        </h2>
        <button
          type="button"
          aria-label="Ανανέωση καιρού"
          disabled={weather.isFetching}
          onClick={() => {
            void weather.refetch();
          }}
          className="rounded-lg p-2 text-slate-400 hover:text-sky-500 disabled:opacity-40"
        >
          <RefreshCw size={15} className={weather.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
      <div aria-live="polite" className="flex flex-1 flex-col justify-center">
        {loading ? (
          <p className="py-6 text-sm text-slate-500 dark:text-slate-400">Φόρτωση καιρού…</p>
        ) : !current && failed ? (
          <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
            Ο καιρός δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά.
          </p>
        ) : current ? (
          <>
            <div className="mt-4 flex flex-col items-start gap-4">
              <div className="flex items-center gap-4">
                <Icon
                  size={40}
                  strokeWidth={1.5}
                  className="shrink-0 text-sky-500 dark:text-sky-400"
                />
                <div>
                  <p className="text-4xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                    {Math.round(current.temperature_2m)}°{unit}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
                <div>
                  <p className="text-xs text-slate-400">Αισθητή</p>
                  <p className="mt-1 font-medium">
                    {Math.round(current.apparent_temperature)}°{unit}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Droplets size={13} /> Υγρασία
                  </p>
                  <p className="mt-1 font-medium">{current.relative_humidity_2m}%</p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Wind size={13} /> Άνεμος
                  </p>
                  <p className="mt-1 font-medium">{Math.round(current.wind_speed_10m)} km/h</p>
                </div>
              </div>
            </div>
            {failed && (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                Η ανανέωση απέτυχε. Εμφανίζονται τα τελευταία διαθέσιμα δεδομένα.
              </p>
            )}
            <p className="mt-4 text-xs text-slate-400">
              Ενημέρωση{' '}
              {new Date(weather.dataUpdatedAt).toLocaleTimeString('el-GR', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              ·{' '}
              <a
                href="https://open-meteo.com/"
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                Open-Meteo
              </a>
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
