const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { URL, URLSearchParams } = require('node:url');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');
function load(file, modules = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    URLSearchParams,
    require: (name) => modules[name] ?? require(name),
  });
  return exports;
}
const weather = load('lib/weather.ts');
const forecast = load('lib/weatherForecast.ts', { './weather': weather });
const cities = load('lib/greekCities.ts');
const presentation = load('lib/weatherPresentation.ts');
function fixture() {
  const days = ['2026-11-09', '2026-11-10'];
  const time = days.flatMap((day) =>
    Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`),
  );
  return {
    timezone: 'Europe/Athens',
    current: {
      time: '2026-11-09T14:15',
      temperature_2m: 10.5,
      apparent_temperature: 9.6,
      relative_humidity_2m: 96,
      wind_speed_10m: 3.7,
      weather_code: 45,
      is_day: 1,
      wind_direction_10m: 45,
      wind_gusts_10m: 10,
      pressure_msl: 1016,
      cloud_cover: 90,
      precipitation: 0,
    },
    hourly: {
      time,
      ...Object.fromEntries(
        [
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
        ].map((key) => [key, time.map(() => (key === 'weather_code' ? 45 : 0))]),
      ),
    },
    daily: {
      time: days,
      ...Object.fromEntries(
        [
          'weather_code',
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_probability_max',
          'precipitation_sum',
          'wind_speed_10m_max',
          'uv_index_max',
        ].map((key) => [key, [0, 0]]),
      ),
      sunrise: days.map((d) => `${d}T07:00`),
      sunset: days.map((d) => `${d}T17:00`),
    },
  };
}

test('forecast uses chosen city, temperature unit and Greek local time', () => {
  const url = new URL(forecast.forecastUrl(cities.getWeatherCity('veria'), 'F'));
  assert.equal(url.searchParams.get('latitude'), '40.5244');
  assert.equal(url.searchParams.get('temperature_unit'), 'fahrenheit');
  assert.equal(url.searchParams.get('forecast_days'), '7');
  assert.equal(url.searchParams.get('timezone'), 'Europe/Athens');
  assert.ok(url.searchParams.get('hourly').includes('precipitation_probability'));
});

test('forecast accepts zero and null readings but rejects missing or misaligned arrays', () => {
  const valid = fixture();
  valid.hourly.precipitation[0] = null;
  assert.equal(forecast.parseForecast(valid), valid);
  for (const mutate of [
    (data) => {
      data.daily.uv_index_max.pop();
    },
    (data) => {
      delete data.hourly.weather_code;
    },
    (data) => {
      data.daily.sunrise[0] = 'bad';
    },
    (data) => {
      data.hourly.temperature_2m[0] = '10';
    },
    (data) => {
      data.timezone = 'UTC';
    },
  ]) {
    const invalid = fixture();
    mutate(invalid);
    assert.throws(() => forecast.parseForecast(invalid), /Invalid forecast/);
  }
});

test('hours are grouped by city date without browser timezone conversion', () => {
  const data = fixture();
  assert.deepEqual(
    Array.from(forecast.hoursForDay(data, '2026-11-09')),
    Array.from({ length: 24 }, (_, i) => i),
  );
  assert.equal(forecast.hoursForDay(data, '2026-11-10')[0], 24);
  assert.match(forecast.forecastDate('2026-11-09'), /9/);
  assert.equal(forecast.windDirection(360), 'Β');
  assert.equal(forecast.windDirection(45), 'ΒΑ');
  assert.equal(forecast.weatherValue(null, '%'), '—');
  assert.equal(forecast.weatherValue(0, '%'), '0%');
});

function page(query, location = '/weather', preferredCity = 'veria') {
  let options;
  const { default: Page } = load('pages/WeatherPage.tsx', {
    '@tanstack/react-query': {
      useQuery: (config) => {
        options = config;
        return query;
      },
    },
    '../lib/greekCities': cities,
    '../lib/weatherForecast': forecast,
    '../lib/weatherPresentation': presentation,
    '../store/prefs.store': {
      usePrefsStore: (selector) => selector({ weatherCityId: preferredCity, tempUnit: 'C' }),
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(StaticRouter, { location }, React.createElement(Page)),
  );
  return { markup, options };
}

test('weather page renders today details, next-day forecast and navigation for preferred city', () => {
  const { markup, options } = page({
    data: fixture(),
    dataUpdatedAt: Date.UTC(2026, 10, 9, 12),
    refetch: () => {},
  });
  assert.match(markup, /Καιρός —/);
  assert.match(markup, /Βέροια/);
  assert.match(markup, /Πρόγνωση σήμερα/);
  assert.match(markup, /Οι επόμενες ημέρες/);
  assert.match(markup, /Πιθανότητα βροχής/);
  assert.match(markup, /Συνολικός υετός/);
  assert.match(markup, /aria-label="Πόλη πρόγνωσης"/);
  assert.equal(options.queryKey[1], 'veria');
  assert.equal(options.queryKey[2], 'C');
});

test('loading and failure show useful states while stale forecast stays visible', () => {
  assert.match(page({ isPending: true }).markup, /Φόρτωση πρόγνωσης/);
  assert.match(page({ isError: true }).markup, /Δεν ήταν δυνατή η φόρτωση/);
  const stale = page({ data: fixture(), isError: true, dataUpdatedAt: 0 }).markup;
  assert.match(stale, /τελευταία διαθέσιμη πρόγνωση/);
  assert.match(stale, /Σημερινός καιρός/);
});

test('city URL survives reload and overrides only the forecast view', () => {
  for (let reload = 0; reload < 2; reload++) {
    const { markup, options } = page({ isPending: true }, '/weather?city=athens', 'veria');
    assert.equal(options.queryKey[1], 'athens');
    assert.match(markup, /Αθήνα/);
    assert.match(markup, /Επαναφορά σε/);
    assert.match(markup, /Βέροια/);
  }
  assert.equal(page({ isPending: true }, '/weather', 'veria').options.queryKey[1], 'veria');
  assert.equal(
    page({ isPending: true }, '/weather?city=unknown', 'athens').options.queryKey[1],
    'athens',
  );
});
