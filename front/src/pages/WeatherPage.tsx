import { useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CloudRain,
  Droplets,
  Gauge,
  MapPin,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getWeatherCity, GREEK_CITIES } from '../lib/greekCities';
import {
  forecastDate,
  forecastUrl,
  hoursForDay,
  parseForecast,
  WeatherForecast,
  weatherValue,
  windDirection,
} from '../lib/weatherForecast';
import { weatherConditions } from '../lib/weatherPresentation';
import { usePrefsStore } from '../store/prefs.store';

const panel = 'rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#1A222C]';
const button =
  'flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:border-sky-400 disabled:opacity-40 dark:border-white/10 dark:text-slate-300';

function HourlyForecast({
  forecast,
  day,
  unit,
}: {
  forecast: WeatherForecast;
  day: string;
  unit: string;
}) {
  const [step, setStep] = useState(3);
  const indexes = hoursForDay(forecast, day).filter(
    (i) => Number(forecast.hourly.time[i].slice(11, 13)) % step === 0,
  );
  const hourly = forecast.hourly;
  const cell = 'px-4 py-3 whitespace-nowrap';
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Αναλυτική πρόγνωση
        </h3>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-white/5">
          {[3, 1].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={step === value}
              onClick={() => setStep(value)}
              className={`rounded-md px-3 py-1.5 text-xs ${step === value ? 'bg-white text-sky-600 shadow-sm dark:bg-slate-700 dark:text-sky-300' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {value === 1 ? 'Ανά ώρα' : 'Ανά 3 ώρες'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
          <caption className="sr-only">Πρόγνωση για {forecastDate(day)}. Ώρες Ελλάδας.</caption>
          <thead className="border-y border-slate-100 bg-slate-50 text-xs text-slate-400 dark:border-white/10 dark:bg-white/5">
            <tr>
              {[
                'Ώρα',
                'Καιρός',
                `Θερμοκρασία °${unit}`,
                `Αισθητή °${unit}`,
                'Υγρασία',
                'Πιθανότητα βροχής',
                'Υετός',
                'Άνεμος',
                'Ριπές',
              ].map((title) => (
                <th key={title} scope="col" className={`${cell} font-medium`}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {indexes.map((i) => {
              const { Icon, label } = weatherConditions(
                hourly.weather_code[i] ?? -1,
                hourly.is_day[i] === 1,
              );
              return (
                <tr key={hourly.time[i]} className="hover:bg-sky-50/50 dark:hover:bg-white/5">
                  <th
                    scope="row"
                    className={`${cell} font-semibold text-slate-700 dark:text-slate-100`}
                  >
                    {hourly.time[i].slice(11, 16)}
                  </th>
                  <td className={cell}>
                    <span className="flex items-center gap-2">
                      <Icon size={21} strokeWidth={1.5} className="shrink-0 text-sky-500" />
                      {label}
                    </span>
                  </td>
                  <td className={`${cell} font-semibold text-slate-800 dark:text-slate-100`}>
                    {weatherValue(hourly.temperature_2m[i], '°')}
                  </td>
                  <td className={cell}>{weatherValue(hourly.apparent_temperature[i], '°')}</td>
                  <td className={cell}>{weatherValue(hourly.relative_humidity_2m[i], '%')}</td>
                  <td className={cell}>{weatherValue(hourly.precipitation_probability[i], '%')}</td>
                  <td className={cell}>{weatherValue(hourly.precipitation[i], ' mm', 1)}</td>
                  <td className={cell}>
                    {weatherValue(hourly.wind_speed_10m[i], ' km/h')}{' '}
                    <span className="text-xs text-slate-400">
                      {windDirection(hourly.wind_direction_10m[i])}
                    </span>
                  </td>
                  <td className={cell}>{weatherValue(hourly.wind_gusts_10m[i], ' km/h')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!indexes.length && (
          <p className="p-5 text-sm text-slate-400">
            Δεν υπάρχουν ωριαία δεδομένα για αυτή την ημέρα.
          </p>
        )}
      </div>
    </div>
  );
}

export default function WeatherPage() {
  const cityId = usePrefsStore((s) => s.weatherCityId);
  const unit = usePrefsStore((s) => s.tempUnit);
  const [searchParams, setSearchParams] = useSearchParams();
  const city =
    GREEK_CITIES.find((entry) => entry.id === searchParams.get('city')) ?? getWeatherCity(cityId);
  const defaultCity = getWeatherCity(cityId);
  const [selectedDay, setSelectedDay] = useState('');
  const weather = useQuery({
    queryKey: ['weather-forecast', city.id, unit],
    queryFn: async ({ signal }) => {
      const response = await fetch(forecastUrl(city, unit), { signal });
      if (!response.ok) throw new Error('Forecast unavailable');
      return parseForecast(await response.json());
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
    retry: 1,
  });
  const forecast = weather.data;
  const current = forecast?.current;
  const daily = forecast?.daily;
  const today = current?.time.slice(0, 10);
  const todayIndex = daily?.time.indexOf(today ?? '') ?? -1;
  const futureDays =
    daily?.time.map((day, index) => ({ day, index })).filter(({ day }) => day > (today ?? '')) ??
    [];
  const expandedDay = futureDays.some(({ day }) => day === selectedDay)
    ? selectedDay
    : futureDays[0]?.day;
  const { Icon, label } = weatherConditions(current?.weather_code ?? -1, current?.is_day === 1);
  const localTime = (time: string | null | undefined) => time?.slice(11, 16) ?? '—';
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <MapPin size={21} className="text-sky-500" />
            Καιρός — {city.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              Πόλη
              <select
                aria-label="Πόλη πρόγνωσης"
                value={city.id}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams);
                  next.set('city', event.target.value);
                  setSearchParams(next);
                  setSelectedDay('');
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-sky-400 dark:border-white/10 dark:bg-[#1A222C] dark:text-slate-100"
              >
                {GREEK_CITIES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.id === defaultCity.id ? ' (Προεπιλογή)' : ''}
                  </option>
                ))}
              </select>
            </label>
            {searchParams.has('city') && (
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('city');
                  setSearchParams(next);
                  setSelectedDay('');
                }}
                className="text-xs text-sky-600 hover:underline dark:text-sky-400"
              >
                Επαναφορά σε {defaultCity.name}
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">Η επιλογή ισχύει μόνο για αυτή τη σελίδα.</p>
        </div>
        <button
          type="button"
          onClick={() => void weather.refetch()}
          disabled={weather.isFetching}
          className={button}
        >
          <RefreshCw size={15} className={weather.isFetching ? 'animate-spin' : ''} />
          Ανανέωση
        </button>
      </div>
      {weather.isPending && (
        <div role="status" className={`${panel} p-10 text-center text-sm text-slate-400`}>
          Φόρτωση πρόγνωσης…
        </div>
      )}
      {weather.isError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
        >
          {forecast
            ? 'Η ανανέωση απέτυχε. Εμφανίζεται η τελευταία διαθέσιμη πρόγνωση.'
            : 'Δεν ήταν δυνατή η φόρτωση της πρόγνωσης. Δοκιμάστε ξανά με την Ανανέωση.'}
        </div>
      )}
      {forecast && current && daily && today && (
        <>
          <section
            aria-label="Σημερινός καιρός"
            className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white p-5 md:p-6 dark:border-sky-400/20 dark:from-sky-950/50 dark:via-[#1A222C] dark:to-[#1A222C]"
          >
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
                  Σήμερα · {forecastDate(today)}
                </p>
                <div className="mt-5 flex items-center gap-5">
                  <Icon size={64} strokeWidth={1.3} className="text-sky-500 dark:text-sky-400" />
                  <div>
                    <p className="text-5xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                      {weatherValue(current.temperature_2m, `°${unit}`)}
                    </p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {label} · {localTime(current.time)}
                    </p>
                  </div>
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <Thermometer size={15} />
                  Αισθητή {weatherValue(current.apparent_temperature, `°${unit}`)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-xl bg-white/60 p-4 text-sm dark:bg-white/5">
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <ArrowUp size={13} /> Μέγιστη
                  </p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                    {weatherValue(daily.temperature_2m_max[todayIndex], `°${unit}`)}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <ArrowDown size={13} /> Ελάχιστη
                  </p>
                  <p className="mt-1 font-semibold text-slate-800 dark:text-slate-100">
                    {weatherValue(daily.temperature_2m_min[todayIndex], `°${unit}`)}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Sunrise size={13} /> Ανατολή
                  </p>
                  <p className="mt-1 text-slate-700 dark:text-slate-200">
                    {localTime(daily.sunrise[todayIndex])}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <Sunset size={13} /> Δύση
                  </p>
                  <p className="mt-1 text-slate-700 dark:text-slate-200">
                    {localTime(daily.sunset[todayIndex])}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                {
                  title: 'Υγρασία',
                  value: weatherValue(current.relative_humidity_2m, '%'),
                  icon: Droplets,
                },
                {
                  title: `Άνεμος · ${windDirection(current.wind_direction_10m)}`,
                  value: weatherValue(current.wind_speed_10m, ' km/h'),
                  icon: Wind,
                },
                {
                  title: 'Ριπές ανέμου',
                  value: weatherValue(current.wind_gusts_10m, ' km/h'),
                  icon: Wind,
                },
                {
                  title: 'Πίεση επιπέδου θάλασσας',
                  value: weatherValue(current.pressure_msl, ' hPa'),
                  icon: Gauge,
                },
                {
                  title: 'Πιθανότητα βροχής σήμερα',
                  value: weatherValue(daily.precipitation_probability_max[todayIndex], '%'),
                  icon: CloudRain,
                },
                {
                  title: 'Συνολικός υετός σήμερα',
                  value: weatherValue(daily.precipitation_sum[todayIndex], ' mm', 1),
                  icon: CloudRain,
                },
                {
                  title: 'Νεφοκάλυψη τώρα',
                  value: weatherValue(current.cloud_cover, '%'),
                  icon: Sun,
                },
                {
                  title: 'Μέγιστος δείκτης UV',
                  value: weatherValue(daily.uv_index_max[todayIndex], '', 1),
                  icon: Sun,
                },
              ].map(({ title, value, icon: MetricIcon }) => (
                <div
                  key={title}
                  className="rounded-xl border border-sky-100 bg-white/70 p-3 dark:border-white/5 dark:bg-white/5"
                >
                  <p className="flex items-center gap-1.5 text-xs text-slate-400">
                    <MetricIcon size={13} className="shrink-0" />
                    {title}
                  </p>
                  <p className="mt-2 text-base font-semibold text-slate-700 dark:text-slate-100">
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section aria-label="Πρόγνωση σήμερα" className={`${panel} min-w-0 overflow-hidden`}>
            <h2 className="px-5 pt-5 text-base font-semibold text-slate-800 dark:text-slate-100">
              Σήμερα
            </h2>
            <HourlyForecast
              key={`${city.id}-${unit}-${today}`}
              forecast={forecast}
              day={today}
              unit={unit}
            />
          </section>
          <section aria-label="Πρόγνωση επόμενων ημερών" className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                Οι επόμενες ημέρες
              </h2>
              <p className="mt-1 text-xs text-slate-400">Επιλέξτε ημέρα για αναλυτική πρόγνωση.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {futureDays.map(({ day, index }) => {
                const { Icon: DayIcon, label: dayLabel } = weatherConditions(
                  daily.weather_code[index] ?? -1,
                  true,
                );
                const active = day === expandedDay;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={active}
                    aria-controls="future-hourly"
                    onClick={() => setSelectedDay(day)}
                    className={`rounded-xl border p-4 text-left transition-colors ${active ? 'border-sky-400 bg-sky-50 dark:border-sky-400/40 dark:bg-sky-950/30' : 'border-slate-200 bg-white hover:border-sky-300 dark:border-white/10 dark:bg-[#1A222C]'}`}
                  >
                    <p className="flex items-center justify-between gap-2 text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">
                      {forecastDate(day, { weekday: 'long', day: 'numeric', month: 'short' })}
                      <ChevronDown
                        size={15}
                        className={active ? 'text-sky-500' : 'text-slate-400'}
                      />
                    </p>
                    <div className="my-3 flex items-center justify-between gap-3">
                      <DayIcon size={32} strokeWidth={1.5} className="text-sky-500" />
                      <p>
                        <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
                          {weatherValue(daily.temperature_2m_max[index], '°')}
                        </span>
                        <span className="ml-2 text-sm text-slate-400">
                          {weatherValue(daily.temperature_2m_min[index], `°${unit}`)}
                        </span>
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{dayLabel}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Droplets size={13} />
                        {weatherValue(daily.precipitation_probability_max[index], '%')} ·{' '}
                        {weatherValue(daily.precipitation_sum[index], ' mm', 1)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Wind size={13} />
                        {weatherValue(daily.wind_speed_10m_max[index], ' km/h')}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {expandedDay && (
              <div id="future-hourly" className={`${panel} min-w-0 overflow-hidden`}>
                <h3 className="px-5 pt-5 text-sm font-semibold capitalize text-slate-700 dark:text-slate-200">
                  {forecastDate(expandedDay)}
                </h3>
                <HourlyForecast
                  key={`${city.id}-${unit}-${expandedDay}`}
                  forecast={forecast}
                  day={expandedDay}
                  unit={unit}
                />
              </div>
            )}
          </section>
          <p className="text-xs leading-relaxed text-slate-400">
            Ώρες Ελλάδας · Θερμοκρασίες σε °{unit} · Υετός: βροχή και χιόνι σε ισοδύναμο νερού.
            <br />
            Ενημέρωση{' '}
            {new Date(weather.dataUpdatedAt).toLocaleTimeString('el-GR', {
              timeZone: 'Europe/Athens',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · Πρόγνωση από{' '}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Open-Meteo
            </a>
          </p>
        </>
      )}
    </div>
  );
}
