const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AlarmService } = require('../dist/alarm/alarm.service');
const { AutomationEvaluatorService } = require('../dist/automation/automation-evaluator.service');
const { DevicesService } = require('../dist/devices/devices.service');
const { TuyaService } = require('../dist/tuya/tuya.service');

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const owner = { id: 'owner', role: 'OWNER', timezone: 'Europe/Athens' };
  const credentials = { accessId: 'project', accessSecret: 'test-secret', region: 'eu' };
  const rules = [
    {
      id: 'humidity-rule',
      name: 'Humidity alert',
      deviceId: 'humidity',
      statusCode: 'va_humidity',
      operator: 'lt',
      value: 550,
    },
    {
      id: 'boiler-rule',
      name: 'Boiler alert',
      deviceId: 'boiler',
      statusCode: 'switch',
      operator: 'eq',
      value: true,
    },
  ].map(({ deviceId, statusCode, operator, value, ...rule }) => ({
    ...rule,
    userId: owner.id,
    user: owner,
    enabled: true,
    conditionMet: false,
    lastTriggeredAt: null,
    updatedAt: new Date(),
    conditions: [{ type: 'device_state', deviceId, statusCode, operator, value }],
    actions: [{ type: 'notification', value: rule.name, order: 0 }],
  }));
  const calls = [];
  const events = [];
  const reportedDevices = [
    { id: 'humidity', status: [{ code: 'va_humidity', value: 600 }] },
    { id: 'boiler', status: [{ code: 'switch', value: false }] },
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `device-${i}`,
      status: [{ code: 'switch_1', value: false }],
    })),
  ].map((device) => ({ ...device, owner_id: 'home', online: true }));
  const gateway = {
    broadcastToUsers: (ids, event, payload) => events.push({ ids, event, payload }),
  };
  const prisma = {
    user: { findUnique: async () => owner, findMany: async () => [owner] },
    log: { create: async () => ({}) },
    deviceNotifPref: { findMany: async () => [] },
    automationRule: {
      findMany: async ({ where }) =>
        structuredClone(
          rules.filter((rule) => {
            if (!rule.enabled) return false;
            const filter = where.conditions?.some;
            return (
              !filter ||
              rule.conditions.some(
                (condition) =>
                  (!filter.deviceId || condition.deviceId === filter.deviceId) &&
                  (!filter.type ||
                    (typeof filter.type === 'string'
                      ? condition.type === filter.type
                      : filter.type.in.includes(condition.type))),
              )
            );
          }),
        ),
      updateMany: async ({ where, data }) => {
        const rule = rules.find((entry) => entry.id === where.id);
        if (!rule || (where.conditionMet !== undefined && rule.conditionMet !== where.conditionMet))
          return { count: 0 };
        Object.assign(rule, data);
        return { count: 1 };
      },
    },
    alarmRule: {
      findMany: async () => [
        { deviceId: 'boiler', triggerCode: 'switch', triggerValue: true, action: 'IMMEDIATE' },
      ],
    },
  };
  const tuya = new TuyaService();
  tuya.getToken = async () => 'token';
  tuya.waitForReport = async (_key, delay) => t.mock.timers.tick(delay);
  tuya.request = async (_id, _secret, _region, _token, method, path) => {
    calls.push({ method, path });
    if (method === 'POST' && path === '/v1.0/devices/boiler/commands') return true;
    if (path === '/v1.0/devices/boiler/status') return [{ code: 'switch', value: true }];
    if (path.includes('associated-users')) return { devices: structuredClone(reportedDevices) };
    if (path === '/v1.0/homes/home/rooms')
      return {
        rooms: Array.from({ length: 6 }, (_, i) => ({ id: `room-${i}`, name: `Room ${i}` })),
      };
    if (path.includes('/rooms/')) return reportedDevices.map(({ id }) => ({ id }));
    throw Error(`Unexpected cloud request ${method} ${path}`);
  };
  let evaluator;
  const devices = new DevicesService(
    { getTuyaCredentials: async () => credentials },
    tuya,
    gateway,
    prisma,
    { evaluateOnReport: (...args) => evaluator.evaluateOnReport(...args) },
  );
  evaluator = new AutomationEvaluatorService(prisma, devices, gateway);
  evaluator.logger = { log() {}, warn() {}, error() {} };
  devices.onModuleInit();
  t.after(() => {
    devices.onModuleDestroy();
    tuya.onModuleDestroy();
  });
  const alarm = new AlarmService(prisma, gateway, devices, {}, {});
  alarm.getSettings = async () => ({ state: 'ARMED_AWAY' });
  return {
    evaluator,
    devices,
    alarm,
    calls,
    rules,
    events,
    bulkCalls: () => calls.filter((call) => call.path.includes('associated-users')).length,
  };
}

test('two notification rules with all browsers closed use 720 bulk calls per day, without Message Service', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 24 * 60 * 2; i++) {
    await f.evaluator.evaluateDeviceStateRules();
    t.mock.timers.tick(30000);
  }
  assert.equal(f.bulkCalls(), 720);
  assert.equal(f.calls.length, 720);
});

test('notification rules and open dashboard/detail/room views share the same daily budget', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 24 * 60 * 4; i++) {
    const views = [f.devices.getDevice('owner', 'boiler')];
    if (i % 2 === 0)
      views.push(
        f.evaluator.evaluateDeviceStateRules(),
        f.devices.getDevices('owner'),
        f.devices.getRooms('owner'),
      );
    await Promise.all(views);
    t.mock.timers.tick(15000);
  }
  assert.equal(f.bulkCalls(), 720);
  assert.equal(f.calls.filter((call) => call.path.includes('/homes/')).length, 28);
});

test('a confirmed command still triggers its notification immediately while the bulk snapshot is cached', async (t) => {
  const f = fixture(t);
  await f.evaluator.evaluateDeviceStateRules();
  const result = await f.devices.sendCommand('owner', 'boiler', [{ code: 'switch', value: true }]);
  await Promise.all([...f.devices.reportQueues.values()]);
  assert.equal(result.confirmed, true);
  assert.equal(Date.now(), 100250);
  assert.equal(
    f.events.filter(
      (event) => event.event === 'automation:alert' && event.payload.ruleName === 'Boiler alert',
    ).length,
    1,
  );
  assert.equal(f.bulkCalls(), 1);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 1);
});

test('device control and countdown rules keep 30-second fresh monitoring after a rule edit', async (t) => {
  const f = fixture(t);
  await f.evaluator.evaluateDeviceStateRules();
  for (const type of ['device_control', 'countdown']) {
    f.rules[1].actions = [
      { type, deviceId: 'device-0', statusCode: 'switch_1', value: true, minutes: 5 },
    ];
    t.mock.timers.tick(30000);
    await f.evaluator.evaluateDeviceStateRules();
  }
  assert.equal(f.bulkCalls(), 3);
  assert.equal(f.calls.filter((call) => call.method === 'POST').length, 0);
});

test('an armed alarm retains its 30-second cloud checks alongside notification-only automations', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 60 * 2; i++) {
    await Promise.all([
      f.evaluator.evaluateDeviceStateRules(),
      f.alarm.checkRules('owner', 'ARMED_AWAY'),
    ]);
    t.mock.timers.tick(30000);
  }
  assert.equal(f.bulkCalls(), 120);
});

test('mixed time/device notification rules also reuse the shared two-minute snapshot', async (t) => {
  const f = fixture(t);
  for (const rule of f.rules)
    rule.conditions.push({ type: 'time', timeValue: '23:59', operator: 'eq' });
  for (let i = 0; i < 60; i++) {
    await f.evaluator.evaluateTimeSunRules();
    t.mock.timers.tick(60000);
  }
  assert.equal(f.bulkCalls(), 30);
});
