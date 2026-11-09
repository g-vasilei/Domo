const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  vm = require('node:vm'),
  ts = require('typescript');
function setup() {
  const requests = [];
  const listeners = [];
  const auth = {
    getState: () => ({ accessToken: 'token' }),
    subscribe: (fn) => listeners.push(fn),
  };
  const api = {
    get: async () => ({ data: [] }),
    patch: async (...args) => requests.push(args),
    delete: async (...args) => requests.push(args),
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync('front/src/store/notifications.store.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      Date,
      require: (name) =>
        name === 'zustand'
          ? {
              create: (init) => {
                let state;
                const set = (x) => (state = { ...state, ...x });
                state = init(set, () => state);
                return { getState: () => state };
              },
            }
          : name.includes('auth.store')
            ? { useAuthStore: auth }
            : { api },
    },
  );
  return { store: exports.useNotificationsStore, api, requests };
}
test('duplicate delivery is deduplicated and unread count matches retained notifications', () => {
  const { store } = setup();
  for (let i = 0; i < 51; i++)
    store.getState().push({
      id: String(i),
      kind: 'alarm',
      title: 'test',
      body: 'test',
      at: new Date(i),
      read: false,
    });
  assert.equal(store.getState().items.length, 50);
  assert.equal(store.getState().unread, 50);
  store.getState().push({ ...store.getState().items[0] });
  assert.equal(store.getState().unread, 50);
});
test('history restores dates and read state after reload; read and clear persist only visible IDs', async () => {
  const { store, api, requests } = setup();
  api.get = async () => ({
    data: [
      {
        id: 'saved',
        kind: 'alarm',
        title: 'test',
        body: 'test',
        at: '2026-11-09T10:00:00Z',
        read: false,
      },
    ],
  });
  await store.getState().load();
  assert.equal(store.getState().unread, 1);
  assert.ok(store.getState().items[0].at instanceof Date);
  store.getState().markAllRead();
  await new Promise(setImmediate);
  assert.equal(requests[0][0], '/notifications/read');
  assert.equal(requests[0][1].ids[0], 'saved');
  store.getState().clear();
  await new Promise(setImmediate);
  assert.equal(requests[1][0], '/notifications');
  assert.equal(store.getState().unread, 0);
});

test('service worker displays push independently of an open page and uses stable notification IDs', async () => {
  const handlers = {},
    shown = [];
  vm.runInNewContext(fs.readFileSync('front/public/sw.js', 'utf8'), {
    self: {
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
      registration: { showNotification: async (...args) => shown.push(args) },
    },
  });
  let completed;
  handlers.push({
    data: { json: () => ({ id: 'event-id', title: 'Alarm', body: 'Triggered', url: '/alarm' }) },
    waitUntil: (promise) => {
      completed = promise;
    },
  });
  await completed;
  assert.equal(shown[0][0], 'Alarm');
  assert.equal(shown[0][1].tag, 'event-id');
  assert.equal(shown[0][1].data.url, '/alarm');
});

test('notification click rejects off-site destinations', async () => {
  const handlers = {};
  let opened = false,
    completed;
  vm.runInNewContext(fs.readFileSync('front/public/sw.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://domo.test' },
      addEventListener: (name, fn) => {
        handlers[name] = fn;
      },
      clients: {
        openWindow: async () => {
          opened = true;
        },
        matchAll: async () => [],
      },
    },
  });
  handlers.notificationclick({
    notification: { close() {}, data: { url: 'https://other.test' } },
    waitUntil: (promise) => {
      completed = promise;
    },
  });
  await completed;
  assert.equal(opened, false);
});
