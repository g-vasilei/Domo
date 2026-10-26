const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AlarmService } = require('../dist/alarm/alarm.service');

function fixture(state, elapsed, changed = 1) {
  const settings = {
    userId: 'owner',
    state,
    stateAt: new Date(Date.now() - elapsed),
    exitDelaySecs: 30,
    entryDelaySecs: 20,
  };
  const transitions = [];
  const broadcasts = [];
  const prisma = {
    log: { create: async () => ({}) },
    alarmSettings: {
      findMany: async () => [settings],
      updateMany: async ({ where, data }) => {
        assert.equal(where.state, state);
        assert.equal(where.stateAt, settings.stateAt);
        transitions.push(data.state);
        if (changed) Object.assign(settings, data);
        return { count: changed };
      },
      findUniqueOrThrow: async () => settings,
    },
    user: { findMany: async () => [] },
    alarmTriggerAction: { findMany: async () => [] },
  };
  const service = new AlarmService(
    prisma,
    {
      broadcastToUsers: (...args) => broadcasts.push(args),
    },
    {},
    {},
    {},
  );
  return { service, settings, transitions, broadcasts };
}

test('restart preserves remaining exit delay then arms away', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: 100000 });
  const f = fixture('EXIT_DELAY', 25000);
  t.after(() => f.service.onModuleDestroy());
  await f.service.onModuleInit();
  assert.deepEqual(f.transitions, []);
  t.mock.timers.tick(4999);
  assert.deepEqual(f.transitions, []);
  t.mock.timers.tick(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(f.transitions, ['ARMED_AWAY']);
  assert.equal(f.service.pollTimers.size, 1);
});

test('restart immediately triggers expired entry delay', async () => {
  const f = fixture('ENTRY_DELAY', 25000);
  await f.service.onModuleInit();
  assert.deepEqual(f.transitions, ['TRIGGERED']);
  assert.equal(f.broadcasts.length, 1);
  f.service.onModuleDestroy();
});

test('old delay cannot overwrite a changed alarm session', async () => {
  const f = fixture('EXIT_DELAY', 35000, 0);
  await f.service.onModuleInit();
  assert.equal(f.broadcasts.length, 0);
  assert.equal(f.service.pollTimers.size, 0);
});

test('shutdown cancels pending delays', async () => {
  const f = fixture('ENTRY_DELAY', 0);
  await f.service.onModuleInit();
  assert.equal(f.service.entryTimers.size, 1);
  f.service.onModuleDestroy();
  assert.equal(f.service.entryTimers.size, 0);
});
