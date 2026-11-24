const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TuyaService } = require('../dist/tuya/tuya.service');

const device = (id, on, online = true) => ({
  id,
  owner_id: 'home',
  online,
  status: [{ code: 'switch_1', value: on }],
});

function fixture() {
  const service = new TuyaService();
  service.waitForReport = async () => {};
  const state = {
    devices: [device('a', true)],
    fail: false,
    commandFails: false,
    rooms: [{ id: 'room', name: 'Bedroom' }],
  };
  const requests = [];
  service.getToken = async () => 'test-token';
  service.request = async (_id, _secret, _region, _token, method, path) => {
    requests.push({ method, path });
    if (method === 'POST' && path === '/v1.0/devices/a/commands') {
      state.devices[0].status[0].value = false;
      if (state.commandFails) throw Error('Command timed out');
      return true;
    }
    assert.equal(method, 'GET', 'reading device state must never send a command');
    if (path === '/v1.0/iot-01/associated-users/devices') {
      if (state.fail) throw Error('Cloud unavailable');
      return { devices: structuredClone(state.devices) };
    }
    if (path === '/v1.0/homes/home/rooms') return { rooms: state.rooms };
    if (/^\/v1\.0\/homes\/home\/rooms\/[^/]+\/devices$/.test(path)) {
      const roomId = path.split('/').at(-2);
      const roomIndex = state.rooms.findIndex((room) => room.id === roomId);
      return state.devices
        .filter((_device, index) => index % state.rooms.length === roomIndex)
        .map(({ id }) => ({ id }));
    }
    if (path === '/v1.0/devices/a/status') return state.devices[0].status;
    if (path === '/v1.0/devices/a') return state.devices[0];
    throw Error(`Unexpected request: ${path}`);
  };
  return {
    service,
    state,
    requests,
    rooms: () => service.getRooms('client', 'secret', 'eu'),
  };
}

test('manual refresh reads current power and connectivity while reusing room membership', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  const first = await f.rooms();
  assert.equal(first[0].devices[0].status[0].value, true);
  f.state.devices = [device('a', false, false)];
  t.mock.timers.tick(6000);
  const refreshed = await f.service.getRooms('client', 'secret', 'eu', true);
  assert.equal(refreshed[0].devices[0].status[0].value, false);
  assert.equal(refreshed[0].devices[0].online, false);
  assert.equal(first[0].devices[0].status[0].value, true, 'previous snapshots stay immutable');
  assert.equal(
    f.requests.filter(({ path }) => path === '/v1.0/iot-01/associated-users/devices').length,
    2,
  );
  assert.equal(f.requests.filter(({ path }) => path.includes('/homes/')).length, 2);
});

test('new devices appear and removed devices disappear before room membership expires', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  await f.rooms();
  f.state.devices = [device('b', false)];
  t.mock.timers.tick(120001);
  const refreshed = await f.rooms();
  assert.deepEqual(refreshed[0].devices, []);
  assert.equal(refreshed[1].id, 'unassigned');
  assert.deepEqual(
    refreshed[1].devices.map(({ id }) => id),
    ['b'],
  );
  f.state.devices = [];
  t.mock.timers.tick(120001);
  assert.deepEqual(
    (await f.rooms()).flatMap(({ devices }) => devices),
    [],
  );
});

test('a failed refresh reports failure instead of serving cached power states as current', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  await f.rooms();
  f.state.fail = true;
  t.mock.timers.tick(120001);
  await assert.rejects(() => f.rooms(), /Cloud unavailable/);
});

test('many sessions and room views share one project read and keep the original observation time', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      i % 2 ? f.rooms() : f.service.getDevices('client', 'secret', 'eu'),
    ),
  );
  assert.equal(f.requests.filter(({ path }) => path.includes('associated-users')).length, 1);
  assert.equal(f.requests.filter(({ path }) => path.includes('/homes/')).length, 2);
  t.mock.timers.tick(30000);
  const cached = await f.service.getDevices('client', 'secret', 'eu');
  assert.equal(cached.devices[0].statusUpdatedAt, 100000);
  cached.devices[0].status[0].value = false;
  assert.equal(
    (await f.rooms())[0].devices[0].status[0].value,
    true,
    'one viewer cannot mutate another viewer state',
  );
  assert.equal(f.requests.filter(({ path }) => path.includes('associated-users')).length, 1);
});

test('alarms and automations share a fresh bulk snapshot for all monitored devices', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  f.state.devices = Array.from({ length: 14 }, (_, i) => device(`sensor-${i}`, false));
  const [alarm, automation] = await Promise.all([
    f.service.getDeviceStatuses('client', 'secret', 'eu'),
    f.service.getDeviceStatuses('client', 'secret', 'eu'),
  ]);
  assert.equal(alarm.length, 14);
  assert.equal(automation.length, 14);
  assert.equal(f.requests.length, 1);
  t.mock.timers.tick(30000);
  f.state.devices[0].status[0].value = true;
  assert.equal(
    (await f.service.getDeviceStatuses('client', 'secret', 'eu'))[0].status[0].value,
    true,
  );
  assert.equal(f.requests.length, 2, 'critical checks keep their 30-second cadence');
});

test('one day of dashboard, rooms and detail polling uses 720 shared state calls', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  f.state.devices = [
    device('a', false),
    ...Array.from({ length: 13 }, (_, i) => device(`b-${i}`, false)),
  ];
  f.state.rooms = Array.from({ length: 6 }, (_, i) => ({ id: `room-${i}`, name: `Room ${i}` }));
  for (let i = 0; i < 24 * 60 * 4; i++) {
    const views = [f.service.getDevice('client', 'secret', 'eu', 'a')];
    if (i % 2 === 0) views.push(f.service.getDevices('client', 'secret', 'eu'), f.rooms());
    await Promise.all(views);
    t.mock.timers.tick(15000);
  }
  assert.equal(f.requests.filter(({ path }) => path.includes('associated-users')).length, 720);
  assert.equal(f.requests.filter(({ path }) => path.includes('/homes/')).length, 28);
  assert.ok(f.requests.every(({ method }) => method === 'GET'));
});

test('a write or ambiguous write failure confirms only the affected device without refetching the house', async () => {
  for (const fails of [false, true]) {
    const f = fixture();
    await f.rooms();
    f.state.commandFails = fails;
    const send = () =>
      f.service.sendCommand('client', 'secret', 'eu', 'a', [{ code: 'switch_1', value: true }]);
    if (fails) await assert.rejects(send, /Command timed out/);
    else await send();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await f.rooms())[0].devices[0].status[0].value, false);
    assert.equal(f.requests.filter(({ method }) => method === 'POST').length, 1);
    assert.equal(f.requests.filter(({ path }) => path.includes('associated-users')).length, 1);
    assert.ok(f.requests.filter(({ path }) => path.endsWith('/status')).length <= 3);
  }
});

test('a fresh individual OFF reading corrects an ON value in the shared list and rooms', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  await f.rooms();
  f.state.devices[0].status[0].value = false;
  t.mock.timers.tick(1000);
  const reported = await f.service.getDevice('client', 'secret', 'eu', 'a', true);
  assert.equal(reported.status[0].value, false);
  assert.equal((await f.rooms())[0].devices[0].status[0].value, false);
  assert.equal(f.requests.filter(({ path }) => path.includes('associated-users')).length, 1);
});

test('an older list response cannot override a newer OFF report from the device', async () => {
  const f = fixture();
  const request = f.service.request;
  let finishList;
  f.service.request = async (...args) =>
    args[5].includes('associated-users')
      ? new Promise((resolve) => {
          finishList = resolve;
        })
      : request(...args);
  const listing = f.service.getDevices('client', 'secret', 'eu');
  await new Promise((resolve) => setImmediate(resolve));
  f.state.devices[0].status[0].value = false;
  await f.service.getDevice('client', 'secret', 'eu', 'a', true);
  finishList({ devices: [device('a', true)] });
  assert.equal((await listing).devices[0].status[0].value, false);
  assert.equal((await f.rooms())[0].devices[0].status[0].value, false);
});

test('a detail read started before a command cannot put an old ON state back in cache', async () => {
  const f = fixture();
  const request = f.service.request;
  let finishOldRead;
  let first = true;
  f.service.request = async (...args) => {
    if (args[5] === '/v1.0/devices/a' && first) {
      first = false;
      return new Promise((resolve) => {
        finishOldRead = resolve;
      });
    }
    return request(...args);
  };
  const old = f.service.getDevice('client', 'secret', 'eu', 'a', true);
  await new Promise((resolve) => setImmediate(resolve));
  await f.service.sendCommand('client', 'secret', 'eu', 'a', [{ code: 'switch_1', value: false }]);
  assert.equal(
    (await f.service.getDevice('client', 'secret', 'eu', 'a', true)).status[0].value,
    false,
  );
  finishOldRead(device('a', true));
  assert.equal((await old).status[0].value, false);
  assert.equal((await f.rooms())[0].devices[0].status[0].value, false);
});

test('bulk monitoring follows pagination so sensors on later pages are not silently skipped', async () => {
  const f = fixture();
  const request = f.service.request;
  f.service.request = async (...args) => {
    if (args[5] === '/v1.0/iot-01/associated-users/devices') {
      return { devices: [device('a', false)], has_more: true, last_row_key: 'next page&1' };
    }
    if (args[5] === '/v1.0/iot-01/associated-users/devices?last_row_key=next%20page%261') {
      return { devices: [device('later-sensor', true)], has_more: false };
    }
    return request(...args);
  };
  const devices = await f.service.getDeviceStatuses('client', 'secret', 'eu');
  assert.deepEqual(
    devices.map(({ id }) => id),
    ['a', 'later-sensor'],
  );
});

test('read caches are isolated by project, region and credential rotation', async () => {
  const f = fixture();
  for (const credentials of [
    ['client', 'secret', 'eu'],
    ['other-client', 'secret', 'eu'],
    ['client', 'rotated-secret', 'eu'],
    ['client', 'secret', 'us'],
  ])
    await f.service.getDevices(...credentials);
  await f.service.getDevices('client', 'secret', 'eu');
  assert.equal(f.requests.length, 4);
});

test('different simultaneous reads share a single token request', async (t) => {
  let tokenRequests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    tokenRequests++;
    return {
      status: 200,
      json: async () => ({
        success: true,
        result: { access_token: 'test-token', expire_time: 7200 },
      }),
    };
  });
  const service = new TuyaService();
  service.logger = { debug: () => {} };
  service.request = async (...args) =>
    args[5].endsWith('/status') ? [] : { devices: [device('a', false)] };
  await Promise.all([
    service.getDevices('client', 'secret', 'eu'),
    service.getDeviceStatus('client', 'secret', 'eu', 'a'),
    service.getDeviceSpecifications('client', 'secret', 'eu', 'a'),
  ]);
  assert.equal(tokenRequests, 1);
});

test('a temporary room lookup failure is retried before the long membership cache expires', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture();
  const request = f.service.request;
  let unavailable = true;
  f.service.logger = { warn: () => {} };
  f.service.request = async (...args) => {
    if (unavailable && args[5].includes('/homes/')) throw Error('Temporary room failure');
    return request(...args);
  };
  assert.equal((await f.rooms())[0].id, 'unassigned');
  unavailable = false;
  t.mock.timers.tick(5 * 60000);
  assert.equal((await f.rooms())[0].id, 'room');
});

test('all Tuya device read paths issue only GET requests', async () => {
  const f = fixture();
  await f.service.getDevices('client', 'secret', 'eu');
  await f.service.getDevice('client', 'secret', 'eu', 'a');
  await f.service.getDeviceStatus('client', 'secret', 'eu', 'a');
  await f.rooms();
  await f.rooms();
  assert.ok(
    f.requests.every(({ method, path }) => method === 'GET' && !path.endsWith('/commands')),
  );
});
