const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// QueryObserver enables interval refetching in browsers, rather than during SSR.
const previousWindow = globalThis.window;
globalThis.window = {};
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
if (previousWindow === undefined) delete globalThis.window;
else globalThis.window = previousWindow;

const { TuyaService } = require('../../back/dist/tuya/tuya.service');
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Read the real page's query configuration, without mounting its unrelated drag-and-drop UI. */
function roomQuery(api) {
  let options;
  const noop = () => {};
  const modules = {
    react: {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
      useEffect: noop,
      useCallback: (callback) => callback,
    },
    '@tanstack/react-query': {
      useQuery: (query) => {
        options = query;
        return { data: [], isLoading: true };
      },
    },
    '@dnd-kit/core': { useSensor: noop, useSensors: noop, DndContext: noop, DragOverlay: noop },
    '@dnd-kit/sortable': { SortableContext: noop },
    '@dnd-kit/utilities': {},
    '../components/DeviceCard': { default: noop },
    '../hooks/useDeviceRefresh': { useDeviceRefresh: () => ({ isPending: false }) },
    '../lib/api': { api },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/DevicesPage.tsx'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    localStorage: { getItem: () => null },
    require: (name) => modules[name] ?? require(name),
  });
  exports.default();
  return options;
}

function cloudFixture() {
  let on = true;
  let cloudReads = 0;
  let browserReads = 0;
  const service = new TuyaService();
  service.getToken = async () => 'test-token';
  service.request = async (_id, _secret, _region, _token, method, endpoint) => {
    assert.equal(method, 'GET');
    const devices = Array.from({ length: 14 }, (_, i) => ({
      id: `device-${i}`,
      owner_id: 'home',
      online: true,
      status: [{ code: 'switch', value: on }],
    }));
    if (endpoint.includes('associated-users')) {
      cloudReads++;
      return { devices };
    }
    if (endpoint === '/v1.0/homes/home/rooms') return { rooms: [{ id: 'room', name: 'Home' }] };
    if (endpoint === '/v1.0/homes/home/rooms/room/devices') return devices;
    throw Error(`Unexpected cloud request: ${endpoint}`);
  };
  const api = {
    get: async () => {
      browserReads++;
      return { data: await service.getRooms('project', 'secret', 'eu') };
    },
  };
  return {
    api,
    off: () => {
      on = false;
    },
    reads: () => ({ cloudReads, browserReads }),
  };
}

test('external OFF changes replace all fourteen ON states without a command, socket event or focus change', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100000 });
  const cloud = cloudFixture();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const observer = new QueryObserver(client, roomQuery(cloud.api));
  const unsubscribe = observer.subscribe(() => {});
  try {
    await flush();
    assert.ok(
      client.getQueryData(['rooms'])[0].devices.every((device) => device.status[0].value === true),
    );
    cloud.off();
    // Hardware/Smart Life changed independently: no Domo command or WebSocket notification occurs.
    for (let i = 0; i < 4; i++) {
      t.mock.timers.tick(30000);
      await flush();
    }
    assert.ok(
      client.getQueryData(['rooms'])[0].devices.every((device) => device.status[0].value === false),
    );
    assert.deepEqual(cloud.reads(), { cloudReads: 2, browserReads: 5 });
  } finally {
    unsubscribe();
    client.clear();
  }
});

module.exports = { roomQuery, cloudFixture, flush };
