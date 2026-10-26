const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AutomationEvaluatorService } = require('../dist/automation/automation-evaluator.service');

function fixture(conditions) {
  const rule = {
    id: 'rule',
    userId: 'owner',
    name: 'Rule',
    enabled: true,
    conditionMet: false,
    lastTriggeredAt: null,
    user: { timezone: 'Europe/Athens' },
    conditions,
    actions: [{ type: 'notification', value: 'Done', order: 0 }],
  };
  const statuses = new Map();
  const reads = [];
  let fired = 0;
  const logs = [];
  const service = new AutomationEvaluatorService(
    {
      log: {
        create: async ({ data }) => {
          logs.push(data);
        },
      },
      automationRule: {
        findMany: async () => [structuredClone(rule)],
        updateMany: async ({ where, data }) => {
          if (where.conditionMet !== undefined && where.conditionMet !== rule.conditionMet)
            return { count: 0 };
          if (
            'lastTriggeredAt' in where &&
            where.lastTriggeredAt?.getTime() !== rule.lastTriggeredAt?.getTime()
          )
            return { count: 0 };
          Object.assign(rule, data);
          return { count: 1 };
        },
      },
      user: { findMany: async () => [{ id: 'owner' }] },
    },
    {
      getDeviceStatus: async (ownerId, id) => {
        assert.equal(ownerId, 'owner');
        reads.push(id);
        if (!statuses.has(id)) throw Error('offline');
        return statuses.get(id);
      },
    },
    { broadcastToUsers: () => fired++ },
  );
  return { service, rule, statuses, reads, logs, fired: () => fired };
}
const condition = (deviceId, statusCode = 'switch') => ({
  type: 'device_state',
  deviceId,
  statusCode,
  value: true,
});
const command = (value) => [{ code: 'switch', value }];

test('partial command overlays lagging status and evaluates all devices', async () => {
  const f = fixture([condition('a'), condition('a', 'ready'), condition('b')]);
  f.statuses.set('a', [
    { code: 'switch', value: false },
    { code: 'ready', value: true },
  ]);
  f.statuses.set('b', command(true));
  await f.service.evaluateOnCommand('owner', 'a', command(true));
  assert.equal(f.fired(), 1);
  assert.deepEqual(f.reads, ['a', 'b']);
});

test('duplicate commands and concurrent polling claim only one edge; false rearms it', async () => {
  const f = fixture([condition('a')]);
  f.statuses.set('a', command(true));
  await Promise.all([
    f.service.evaluateOnCommand('owner', 'a', command(true)),
    f.service.evaluateDeviceStateRules(),
  ]);
  await f.service.evaluateOnCommand('owner', 'a', command(true));
  assert.equal(f.fired(), 1);
  await f.service.evaluateOnCommand('owner', 'a', command(false));
  assert.equal(f.rule.conditionMet, false);
  await f.service.evaluateOnCommand('owner', 'a', command(true));
  assert.equal(f.fired(), 2);
});

test('missing inputs preserve edge state instead of causing a false retrigger', async () => {
  const f = fixture([condition('a'), condition('b')]);
  f.rule.conditionMet = true;
  f.statuses.set('a', command(true));
  await f.service.evaluateDeviceStateRules();
  await f.service.evaluateOnCommand('owner', 'a', command(true));
  assert.equal(f.rule.conditionMet, true);
  f.statuses.set('b', command(true));
  await f.service.evaluateDeviceStateRules();
  assert.equal(f.fired(), 0);
});

test('accepted single-property command can evaluate even if status read fails', async () => {
  const f = fixture([condition('a')]);
  await f.service.evaluateOnCommand('owner', 'a', command(true));
  assert.equal(f.fired(), 1);
});

test('time-based evaluation also loads device inputs for mixed rules', async () => {
  const f = fixture([condition('a')]);
  f.statuses.set('a', command(true));
  await f.service.evaluateTimeSunRules();
  assert.deepEqual(f.reads, ['a']);
  assert.equal(f.fired(), 1);
});

test('automation history records successful and failed actions without raw error details', async () => {
  const f = fixture([condition('a')]);
  await f.service.evaluateOnCommand('owner', 'a', command(true));
  assert.equal(f.logs[0].context, 'automation');
  assert.equal(f.logs[0].level, 'info');
  await f.service.executeActions(
    [{ type: 'device_control', deviceId: 'b', statusCode: 'switch', value: true }],
    'owner',
    'Rule',
  );
  assert.equal(f.logs[1].level, 'error');
  assert.equal(f.logs[1].metadata.deviceId, 'b');
  assert.equal(f.logs[1].metadata.actionType, 'device_control');
});
