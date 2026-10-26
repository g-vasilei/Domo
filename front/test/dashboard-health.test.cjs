const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, modules = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? require(name) });
  return exports;
}
const health = load('lib/deviceHealth.ts');
const battery = (value, code = 'battery_percentage') => [{ code, value }];
const device = (id, status = [], online = false) => ({ id, name: id, online, status });

test('battery detection preserves zero, supports numeric codes and categorical low', () => {
  for (const code of ['battery_percentage', 'battery_value', 'residual_electricity']) {
    assert.equal(health.lowBattery(battery(0, code)), 0);
    assert.equal(health.lowBattery(battery(19, code)), 19);
    assert.equal(health.lowBattery(battery(20, code)), null);
  }
  assert.equal(health.lowBattery(battery(150)), 15);
  assert.equal(health.lowBattery(battery('low', 'battery_state')), 'low');
});

test('unknown or malformed battery readings never imply low battery', () => {
  for (const value of [-1, 1001, NaN, Infinity, '10', null, true]) {
    assert.equal(health.lowBattery(battery(value)), null);
  }
  assert.equal(health.lowBattery(undefined), null);
  assert.equal(health.lowBattery(battery(50)), null);
});

test('attention summary only includes devices visible to the viewer', () => {
  const devices = [device('a', battery(5)), device('b', battery(10))];
  assert.equal(health.deviceHealth(devices).offline.length, 0);
  assert.equal(health.deviceHealth(devices, { role: 'OWNER' }).offline.length, 2);
  const member = { role: 'MEMBER', permissions: { canViewDevices: true, allowedDeviceIds: ['a'] } };
  const result = health.deviceHealth(devices, member);
  assert.equal(result.offline.length, 1);
  assert.equal(result.lowBattery[0].device.id, 'a');
  member.permissions.canViewDevices = false;
  assert.equal(health.deviceHealth(devices, member).lowBattery.length, 0);
});

test('unknown connectivity is not counted as offline', () => {
  const devices = [
    { id: 'unknown', name: 'Unknown' },
    device('online', [], true),
    device('offline'),
  ];
  assert.equal(health.deviceHealth(devices, { role: 'OWNER' }).offline.length, 1);
});

function render({
  failed = false,
  loading = false,
  failures = { isPending: false, isError: false, data: { items: [], hasMore: false } },
} = {}) {
  const Component = load('components/DashboardHealth.tsx', {
    '@tanstack/react-query': {
      useQuery: () => ({ isFetching: false, refetch: () => {}, ...failures }),
    },
    '../lib/api': { api: {} },
    '../lib/deviceHealth': health,
    '../store/connection.store': { useConnectionStore: () => 'connected' },
    'react-router-dom': {
      Link: ({ to, children, ...props }) =>
        React.createElement('a', { href: to, ...props }, children),
    },
  }).default;
  return renderToStaticMarkup(
    React.createElement(Component, {
      devices: [device('sensor/a', battery(5))],
      viewer: { role: 'OWNER' },
      loading,
      failed,
      updatedAt: 0,
      refreshing: false,
      onRefresh: () => {},
    }),
  );
}

test('dashboard renders actionable device links and filtered failure history', () => {
  const html = render();
  assert.ok(html.includes('/devices/sensor%2Fa'));
  assert.ok(html.includes('5%'));
  assert.ok(html.includes('/activity?level=error'));
});

test('loading and failure states do not claim a healthy house', () => {
  const html = render({ failed: true, failures: { isPending: false, isError: true } });
  assert.ok(html.includes('Μη διαθέσιμο'));
  assert.ok(!html.includes('Καμία συσκευή εκτός σύνδεσης'));
  assert.ok(!html.includes('Δεν καταγράφηκαν αποτυχίες'));
  assert.ok(!html.includes('5%'));
  assert.ok(render({ loading: true }).includes('Φόρτωση…'));
});
