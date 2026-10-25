const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const {
  DeviceSchedulesService,
  scheduleClock,
} = require('../dist/devices/device-schedules.service');
const { DevicesService } = require('../dist/devices/devices.service');
const {
  SaveDeviceScheduleDto,
  StartDeviceTimerDto,
} = require('../dist/devices/dto/device-schedule.dto');

const input = () => ({
  name: 'Schedule 1',
  deviceName: 'AC',
  switchCode: 'switch',
  timezone: 'Europe/Athens',
  enabled: true,
  days: [1, 2, 3, 4, 5, 6, 0],
  slots: [
    { time: '14:15', minutes: 40 },
    { time: '16:15', minutes: 40 },
  ],
});

test('schedule input requires valid times, durations, weekdays, and at least one slot', async () => {
  assert.equal((await validate(plainToInstance(SaveDeviceScheduleDto, input()))).length, 0);
  for (const change of [
    { slots: [] },
    { slots: [{ time: '24:15', minutes: 40 }] },
    { slots: [{ time: '14:15', minutes: 0 }] },
    { slots: [{ time: '14:15', minutes: 1.5 }] },
    { days: [] },
    { days: [7] },
    { days: [1, 1] },
  ]) {
    assert.ok(
      (await validate(plainToInstance(SaveDeviceScheduleDto, { ...input(), ...change }))).length >
        0,
    );
  }
  assert.ok(
    (
      await validate(
        plainToInstance(StartDeviceTimerDto, {
          deviceId: 'ac',
          deviceName: 'AC',
          switchCode: 'switch',
          minutes: -1,
        }),
      )
    ).length > 0,
  );
});

test('local clock respects timezone, midnight and repeated DST hour', () => {
  assert.deepEqual(scheduleClock(new Date('2026-10-25T22:15:00Z'), 'Europe/Athens'), {
    time: '00:15',
    key: '2026-10-26T00:15',
    day: 1,
  });
  assert.equal(
    scheduleClock(new Date('2026-10-25T00:15:00Z'), 'Europe/Athens').key,
    scheduleClock(new Date('2026-10-25T01:15:00Z'), 'Europe/Athens').key,
  );
});

test('schedule rejects invalid timezone and duplicate start times', () => {
  const service = new DeviceSchedulesService({}, {});
  assert.throws(() => service.validate({ ...input(), timezone: 'Invalid/Timezone' }));
  assert.throws(() =>
    service.validate({
      ...input(),
      slots: [
        { time: '14:15', minutes: 40 },
        { time: '14:15', minutes: 20 },
      ],
    }),
  );
});

test('multiple rules execute independently, once per local minute, with weekday filtering', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T12:15:00Z') });
  const schedule = {
    id: 'schedule',
    userId: 'owner',
    deviceId: 'ac',
    deviceName: 'AC',
    switchCode: 'switch',
    enabled: true,
    timezone: 'Europe/Athens',
    days: [1],
    slots: [
      { id: 'first', time: '14:15', minutes: 40, lastRunKey: null },
      { id: 'second', time: '16:15', minutes: 25, lastRunKey: null },
    ],
  };
  const calls = [];
  const prisma = {
    deviceSchedule: { findMany: async () => [structuredClone(schedule)] },
    deviceScheduleSlot: {
      updateMany: async ({ where, data }) => {
        const slot = schedule.slots.find(
          (s) => s.id === where.id && s.lastRunKey === where.lastRunKey,
        );
        if (!slot) return { count: 0 };
        Object.assign(slot, data);
        return { count: 1 };
      },
    },
  };
  const service = new DeviceSchedulesService(prisma, {
    createTimer: async (...args) => calls.push(args),
  });
  await service.runSchedules();
  await service.runSchedules();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][5], true);
  assert.equal(calls[0][4], 40);
  t.mock.timers.tick(120 * 60_000);
  await service.runSchedules();
  assert.equal(calls.length, 2);
  assert.equal(calls[1][4], 25);
  t.mock.timers.tick(24 * 60 * 60_000);
  await service.runSchedules();
  assert.equal(calls.length, 2);
});

test('failed scheduled starts release their claim for retry', async () => {
  const clock = scheduleClock(new Date(), 'UTC');
  const slot = { id: 'slot', time: clock.time, minutes: 40, lastRunKey: null };
  const schedule = {
    id: 's',
    userId: 'owner',
    deviceId: 'ac',
    deviceName: 'AC',
    switchCode: 'switch',
    enabled: true,
    timezone: 'UTC',
    days: [clock.day],
    slots: [slot],
  };
  let attempts = 0;
  const prisma = {
    deviceSchedule: { findMany: async () => [structuredClone(schedule)] },
    deviceScheduleSlot: {
      updateMany: async ({ data }) => {
        Object.assign(slot, data);
        return { count: 1 };
      },
    },
  };
  const service = new DeviceSchedulesService(prisma, {
    createTimer: async () => {
      if (++attempts === 1) throw new Error('Temporary failure');
    },
  });
  service.logger = { error: () => {} };
  await service.runSchedules();
  assert.equal(slot.lastRunKey, null);
  await service.runSchedules();
  assert.equal(attempts, 2);
  assert.equal(slot.lastRunKey, clock.key);
});

function timerFixture() {
  let timer = null;
  const commands = [];
  const prisma = {
    user: { findUnique: async () => ({ id: 'owner', role: 'OWNER' }) },
    deviceTimer: {
      findUnique: async () => timer,
      upsert: async ({ create, update }) => {
        timer = timer ? { ...timer, ...update } : { id: 'timer', ...create };
        return timer;
      },
      deleteMany: async () => {
        timer = null;
        return { count: 1 };
      },
    },
  };
  prisma.$transaction = async (fn) => fn(prisma);
  const service = new DevicesService({}, {}, {}, prisma, {});
  service.getDevice = async () => ({ status: [{ code: 'switch', value: false }] });
  service.sendCommand = async (_user, _device, cmd) => {
    assert.ok(timer, 'auto-off is persisted before power-on');
    commands.push(...cmd);
  };
  return {
    service,
    prisma,
    commands,
    get timer() {
      return timer;
    },
  };
}

test('countdown is persisted before power-on and overlaps preserve latest end', async () => {
  const f = timerFixture();
  const first = await f.service.createTimer('owner', 'ac', 'AC', 'switch', 40);
  const second = await f.service.createTimer('owner', 'ac', 'AC', 'switch', 10, true);
  assert.equal(second.endsAt.getTime(), first.endsAt.getTime());
  await f.service.expireTimer('timer', 'ac');
  assert.equal(f.commands.filter((c) => c.value === false).length, 0);
  const third = await f.service.createTimer('owner', 'ac', 'AC', 'switch', 90, true);
  assert.ok(third.endsAt > second.endsAt);
});

test('expired timers survive failed off command and can be retried after restart', async () => {
  const f = timerFixture();
  await f.service.createTimer('owner', 'ac', 'AC', 'switch', 40);
  f.timer.endsAt = new Date(0);
  f.service.sendCommand = async () => {
    throw new Error('offline');
  };
  await assert.rejects(() => f.service.expireTimer('timer', 'ac'));
  assert.ok(f.timer);
  f.service.sendCommand = async (_u, _d, commands) => f.commands.push(...commands);
  await f.service.expireTimer('timer', 'ac');
  assert.equal(f.timer, null);
  assert.equal(f.commands.at(-1).value, false);
});

test('members need schedule permission, control permission and access to the device', async () => {
  const f = timerFixture();
  const permissions = {
    canViewDevices: true,
    canControlDevices: true,
    canCreateSchedules: true,
    allowedDeviceIds: ['ac'],
  };
  f.prisma.user.findUnique = async () => ({ role: 'MEMBER', createdById: 'owner', permissions });
  assert.equal(await f.service.deviceAccess('member', 'ac', 'schedule'), 'owner');
  await assert.rejects(() => f.service.deviceAccess('member', 'other', 'schedule'));
  permissions.canCreateSchedules = false;
  await assert.rejects(() => f.service.deviceAccess('member', 'ac', 'schedule'));
  permissions.canControlDevices = false;
  await assert.rejects(() => f.service.deviceAccess('member', 'ac', 'control'));
});

test('an old expiry queued during a new run cannot switch off the new countdown', async () => {
  const f = timerFixture();
  await f.service.createTimer('owner', 'ac', 'AC', 'switch', 40);
  f.timer.endsAt = new Date(0);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  f.service.getDevice = async () => {
    await gate;
    return { status: [{ code: 'switch', value: false }] };
  };
  const start = f.service.createTimer('owner', 'ac', 'AC', 'switch', 40, true);
  const expire = f.service.expireTimer('timer', 'ac');
  release();
  await Promise.all([start, expire]);
  assert.ok(f.timer.endsAt.getTime() > Date.now());
  assert.equal(f.commands.filter((command) => command.value === false).length, 0);
});
