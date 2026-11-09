const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');
const source = fs.readFileSync(
  path.join(__dirname, '../src/components/IndoorTemperatureCard.tsx'),
  'utf8',
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
let tempUnit = 'C';
const exportsObject = {};
vm.runInNewContext(js, {
  exports: exportsObject,
  require: (name) =>
    name === '../store/prefs.store'
      ? { usePrefsStore: (selector) => selector({ tempUnit }) }
      : require(name),
});
const Card = exportsObject.default;
const thermometer = (value) => ({
  id: 'sensor',
  name: 'θερμοκρασία σαλόνι',
  category: 'wsdcg',
  online: true,
  status: [{ code: 'va_temperature', value }],
});
function render(props = {}) {
  return renderToStaticMarkup(
    React.createElement(
      StaticRouter,
      {},
      React.createElement(Card, {
        devices: [thermometer(194)],
        loading: false,
        failed: false,
        ...props,
      }),
    ),
  );
}

test('uses the thermometer instead of an air conditioner and respects Fahrenheit preference', () => {
  const devices = [
    { id: 'ac', category: 'kt', status: [{ code: 'temp_current', value: 25 }] },
    thermometer(194),
  ];
  assert.match(render({ devices }), /19,4/);
  tempUnit = 'F';
  assert.match(render({ devices }), /66,9/);
  tempUnit = 'C';
});

test('sensor tenths remain correct at zero and low/negative temperatures', () => {
  assert.match(render({ devices: [thermometer(50)] }), />5/);
  assert.match(render({ devices: [thermometer(0)] }), />0/);
  assert.match(render({ devices: [thermometer(-50)] }), />-5/);
});

test('unavailable configured sensor does not fall back to another thermometer', () => {
  assert.match(render({ preferredDeviceId: 'inaccessible' }), /Δεν βρέθηκε διαθέσιμο θερμόμετρο/);
  assert.match(render({ devices: [{ ...thermometer(194), online: false }] }), /τελευταία ένδειξη/);
});
