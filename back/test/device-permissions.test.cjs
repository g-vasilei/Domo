const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DevicesService } = require('../dist/devices/devices.service');
const { DevicesController } = require('../dist/devices/devices.controller');
const { AutomationService } = require('../dist/automation/automation.service');
const { AutomationController } = require('../dist/automation/automation.controller');

function fixture() {
  const permissions = {
    canViewDevices: true,
    canControlDevices: false,
    canCreateSchedules: false,
    canManageAutomations: false,
    allowedDeviceIds: ['allowed'],
  };
  const member = { id: 'member', role: 'MEMBER', createdById: 'owner', permissions };
  const owner = { id: 'owner', role: 'OWNER', createdById: null };
  const devices = [
    { id: 'allowed', name: 'Visible', online: true },
    { id: 'hidden', name: 'Hidden', online: true },
  ];
  const rooms = [
    { id: 'room', devices },
    { id: 'private', devices: [devices[1]] },
  ];
  const calls = [];
  const broadcast = [];
  const prisma = {
    user: {
      findUnique: async ({ where }) =>
        where.id === 'owner' ? owner : where.id === 'member' ? member : null,
      findMany: async () => [owner, member],
    },
    deviceNotifPref: {
      findUnique: async () => ({ enabled: true }),
      findMany: async () => [],
      upsert: async (args) => args.create,
    },
    deviceTimer: { findMany: async () => [] },
    log: { create: async () => ({}) },
  };
  const cloud = {};
  for (const method of [
    'getDevices',
    'getRooms',
    'getDevice',
    'getDeviceStatus',
    'getDeviceSpecifications',
    'sendCommand',
  ]) {
    cloud[method] = async (...args) => {
      calls.push({ method, args });
      if (method === 'getDevices') return { devices };
      if (method === 'getRooms') return rooms;
      if (method === 'sendCommand') return true;
      return { id: args[3], status: [] };
    };
  }
  const service = new DevicesService(
    {
      getTuyaCredentials: async (id) => {
        calls.push({ method: 'credentials', userId: id });
        return { accessId: 'test', accessSecret: 'test-secret', region: 'eu' };
      },
    },
    cloud,
    { broadcastToUsers: (...args) => broadcast.push(args) },
    prisma,
    { evaluateOnCommand: async () => {} },
  );
  return {
    service,
    controller: new DevicesController(service, {}),
    member,
    owner,
    permissions,
    devices,
    rooms,
    calls,
    prisma,
    broadcast,
  };
}
const req = { user: { id: 'member' } };

test('restricted members receive filtered device and room lists without mutating shared cache', async () => {
  const f = fixture();
  assert.deepEqual(
    (await f.controller.getDevices(req)).map((d) => d.id),
    ['allowed'],
  );
  const rooms = await f.controller.getRooms(req);
  assert.equal(rooms.length, 1);
  assert.deepEqual(
    rooms[0].devices.map((d) => d.id),
    ['allowed'],
  );
  assert.equal(f.rooms[0].devices.length, 2);
  assert.equal((await f.service.getDevices('owner')).length, 2);
  assert.equal((await f.service.getRooms('owner')).length, 2);
});

test('direct API reads and notification preferences reject a hidden device before accessing cloud or preferences', async () => {
  const f = fixture();
  f.prisma.deviceNotifPref.findUnique = f.prisma.deviceNotifPref.upsert = async () => {
    throw Error('must not access preferences');
  };
  for (const operation of [
    () => f.controller.getDevice(req, 'hidden'),
    () => f.controller.getDeviceStatus(req, 'hidden'),
    () => f.controller.getDeviceSpecifications(req, 'hidden'),
    () => f.controller.getNotifPref(req, 'hidden'),
    () => f.controller.setNotifPref(req, 'hidden', { enabled: true }),
  ])
    await assert.rejects(operation, { status: 403 });
  assert.equal(f.calls.length, 0);
});

test('read-only members cannot command or start/cancel timers even for a visible device', async () => {
  const f = fixture();
  for (const operation of [
    () => f.controller.sendCommand(req, 'allowed', { commands: [{ code: 'switch', value: true }] }),
    () =>
      f.controller.createTimer(req, {
        deviceId: 'allowed',
        deviceName: 'Visible',
        switchCode: 'switch',
        minutes: 5,
      }),
    () => f.controller.cancelTimer(req, 'allowed'),
  ])
    await assert.rejects(operation, { status: 403 });
  assert.equal(f.calls.length, 0);
});

test('revocation is enforced on the next request, including lists and timers', async () => {
  const f = fixture();
  await f.service.getDevice('member', 'allowed');
  f.calls.length = 0;
  f.permissions.canViewDevices = false;
  for (const method of ['getDevices', 'getRooms', 'getTimers']) {
    await assert.rejects(() => f.service[method]('member'), { status: 403 });
  }
  await assert.rejects(() => f.service.getDevice('member', 'allowed'), { status: 403 });
  assert.equal(f.calls.length, 0);
});

test('missing users and orphaned members are denied before credentials lookup', async () => {
  const f = fixture();
  await assert.rejects(() => f.service.getDevices('deleted'), { status: 403 });
  f.member.createdById = null;
  await assert.rejects(() => f.service.getDevice('member', 'allowed'), { status: 403 });
  assert.equal(f.calls.length, 0);
});

test('authorized member command succeeds and broadcasts only to current viewers', async () => {
  const f = fixture();
  f.permissions.canControlDevices = true;
  assert.equal(
    await f.controller.sendCommand(req, 'allowed', { commands: [{ code: 'switch', value: true }] }),
    true,
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.broadcast[0][0], ['owner', 'member']);
  f.permissions.allowedDeviceIds = ['hidden'];
  assert.deepEqual(await f.service.deviceRecipients('owner', 'allowed'), ['owner']);
  await assert.rejects(() => f.controller.sendCommand(req, 'allowed', { commands: [] }), {
    status: 403,
  });
});

function automationFixture() {
  const f = fixture();
  const rule = {
    id: 'rule',
    userId: 'owner',
    name: 'Rule',
    enabled: true,
    conditions: [{ type: 'device_state', deviceId: 'allowed' }],
    actions: [{ type: 'device_control', deviceId: 'allowed' }],
  };
  let writes = 0;
  let tests = 0;
  f.prisma.automationRule = {
    findUnique: async () => rule,
    findMany: async () => [rule],
    create: async () => {
      writes++;
      return rule;
    },
    update: async () => {
      writes++;
      return rule;
    },
    delete: async () => {
      writes++;
    },
  };
  const service = new AutomationService(f.prisma);
  return {
    ...f,
    rule,
    service,
    controller: new AutomationController(service, {
      testRule: async (ownerId) => {
        assert.equal(ownerId, 'owner');
        tests++;
      },
    }),
    writes: () => writes,
    tests: () => tests,
  };
}

test('automation test and reads require management permission before executing as owner', async () => {
  const f = automationFixture();
  await assert.rejects(() => f.controller.testRule(req, 'rule'), { status: 403 });
  await assert.rejects(() => f.service.getRules('member'), { status: 403 });
  assert.equal(f.tests(), 0);
});

test('automation management cannot bypass device allowlist or control permission', async () => {
  const f = automationFixture();
  f.permissions.canManageAutomations = true;
  await assert.rejects(() => f.controller.testRule(req, 'rule'), { status: 403 });
  await assert.rejects(() => f.service.createRule('member', f.rule), { status: 403 });
  assert.equal(f.tests(), 0);
  assert.equal(f.writes(), 0);
  f.permissions.canControlDevices = true;
  await f.controller.testRule(req, 'rule');
  assert.equal(f.tests(), 1);
  await assert.rejects(
    () =>
      f.service.updateRule('member', 'rule', {
        actions: [{ type: 'device_control', deviceId: 'hidden' }],
      }),
    { status: 403 },
  );
  assert.equal(f.writes(), 0);
  f.rule.actions[0].deviceId = 'hidden';
  assert.equal((await f.service.getRules('member')).length, 0);
  await assert.rejects(() => f.service.toggleRule('member', 'rule'), { status: 403 });
  await assert.rejects(() => f.service.updateRule('member', 'rule', { name: 'Bypass' }), {
    status: 403,
  });
  assert.equal(f.writes(), 0);
});

test('an empty device allowlist permits all devices only when view/control permission exists', async () => {
  const f = fixture();
  f.permissions.allowedDeviceIds = [];
  assert.equal((await f.service.getDevices('member')).length, 2);
  await f.service.getDeviceStatus('member', 'hidden');
  await assert.rejects(
    () => f.service.sendCommand('member', 'hidden', [{ code: 'switch', value: true }]),
    { status: 403 },
  );
  f.permissions.canControlDevices = true;
  assert.equal(await f.service.deviceAccess('member', 'hidden', 'control'), 'owner');
});

test('empty commands and missing values are rejected while false/zero are accepted', async () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const { SendCommandDto } = require('../dist/devices/dto/send-command.dto');
  for (const commands of [[], [{ code: '', value: true }], [{ code: 'switch' }]]) {
    assert.ok((await validate(plainToInstance(SendCommandDto, { commands }))).length > 0);
  }
  for (const value of [false, 0]) {
    assert.equal(
      (await validate(plainToInstance(SendCommandDto, { commands: [{ code: 'switch', value }] })))
        .length,
      0,
    );
  }
});
