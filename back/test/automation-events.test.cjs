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
          if (where.enabled !== undefined && where.enabled !== rule.enabled) return { count: 0 };
          if (
            where.updatedAt !== undefined &&
            where.updatedAt?.getTime() !== rule.updatedAt?.getTime()
          )
            return { count: 0 };
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
  service.retryDelay = async () => {};
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

test('OR can fire with one unavailable device while AND remains unknown', async () => {
  const f = fixture([{ ...condition('a'), nextOperator: 'OR' }, condition('b')]);
  f.statuses.set('a', command(true));
  await f.service.evaluateDeviceStateRules();
  assert.equal(f.fired(), 1);
  f.statuses.clear();
  await f.service.evaluateDeviceStateRules();
  assert.equal(f.rule.conditionMet, true);
  f.statuses.set('a', command(false));
  await f.service.evaluateDeviceStateRules();
  assert.equal(f.rule.conditionMet, true, 'false OR unknown cannot rearm');
  f.rule.conditions[0].nextOperator = 'AND';
  await f.service.evaluateDeviceStateRules();
  assert.equal(f.rule.conditionMet, false, 'false AND unknown is conclusively false');
});

test('three-valued logic handles both input orders and mixed operators', async () => {
  const f = fixture([]);
  for (const [operator, a, b, expected] of [
    ['OR', null, true, true],
    ['OR', null, false, null],
    ['OR', null, null, null],
    ['AND', null, false, false],
    ['AND', null, true, null],
    ['AND', null, null, null],
  ]) {
    const statuses = new Map();
    if (a !== null) statuses.set('a', command(a));
    if (b !== null) statuses.set('b', command(b));
    assert.equal(
      await f.service.evaluateConditions(
        [{ ...condition('a'), nextOperator: operator }, condition('b')],
        undefined,
        undefined,
        statuses,
      ),
      expected,
    );
  }
});

test('failed device actions retry without repeating successful actions', async () => {
  const f = fixture([]);
  f.service.retryDelay = async () => {};
  let attempts = 0;
  f.service.devicesService.sendCommand = async () => {
    if (++attempts < 3) throw Error('temporary outage');
  };
  const results = await f.service.executeActions(
    [
      { type: 'notification', value: 'Once', order: 0 },
      { type: 'device_control', deviceId: 'b', statusCode: 'switch', value: false, order: 1 },
    ],
    'owner',
    'Retry',
  );
  assert.equal(f.fired(), 1);
  assert.equal(attempts, 3);
  assert.deepEqual(
    results.map((r) => [r.ok, r.attempts]),
    [
      [true, 1],
      [true, 3],
    ],
  );
  assert.equal(f.logs.length, 2);
});

test('retries are bounded and permission errors are not retried; later actions still run', async () => {
  const { ForbiddenException } = require('@nestjs/common');
  const f = fixture([]);
  f.service.retryDelay = async () => {};
  let attempts = 0;
  f.service.devicesService.sendCommand = async () => {
    attempts++;
    throw Error('offline');
  };
  const action = { type: 'device_control', deviceId: 'b', statusCode: 'switch', value: true };
  assert.deepEqual((await f.service.executeActions([action], 'owner'))[0], {
    type: 'device_control',
    ok: false,
    attempts: 3,
  });
  assert.equal(attempts, 3);
  f.service.devicesService.sendCommand = async () => {
    attempts++;
    throw new ForbiddenException();
  };
  const results = await f.service.executeActions([action, { type: 'notification' }], 'owner');
  assert.equal(attempts, 4);
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
});

test('manual test reports failures and never consumes an automatic edge', async () => {
  const f = fixture([condition('a')]);
  f.service.retryDelay = async () => {};
  f.service.prisma.automationRule.findUnique = async () => structuredClone(f.rule);
  f.statuses.set('a', command(true));
  f.rule.actions = [{ type: 'device_control', deviceId: 'b', statusCode: 'switch', value: true }];
  const trace = await f.service.testRule('owner', 'rule');
  assert.equal(trace.result, 'actions_failed');
  assert.equal(trace.steps.at(-1).actions[0].ok, false);
  assert.equal(f.rule.conditionMet, false);
  f.statuses.clear();
  assert.equal((await f.service.testRule('owner', 'rule')).result, 'inputs_unavailable');
});

test('malformed saved actions are recorded as failures instead of successes', async () => {
  const f = fixture([]);
  const results = await f.service.executeActions(
    [{ type: 'countdown', deviceId: 'b', minutes: 5 }, { type: 'unknown' }],
    'owner',
  );
  assert.ok(results.every((result) => !result.ok && result.attempts === 1));
  assert.ok(f.logs.every((log) => log.level === 'error'));
});

test('one invalid rule does not prevent remaining rules from firing', async () => {
  const f = fixture([condition('a')]);
  f.statuses.set('a', command(true));
  f.service.prisma.automationRule.findMany = async () => [
    {
      ...structuredClone(f.rule),
      conditions: [{ type: 'time', timeValue: '12:00' }],
      user: { timezone: 'invalid' },
    },
    structuredClone(f.rule),
  ];
  await f.service.evaluateTimeSunRules();
  assert.equal(f.fired(), 1);
});

test('overlapping device polls are skipped and the guard is released after errors', async () => {
  const f = fixture([condition('a')]);
  let release;
  let queries = 0;
  f.service.prisma.automationRule.findMany = async () => {
    queries++;
    await new Promise((resolve) => {
      release = resolve;
    });
    throw Error('database unavailable');
  };
  const first = f.service.evaluateDeviceStateRules();
  await f.service.evaluateDeviceStateRules();
  assert.equal(queries, 1);
  release();
  await assert.rejects(first);
  f.service.prisma.automationRule.findMany = async () => [];
  await f.service.evaluateDeviceStateRules();
  assert.equal(f.service.pollingDevices, false);
});

async function atTime(iso, run) {
  const RealDate = global.Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [iso]));
    }
    static now() {
      return new RealDate(iso).getTime();
    }
  };
  try {
    await run();
  } finally {
    global.Date = RealDate;
  }
}

test('time conditions handle midnight, neq and DST local time', async () => {
  const f = fixture([]);
  await atTime('2026-11-09T22:00:00Z', () => {
    assert.equal(f.service.evaluateTimeCondition({ timeValue: '00:00' }, 'Europe/Athens'), true);
    assert.equal(
      f.service.evaluateTimeCondition({ timeValue: '00:01', operator: 'lt' }, 'Europe/Athens'),
      true,
    );
    assert.equal(
      f.service.evaluateTimeCondition({ timeValue: '00:01', operator: 'neq' }, 'Europe/Athens'),
      true,
    );
    assert.equal(f.service.evaluateTimeCondition({ timeValue: '24:00' }, 'Europe/Athens'), false);
  });
  for (const iso of ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z']) {
    await atTime(iso, () =>
      assert.equal(f.service.evaluateTimeCondition({ timeValue: '03:30' }, 'Europe/Athens'), true),
    );
  }
});

test('sun conditions use the local solar day at night and never match a minute early', async () => {
  const SunCalc = require('suncalc');
  const f = fixture([]);
  const latitude = 37.9838,
    longitude = 23.7275;
  await atTime('2026-11-09T21:30:00Z', () => {
    assert.equal(
      f.service.evaluateSunCondition(
        { sunEvent: 'sunset', operator: 'gt' },
        latitude,
        longitude,
        'Europe/Athens',
      ),
      true,
    );
    assert.equal(
      f.service.evaluateSunCondition(
        { sunEvent: 'sunrise', operator: 'lt' },
        latitude,
        longitude,
        'Europe/Athens',
      ),
      false,
    );
  });
  const sunset = SunCalc.getTimes(new Date('2026-11-09T12:00:00Z'), latitude, longitude).sunset;
  const minute = Math.floor(sunset.getTime() / 60000) * 60000;
  await atTime(new Date(minute - 60000).toISOString(), () =>
    assert.equal(
      f.service.evaluateSunCondition({ sunEvent: 'sunset' }, latitude, longitude, 'Europe/Athens'),
      false,
    ),
  );
  await atTime(new Date(minute).toISOString(), () =>
    assert.equal(
      f.service.evaluateSunCondition({ sunEvent: 'sunset' }, latitude, longitude, 'Europe/Athens'),
      true,
    ),
  );
  const shifted = minute + 600 * 60000;
  await atTime(new Date(shifted).toISOString(), () =>
    assert.equal(
      f.service.evaluateSunCondition(
        { sunEvent: 'sunset', sunOffsetMin: 600 },
        latitude,
        longitude,
        'Europe/Athens',
      ),
      true,
    ),
  );
});

test('stale evaluations cannot fire or rearm a rule edited after the snapshot', async () => {
  const f = fixture([condition('a')]);
  f.rule.updatedAt = new Date(1000);
  const stale = { ...structuredClone(f.rule), updatedAt: new Date(0) };
  await f.service.evaluateRule(
    stale,
    'owner',
    undefined,
    undefined,
    new Map([['a', command(true)]]),
  );
  assert.equal(f.fired(), 0);
  f.rule.conditionMet = true;
  await f.service.evaluateRule(
    { ...stale, conditionMet: true },
    'owner',
    undefined,
    undefined,
    new Map([['a', command(false)]]),
  );
  assert.equal(f.rule.conditionMet, true);
});

test('polar days without a solar event never satisfy sunrise/sunset inequality', async () => {
  const f = fixture([]);
  await atTime('2026-06-21T12:00:00Z', () =>
    assert.equal(
      f.service.evaluateSunCondition({ sunEvent: 'sunset', operator: 'neq' }, 89, 0, 'UTC'),
      false,
    ),
  );
});
