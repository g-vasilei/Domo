require('dotenv').config();
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { DeviceSchedulesService } = require('../dist/devices/device-schedules.service');

test('PostgreSQL stores a schedule with independent slots, supports edit and removes it with its slots', async () => {
  const prisma = new PrismaClient();
  let user;
  try {
    user = await prisma.user.create({
      data: { email: `schedule-test-${randomUUID()}@example.invalid`, dashboardWidgets: [] },
    });
    const devices = {
      deviceAccess: async (userId) => userId,
      getDevice: async () => ({ name: 'Test device', status: [{ code: 'switch', value: false }] }),
    };
    const service = new DeviceSchedulesService(prisma, devices);
    const dto = {
      name: 'Test schedule',
      deviceName: 'Test device',
      switchCode: 'switch',
      timezone: 'Europe/Athens',
      days: [1, 3, 5],
      enabled: false,
      slots: [
        { time: '14:15', minutes: 40 },
        { time: '16:15', minutes: 25 },
      ],
    };
    const saved = await service.save(user.id, 'test-device', dto);
    assert.equal(saved.slots.length, 2);
    assert.equal(saved.enabled, false);
    assert.deepEqual(saved.days, [1, 3, 5]);
    await prisma.deviceScheduleSlot.update({
      where: { id: saved.slots[0].id },
      data: { lastRunKey: '2026-10-25T14:15' },
    });
    const updated = await service.save(
      user.id,
      'test-device',
      {
        ...dto,
        name: 'Updated schedule',
        slots: [
          { time: '14:15', minutes: 50 },
          { time: '18:00', minutes: 40 },
        ],
      },
      saved.id,
    );
    assert.equal(updated.name, 'Updated schedule');
    assert.equal(updated.slots[0].minutes, 50);
    assert.equal(updated.slots[0].lastRunKey, '2026-10-25T14:15');
    assert.equal(updated.slots[1].time, '18:00');
    assert.equal((await service.list(user.id, 'test-device')).length, 1);
    await assert.rejects(() => service.remove('wrong-owner', 'test-device', saved.id));
    await service.remove(user.id, 'test-device', saved.id);
    assert.equal(await prisma.deviceScheduleSlot.count({ where: { scheduleId: saved.id } }), 0);
    assert.equal((await service.list(user.id, 'test-device')).length, 0);
  } finally {
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
