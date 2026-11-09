const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');

function load(file, modules = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? require(name) });
  return exports;
}
const helpers = load('lib/temperatureSensors.ts');
let preferences = {
  tempUnit: 'C',
  dashboardTemperatureDeviceIds: ['sensor'],
  saving: false,
  saveError: '',
};
const thermometer = (value, id = 'sensor') => ({
  id,
  name: `Θερμόμετρο ${id}`,
  online: true,
  status: [
    { code: 'va_temperature', value },
    { code: 'va_humidity', value: 531 },
  ],
});
const ac = {
  id: 'ac',
  name: 'Κλιματιστικό',
  online: true,
  status: [{ code: 'temp_current', value: 18 }],
};
const rooms = [{ id: 'living', name: 'Σαλόνι', devices: [{ id: 'sensor' }, { id: 'ac' }] }];

function render(props = {}, open = false) {
  const { default: Card } = load('components/IndoorTemperatureCard.tsx', {
    '../lib/temperatureSensors': helpers,
    '../store/prefs.store': { usePrefsStore: (selector) => selector(preferences) },
    react: open
      ? {
          ...React,
          useState: (initial) => {
            const state = React.useState(initial);
            return initial === false ? [true, state[1]] : state;
          },
        }
      : React,
  });
  return renderToStaticMarkup(
    React.createElement(
      StaticRouter,
      {},
      React.createElement(Card, {
        devices: [thermometer(194)],
        rooms,
        loading: false,
        failed: false,
        ...props,
      }),
    ),
  );
}

test('includes actual temperature sensors and air conditioners, but excludes setpoints and humidity-only devices', () => {
  const sensors = helpers.temperatureSensors(
    [
      thermometer(194),
      ac,
      { id: 'setpoint', status: [{ code: 'temp_set', value: 24 }] },
      { id: 'humidity', status: [{ code: 'humidity_value', value: 70 }] },
    ],
    rooms,
  );
  assert.deepEqual(Array.from(sensors, (s) => s.device.id).sort(), ['ac', 'sensor']);
  assert.equal(sensors.find((s) => s.device.id === 'sensor').humidity, 53.1);
  assert.equal(sensors.find((s) => s.device.id === 'ac').humidity, null);
  assert.equal(sensors[0].room, 'Σαλόνι');
});

test('zero, low and negative temperatures retain tenths and humidity supports zero', () => {
  for (const value of [0, 50, -50])
    assert.equal(helpers.temperatureSensors([thermometer(value)], [])[0].celsius, value / 10);
  const sensor = helpers.temperatureSensors(
    [{ ...ac, status: [...ac.status, { code: 'humidity_value', value: 0 }] }],
    [],
  )[0];
  assert.equal(sensor.humidity, 0);
  assert.equal(sensor.room, 'Χωρίς δωμάτιο');
});

test('homepage renders only selected devices with room, temperature and optional humidity', () => {
  preferences.dashboardTemperatureDeviceIds = ['sensor', 'ac'];
  const markup = render({ devices: [thermometer(194), ac, thermometer(210, 'other')] });
  assert.match(markup, /Σαλόνι/);
  assert.match(markup, /19,4°C/);
  assert.match(markup, /53,1/);
  assert.match(markup, /18°C/);
  assert.ok(!markup.includes('Θερμόμετρο other'));
  assert.match(markup, /Προβολή όλων των θερμοκρασιών/);
  preferences.tempUnit = 'F';
  assert.match(render(), /66,9°F/);
  preferences.tempUnit = 'C';
});

test('empty or inaccessible selections never fall back to another device and display is capped at two', () => {
  const sensors = helpers.temperatureSensors(
    [thermometer(194), ac, thermometer(220, 'other')],
    rooms,
  );
  assert.equal(helpers.selectedTemperatureSensors(sensors, ['sensor', 'ac', 'other']).length, 2);
  preferences.dashboardTemperatureDeviceIds = ['inaccessible'];
  assert.match(render(), /Επιλέξτε έως 2/);
  preferences.dashboardTemperatureDeviceIds = [];
  assert.ok(!render().includes('19,4'));
});

test('all-devices modal groups every measurement and disables a third selection', () => {
  preferences.dashboardTemperatureDeviceIds = ['sensor', 'ac'];
  const markup = render({ devices: [thermometer(194), ac, thermometer(210, 'other')] }, true);
  assert.match(markup, /<dialog/);
  assert.match(markup, /Θερμόμετρο other/);
  assert.match(markup, /Χωρίς δωμάτιο/);
  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 3);
  assert.match(markup, /aria-label="Εμφάνιση στην αρχική: Θερμόμετρο other"[^>]*disabled/);
});

test('offline sensors identify their reading as last-known and missing values remain unavailable', () => {
  preferences.dashboardTemperatureDeviceIds = ['sensor'];
  assert.match(render({ devices: [{ ...thermometer(194), online: false }] }), /τελευταία ένδειξη/);
  assert.match(render({ devices: [thermometer(null)] }), /Δεν υπάρχει διαθέσιμη μέτρηση/);
});
