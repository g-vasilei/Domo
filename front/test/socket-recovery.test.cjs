const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function setup({ fail = false } = {}) {
  const handlers = {};
  const listeners = {};
  const connection = {};
  const alarm = {};
  let cleanup;
  let invalidations = 0;
  const socket = {
    connected: true,
    on: (event, handler) => {
      handlers[event] = handler;
    },
    removeAllListeners: () => {},
    disconnect: () => {
      socket.connected = false;
    },
  };
  const store = Object.assign(() => 'token', { getState: () => ({}) });
  const alarmStore = Object.assign(() => () => {}, {
    getState: () => ({ setSettings: (data) => Object.assign(alarm, data) }),
  });
  const modules = {
    '@tanstack/react-query': {
      useQueryClient: () => ({
        invalidateQueries: async () => {
          invalidations++;
          if (fail) throw Error('offline');
        },
      }),
    },
    react: {
      useEffect: (effect) => {
        cleanup = effect();
      },
    },
    'socket.io-client': { io: () => socket },
    '../store/auth.store': { useAuthStore: store },
    '../store/alarm.store': { useAlarmStore: alarmStore },
    '../store/connection.store': {
      useConnectionStore: { setState: (data) => Object.assign(connection, data) },
    },
    '../store/notifications.store': {},
    '../store/prefs.store': {},
    './deviceCommands': { updateDeviceCaches: () => {} },
    './api': { api: { get: async () => ({ data: { state: 'ARMED_AWAY' } }) } },
  };
  const source = fs
    .readFileSync(path.join(__dirname, '../src/lib/useDeviceSocket.ts'), 'utf8')
    .replace('import.meta.env.DEV', 'false');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: (name) => {
      assert.ok(modules[name], name);
      return modules[name];
    },
    window: {
      location: { origin: 'https://domo.test' },
      addEventListener: (name, handler) => {
        listeners[name] = handler;
      },
      removeEventListener: (name) => {
        delete listeners[name];
      },
    },
  });
  exports.useDeviceSocket();
  return {
    handlers,
    listeners,
    connection,
    alarm,
    socket,
    cleanup: () => cleanup(),
    invalidations: () => invalidations,
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('each connection resyncs queries and alarm before reporting connected', async () => {
  const f = setup();
  f.handlers.connect();
  assert.equal(f.connection.status, 'syncing');
  await flush();
  assert.equal(f.connection.status, 'connected');
  assert.equal(f.alarm.state, 'ARMED_AWAY');
  f.handlers.disconnect();
  assert.equal(f.connection.status, 'stale');
  f.handlers.connect();
  await flush();
  assert.equal(f.invalidations(), 2);
  f.cleanup();
  assert.deepEqual(Object.keys(f.listeners), []);
});

test('failed synchronization stays stale and can retry on focus', async () => {
  const f = setup({ fail: true });
  f.handlers.connect();
  await flush();
  assert.equal(f.connection.status, 'stale');
  f.listeners.focus();
  await flush();
  assert.equal(f.invalidations(), 2);
  f.cleanup();
});

test('disconnect during sync prevents late response from reporting connected', async () => {
  const f = setup();
  f.handlers.connect();
  f.socket.connected = false;
  f.handlers.disconnect();
  await flush();
  assert.equal(f.connection.status, 'stale');
  assert.equal(f.alarm.state, undefined);
  f.cleanup();
});
