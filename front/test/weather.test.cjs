const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/weather.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { exports: mod.exports });
const { parseWeather } = mod.exports;

// Shape and readings from the provider's actual response for Veria.
const current = {
  time: '2026-11-09T14:15',
  interval: 900,
  temperature_2m: 10.2,
  apparent_temperature: 9.6,
  relative_humidity_2m: 96,
  wind_speed_10m: 3.7,
  weather_code: 45,
  is_day: 1,
};

test('accepts Open-Meteo time metadata alongside numeric weather readings', () => {
  const response = { current, timezone: 'Europe/Athens' };
  assert.equal(parseWeather(response), response);
});

test('accepts zero and negative temperatures', () => {
  assert.equal(
    parseWeather({ current: { ...current, temperature_2m: -5, wind_speed_10m: 0, is_day: 0 } })
      .current.temperature_2m,
    -5,
  );
});

test('rejects missing and invalid readings while ignoring extra metadata', () => {
  for (const response of [null, {}, { current: null }, { current: {} }]) {
    assert.throws(() => parseWeather(response), /Invalid weather response/);
  }
  for (const field of [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'wind_speed_10m',
    'weather_code',
    'is_day',
  ]) {
    for (const value of [undefined, null, '10', NaN, Infinity]) {
      assert.throws(
        () => parseWeather({ current: { ...current, [field]: value } }),
        /Invalid weather response/,
      );
    }
  }
});
