require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const {
  CreateRuleDto,
  UpdateRuleDto,
  UpdateLocationDto,
} = require('../dist/automation/dto/automation.dto');
const { AutomationService } = require('../dist/automation/automation.service');

const condition = {
  type: 'device_state',
  deviceId: 'a',
  statusCode: 'switch',
  value: false,
  order: 0,
};
const action = {
  type: 'device_control',
  deviceId: 'b',
  statusCode: 'switch',
  value: false,
  order: 0,
};
const rule = { name: 'Rule', conditions: [condition], actions: [action] };
const errors = (type, data) =>
  validate(plainToInstance(type, data), { whitelist: true, forbidNonWhitelisted: true });

test('automation API rejects empty rules and missing type-specific fields', async () => {
  for (const body of [
    { ...rule, name: '   ' },
    { ...rule, conditions: [] },
    { ...rule, actions: [] },
    ...[
      { ...condition, deviceId: undefined },
      { ...condition, statusCode: '' },
      { ...condition, value: undefined },
      { type: 'time', timeValue: '24:00', order: 0 },
      { type: 'time', order: 0 },
      { type: 'sun', order: 0 },
      { type: 'sun', sunEvent: 'sunset', sunOffsetMin: 1441, order: 0 },
    ].map((c) => ({ ...rule, conditions: [c] })),
    ...[
      { ...action, deviceId: '' },
      { ...action, statusCode: undefined },
      { ...action, value: undefined },
      { type: 'countdown', deviceId: 'b', minutes: 5, order: 0 },
      ...[0, -1, 1.5, 1441].map((minutes) => ({ ...action, type: 'countdown', minutes })),
    ].map((a) => ({ ...rule, actions: [a] })),
  ])
    assert.ok((await errors(CreateRuleDto, body)).length > 0, JSON.stringify(body));
  assert.ok((await errors(UpdateRuleDto, { actions: [] })).length > 0);
});

test('automation API accepts false, zero, midnight and complete countdowns', async () => {
  for (const body of [
    rule,
    { ...rule, conditions: [{ ...condition, value: 0 }], actions: [{ ...action, value: 0 }] },
    { ...rule, conditions: [{ type: 'time', timeValue: '00:00', order: 0 }] },
    { ...rule, conditions: [{ type: 'sun', sunEvent: 'sunrise', sunOffsetMin: -60, order: 0 }] },
    {
      ...rule,
      actions: [
        { type: 'countdown', deviceId: 'b', statusCode: 'switch_1', minutes: 1440, order: 0 },
      ],
    },
    { ...rule, actions: [{ type: 'notification', order: 0 }] },
  ])
    assert.equal((await errors(CreateRuleDto, body)).length, 0, JSON.stringify(body));
  assert.equal((await errors(UpdateRuleDto, { name: 'Renamed' })).length, 0);
});

test('location rejects out-of-range coordinates', async () => {
  for (const body of [{ latitude: 91 }, { longitude: -181 }, { latitude: null }]) {
    assert.ok((await errors(UpdateLocationDto, body)).length > 0);
  }
  assert.equal((await errors(UpdateLocationDto, { latitude: 0, longitude: 0 })).length, 0);
});

function serviceFixture(role = 'OWNER') {
  const writes = [];
  const user = {
    id: role === 'OWNER' ? 'owner' : 'member',
    role,
    createdById: role === 'MEMBER' ? 'owner' : null,
    permissions: { canManageAutomations: true },
  };
  const saved = { ...rule, id: 'rule', userId: 'owner', enabled: true, conditionMet: true };
  const tx = {
    automationRule: {
      update: async (args) => {
        writes.push(args);
        return args;
      },
    },
    automationCondition: { deleteMany: async () => {} },
    automationAction: { deleteMany: async () => {} },
  };
  const service = new AutomationService({
    user: {
      findUnique: async () => user,
      update: async (args) => {
        writes.push(args);
        return args;
      },
    },
    automationRule: {
      findUnique: async () => saved,
      create: async (args) => {
        writes.push(args);
        return args;
      },
    },
    $transaction: async (run) => run(tx),
  });
  return { service, writes, user };
}

test('invalid timezones and non-numeric comparisons are rejected before writes', async () => {
  const f = serviceFixture();
  await assert.rejects(() => f.service.updateLocation('owner', { timezone: 'Invalid/Zone' }), {
    status: 400,
  });
  await assert.rejects(
    () =>
      f.service.createRule('owner', {
        ...rule,
        conditions: [{ ...condition, operator: 'gt', value: '12' }],
      }),
    { status: 400 },
  );
  assert.equal(f.writes.length, 0);
});

test('members update the shared owner location only with management permission', async () => {
  const f = serviceFixture('MEMBER');
  await f.service.updateLocation('member', { timezone: 'Europe/Athens' });
  assert.equal(f.writes[0].where.id, 'owner');
  f.user.permissions.canManageAutomations = false;
  await assert.rejects(() => f.service.updateLocation('member', { timezone: 'UTC' }), {
    status: 403,
  });
  assert.equal(f.writes.length, 1);
});

test('renaming a rule preserves its edge while replacing conditions rearms it', async () => {
  const f = serviceFixture();
  await f.service.updateRule('owner', 'rule', { name: 'Renamed' });
  assert.equal('conditionMet' in f.writes[0].data, false);
  await f.service.updateRule('owner', 'rule', { conditions: [{ ...condition, value: true }] });
  assert.equal(f.writes[1].data.conditionMet, false);
});

test('saving the same conditions from the editor preserves the automatic edge', async () => {
  const f = serviceFixture();
  await f.service.updateRule('owner', 'rule', {
    name: 'Renamed',
    conditions: [condition],
    actions: [action],
  });
  assert.equal('conditionMet' in f.writes[0].data, false);
});
