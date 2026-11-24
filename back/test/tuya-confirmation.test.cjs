const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { TuyaService } = require('../dist/tuya/tuya.service');

const creds = {
  accessId: 'project',
  accessSecret: '0123456789abcdef0123456789abcdef',
  region: 'eu',
};
const status = (value) => [{ code: 'switch', value }];
function verifiedMessages(t) {
  const previous = process.env.TUYA_MESSAGES_REPLACE_POLLING;
  process.env.TUYA_MESSAGES_REPLACE_POLLING = 'true';
  t.after(() => {
    if (previous === undefined) delete process.env.TUYA_MESSAGES_REPLACE_POLLING;
    else process.env.TUYA_MESSAGES_REPLACE_POLLING = previous;
  });
}
const device = (value) => ({
  id: 'a',
  owner_id: 'home',
  online: true,
  status: [...status(value), { code: 'battery', value: 50 }],
});
class Messages extends EventEmitter {
  live = true;
  ensure() {}
  connected() {
    return this.live;
  }
  diagnostics() {
    return {};
  }
}
function fixture(t, { messages = null, reported = [false, true] } = {}) {
  if (t) t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const service = new TuyaService(messages ?? undefined);
  const calls = [];
  const reports = [];
  let statusReads = 0;
  service.onReport((_creds, report) => reports.push(report));
  service.getToken = async () => 'token';
  if (t) service.waitForReport = async (_key, delay) => t.mock.timers.tick(delay);
  service.request = async (_id, _secret, _region, _token, method, path) => {
    calls.push({ method, path, at: Date.now() });
    if (method === 'POST') return true;
    if (path.endsWith('/status')) {
      const value = reported[Math.min(statusReads++, reported.length - 1)];
      if (value instanceof Error) throw value;
      return status(value);
    }
    if (path.includes('associated-users')) return { devices: [device(false)] };
    if (path === '/v1.0/homes/home/rooms') return { rooms: [{ id: 'room', name: 'Home' }] };
    if (path === '/v1.0/homes/home/rooms/room/devices') return [{ id: 'a' }];
    if (path === '/v1.0/devices/a') return device(false);
    throw Error(`Unexpected cloud request: ${path}`);
  };
  return {
    service,
    calls,
    reports,
    devices: (refresh = false) =>
      service.getDevices(creds.accessId, creds.accessSecret, creds.region, refresh),
    send: (value = true) =>
      service.sendCommand(creds.accessId, creds.accessSecret, creds.region, 'a', status(value)),
  };
}

test('lagging first cloud response confirms within seconds and updates the cached house without another bulk read', async (t) => {
  const f = fixture(t);
  await f.service.getRooms(creds.accessId, creds.accessSecret, creds.region);
  const result = await f.send();
  assert.equal(result.confirmed, true);
  assert.equal(result.report.status.find((entry) => entry.code === 'switch').value, true);
  assert.equal(Date.now() - 100000, 1000);
  assert.equal((await f.devices()).devices[0].status[0].value, true);
  assert.equal(
    (await f.service.getRooms(creds.accessId, creds.accessSecret, creds.region))[0].devices[0]
      .status[0].value,
    true,
  );
  assert.equal(f.calls.filter((call) => call.path.includes('associated-users')).length, 1);
  assert.equal(f.calls.filter((call) => call.path.endsWith('/status')).length, 2);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  assert.deepEqual(
    f.reports
      .filter((report) => report.source === 'readback')
      .map((report) => report.status[0].value),
    [false, true],
  );
  // Even a manually refreshed, eventually-consistent list cannot undo confirmation.
  t.mock.timers.tick(5001);
  assert.equal((await f.devices(true)).devices[0].status[0].value, true);
});

test('unconfirmed acceptance stops after three reads and never displays the requested ON state', async (t) => {
  const f = fixture(t, { reported: [false] });
  await f.devices();
  const result = await f.send();
  assert.equal(result.success, true);
  assert.equal(result.confirmed, false);
  assert.equal(result.report.status[0].value, false);
  assert.equal((await f.devices()).devices[0].status[0].value, false);
  assert.equal(f.calls.filter((call) => call.path.endsWith('/status')).length, 3);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
});

test('a temporary readback error is retried without resending the command', async (t) => {
  const f = fixture(t, { reported: [Error('temporary'), true] });
  await f.devices();
  assert.equal((await f.send()).confirmed, true);
  assert.equal(f.calls.filter((call) => call.path.endsWith('/status')).length, 2);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
});

test('a real push during command delivery confirms with no status or full-house readback', async (t) => {
  const messages = new Messages();
  const f = fixture(t, { messages });
  await f.devices();
  const request = f.service.request;
  f.service.request = async (...args) => {
    const result = await request(...args);
    if (args[4] === 'POST')
      messages.emit('report', creds, {
        deviceId: 'a',
        status: status(true),
        observedAt: Date.now(),
      });
    return result;
  };
  assert.equal((await f.send()).confirmed, true);
  assert.equal(f.calls.filter((call) => call.method === 'GET').length, 1);
});

test('a push wakes a waiting confirmation immediately without polling', async () => {
  const messages = new Messages();
  const f = fixture(null, { messages });
  await f.devices();
  const sending = f.send();
  await new Promise((resolve) => setImmediate(resolve));
  messages.emit('report', creds, { deviceId: 'a', status: status(true), observedAt: Date.now() });
  assert.equal((await sending).confirmed, true);
  assert.equal(f.calls.filter((call) => call.path.endsWith('/status')).length, 0);
  assert.equal(f.service.events.listenerCount('confirmation'), 0);
});

test('unrelated telemetry cannot confirm a power value left in an older cached report', async (t) => {
  const messages = new Messages();
  const f = fixture(t, { messages, reported: [false] });
  await f.devices();
  messages.emit('report', creds, { deviceId: 'a', status: status(true), observedAt: Date.now() });
  const request = f.service.request;
  f.service.request = async (...args) => {
    const result = await request(...args);
    if (args[4] === 'POST')
      messages.emit('report', creds, {
        deviceId: 'a',
        status: [{ code: 'battery', value: 49 }],
        observedAt: Date.now() + 1,
      });
    return result;
  };
  assert.equal((await f.send()).confirmed, false);
  assert.equal((await f.devices()).devices[0].status[0].value, false);
});

test('explicitly rejected commands do not start confirmation reads', async (t) => {
  const f = fixture(t);
  f.service.request = async () => false;
  await assert.rejects(f.send, /Device rejected command/);
  assert.equal(f.reports.length, 0);
});

test('unknown delivery still reconciles actual state after a timeout, without a second POST', async (t) => {
  const f = fixture(t, { reported: [true] });
  await f.devices();
  const request = f.service.request;
  f.service.request = async (...args) => {
    const result = await request(...args);
    if (args[4] === 'POST') throw Error('delivery timeout');
    return result;
  };
  await assert.rejects(f.send, /delivery timeout/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await f.devices()).devices[0].status[0].value, true);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(f.calls.filter((call) => call.path.endsWith('/status')).length, 1);
});

test('message reports merge partial properties, reject stale and duplicate events, and preserve metadata', async (t) => {
  const messages = new Messages();
  const f = fixture(t, { messages });
  await f.devices();
  messages.emit('report', creds, {
    deviceId: 'a',
    status: status(true),
    observedAt: Date.now() + 2,
  });
  messages.emit('report', creds, {
    deviceId: 'a',
    status: status(false),
    observedAt: Date.now() + 1,
  });
  messages.emit('report', creds, {
    deviceId: 'a',
    status: status(true),
    observedAt: Date.now() + 2,
  });
  messages.emit('report', creds, {
    deviceId: 'a',
    status: [{ code: 'battery', value: 0 }],
    observedAt: Date.now() + 1,
  });
  messages.emit('report', creds, {
    deviceId: 'a',
    status: status(false),
    observedAt: Date.now() - 61000,
  });
  const current = (await f.devices()).devices[0];
  assert.equal(current.status[0].value, true);
  assert.equal(current.status.find((entry) => entry.code === 'battery').value, 0);
  assert.equal(current.owner_id, 'home');
  assert.equal(f.reports.length, 2);
  assert.equal(f.calls.length, 1);
});

test('old property timestamps cannot be replayed using a new envelope timestamp', async (t) => {
  const messages = new Messages();
  const f = fixture(t, { messages });
  await f.devices();
  messages.emit('report', creds, {
    deviceId: 'a',
    status: [{ code: 'switch', value: true, reportedAt: Date.now() - 120000 }],
    observedAt: Date.now(),
  });
  assert.equal((await f.devices()).devices[0].status[0].value, false);
  assert.equal(f.reports.length, 0);
});

test('a full day of UI and 30s alarm/automation checks shares 144 bulk API reads with messages connected', async (t) => {
  verifiedMessages(t);
  const messages = new Messages();
  const f = fixture(t, { messages });
  for (let i = 0; i < 24 * 60 * 2; i++) {
    await Promise.all([
      f.devices(),
      f.service.getDevice(creds.accessId, creds.accessSecret, creds.region, 'a'),
      f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region),
      f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region),
    ]);
    t.mock.timers.tick(30000);
  }
  assert.equal(f.calls.length, 144);
  assert.ok(
    f.calls.every((call) => call.method === 'GET' && call.path.includes('associated-users')),
  );
});

test('disconnect immediately restores fresh-cloud security checks and reconnect resynchronizes once', async (t) => {
  verifiedMessages(t);
  const messages = new Messages();
  const f = fixture(t, { messages });
  await f.devices();
  messages.emit('report', creds, { deviceId: 'a', status: status(true), observedAt: Date.now() });
  messages.live = false;
  messages.emit('disconnected', creds);
  t.mock.timers.tick(5000);
  assert.equal(
    (await f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region))[0]
      .status[0].value,
    false,
  );
  assert.equal(f.calls.length, 2);
  t.mock.timers.tick(30000);
  await f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region);
  assert.equal(f.calls.length, 3);
  messages.live = true;
  messages.emit('connected', creds);
  await Promise.all(Array.from({ length: 20 }, () => f.devices()));
  assert.equal(f.calls.length, 4);
});

test('usage diagnostics count actual outgoing calls including tokens and never issue cloud requests', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    return {
      status: 200,
      json: async () => ({
        success: true,
        result: url.includes('/token?')
          ? { access_token: 'token', expire_time: 7200 }
          : { devices: [device(false)] },
      }),
    };
  });
  const service = new TuyaService();
  assert.equal(
    service.getDiagnostics(creds.accessId, creds.accessSecret, creds.region).apiCalls,
    0,
  );
  await Promise.all(
    Array.from({ length: 20 }, () =>
      service.getDevices(creds.accessId, creds.accessSecret, creds.region),
    ),
  );
  for (let i = 0; i < 10; i++) {
    const diagnostics = service.getDiagnostics(creds.accessId, creds.accessSecret, creds.region);
    assert.equal(diagnostics.apiCalls, 2);
    assert.equal(diagnostics.byEndpoint['GET /v1.0/token'], 1);
    assert.ok(!JSON.stringify(diagnostics).includes(creds.accessSecret));
  }
  assert.equal(calls, 2);
});

test('a live connection alone cannot disable periodic security checks before messaging rules are verified', async (t) => {
  const messages = new Messages();
  const f = fixture(t, { messages });
  await f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region);
  t.mock.timers.tick(30000);
  await f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region);
  assert.equal(f.calls.length, 2);
  assert.equal(
    f.service.getDiagnostics(creds.accessId, creds.accessSecret, creds.region).monitoring,
    'polling',
  );
});

test('superseded confirmations cannot override a more recent command from another session', async (t) => {
  const f = fixture(t, { reported: [false] });
  await f.devices();
  const [older, newer] = await Promise.all([f.send(true), f.send(false)]);
  assert.equal(older.confirmed, false);
  assert.equal(newer.confirmed, true);
  assert.equal((await f.devices()).devices[0].status[0].value, false);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 2);
  assert.equal(f.service.pendingCommands.size, 0);
});

test('monitoring treats a device awaiting command confirmation as unknown rather than rearming from a lagging value', async (t) => {
  const f = fixture(t, { reported: [true] });
  await f.devices();
  let accept;
  const request = f.service.request;
  f.service.request = async (...args) => {
    if (args[4] === 'POST')
      return new Promise((resolve) => {
        accept = resolve;
      });
    return request(...args);
  };
  const sending = f.send();
  await new Promise((resolve) => setImmediate(resolve));
  const pending = await f.service.getDeviceStatuses(
    creds.accessId,
    creds.accessSecret,
    creds.region,
  );
  assert.deepEqual(pending[0].status, []);
  accept(true);
  assert.equal((await sending).confirmed, true);
  assert.equal(
    (await f.service.getDeviceStatuses(creds.accessId, creds.accessSecret, creds.region))[0]
      .status[0].value,
    true,
  );
});
