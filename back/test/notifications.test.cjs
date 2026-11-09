const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NotificationsService } = require('../dist/notifications/notifications.service');
const { AlarmCallService } = require('../dist/alarm/alarm-call.service');

function setup() {
  const items = [],
    emitted = [],
    removed = [];
  const prisma = {
    appNotification: {
      create: async ({ data }) => {
        const n = { ...data, id: `id-${items.length}`, at: new Date(), read: false };
        items.push(n);
        return n;
      },
      findMany: async (args) => (args.skip ? [] : args),
      updateMany: async (args) => args,
      deleteMany: async (args) => args,
    },
    user: { findUnique: async () => ({ notificationsEnabled: false }) },
    pushSubscription: { findMany: async () => [], deleteMany: async (args) => removed.push(args) },
    pushKey: { findUnique: async () => ({ publicKey: 'public', privateKey: 'encrypted' }) },
  };
  const service = new NotificationsService(prisma, { decrypt: () => 'private' });
  return { service, prisma, items, emitted, removed, emit: (id, n) => emitted.push([id, n]) };
}

test('alarm and automation notifications persist even without connected clients or browser permission', async () => {
  const f = setup();
  await f.service.deliver(
    ['owner', 'member', 'owner'],
    'alarm:state',
    { state: 'TRIGGERED' },
    f.emit,
  );
  assert.equal(f.items.length, 2);
  assert.deepEqual(
    f.items.map((n) => n.userId),
    ['owner', 'member'],
  );
  assert.equal(f.items[0].kind, 'alarm');
  await f.service.deliver(
    ['owner'],
    'automation:alert',
    { message: 'Done', ruleName: 'Rule' },
    f.emit,
  );
  assert.equal(f.items[2].body, 'Done');
  await f.service.deliver(['owner'], 'device:update', {}, f.emit);
  assert.equal(f.items.length, 3);
});

test('history, reading and deletion are scoped to the authenticated user and explicit IDs', async () => {
  const f = setup();
  assert.equal((await f.service.list('member')).where.userId, 'member');
  assert.deepEqual((await f.service.read('member', ['a'])).where, {
    userId: 'member',
    id: { in: ['a'] },
  });
  assert.deepEqual((await f.service.clear('member', ['a'])).where, {
    userId: 'member',
    id: { in: ['a'] },
  });
});

test('push is sent to subscribed users and stale endpoints are removed without losing history', async () => {
  const f = setup();
  f.prisma.user.findUnique = async () => ({ notificationsEnabled: true });
  f.prisma.pushSubscription.findMany = async () => [
    { endpoint: 'https://fcm.googleapis.com/test', p256dh: 'key', auth: 'auth' },
  ];
  const original = f.service.sendPush;
  let sent;
  f.service.sendPush = async (_sub, payload) => {
    sent = JSON.parse(payload);
    throw Object.assign(Error('gone'), { statusCode: 410 });
  };
  try {
    await f.service.deliver(
      ['owner'],
      'device:alert',
      {
        type: 'state_change',
        deviceId: 'device',
        deviceName: 'Light',
        commands: [{ code: 'switch', value: true }],
      },
      f.emit,
    );
    assert.equal(sent.id, f.items[0].id);
    assert.equal(sent.url, '/devices/device');
    assert.equal(f.removed[0].where.userId, 'owner');
    assert.equal(f.items.length, 1);
  } finally {
    f.service.sendPush = original;
  }
});

test('push subscriptions reject server-side requests to arbitrary hosts', async () => {
  const f = setup();
  for (const endpoint of [
    'http://localhost/test',
    'https://127.0.0.1/test',
    'https://fcm.googleapis.com.evil.test/test',
    'https://fcm.googleapis.com:444/test',
  ]) {
    await assert.rejects(
      f.service.subscribe('owner', { endpoint, keys: { p256dh: 'key', auth: 'auth' } }),
    );
  }
});

test('failed voice requests and missing credentials reject so alarm failure can be recorded', async () => {
  const c = new AlarmCallService({}, {}, {});
  c.getCredentials = async () => null;
  await assert.rejects(c.callNumber('owner', 'test'), /not configured/);
  c.getCredentials = async () => ({
    baseUrl: 'https://example.invalid',
    apiKey: 'test',
    sender: 'test',
  });
  const original = global.fetch;
  try {
    global.fetch = async () => ({ ok: false, status: 503, text: async () => 'unavailable' });
    await assert.rejects(c.callNumber('owner', 'test'), /503/);
    global.fetch = async () => {
      throw Error('network failed');
    };
    await assert.rejects(c.callNumber('owner', 'test'), /network failed/);
  } finally {
    global.fetch = original;
  }
});

test('push contact settings validate email, trim whitespace and permit clearing only with an empty string', async () => {
  const { plainToInstance } = require('class-transformer');
  const { validate } = require('class-validator');
  const { UpdatePushSettingsDto } = require('../dist/notifications/update-push-settings.dto');
  for (const contactEmail of ['', 'owner@example.com', ' owner@example.com ']) {
    const dto = plainToInstance(UpdatePushSettingsDto, { contactEmail });
    assert.equal((await validate(dto)).length, 0);
    assert.equal(dto.contactEmail, contactEmail.trim());
  }
  for (const patch of [
    {},
    { contactEmail: null },
    { contactEmail: 123 },
    { contactEmail: 'invalid' },
    { contactEmail: 'mailto:owner@example.com' },
  ]) {
    assert.ok((await validate(plainToInstance(UpdatePushSettingsDto, patch))).length > 0);
  }
});

test('only owners may edit their own contact; clearing restores account email fallback', async () => {
  const f = setup();
  let updated;
  let user = { role: 'MEMBER', email: 'member@example.com', pushContactEmail: null };
  f.prisma.user.findUnique = async () => user;
  f.prisma.user.update = async (query) => {
    updated = query;
    return { ...user, ...query.data };
  };
  await assert.rejects(f.service.getPushSettings('member'), { status: 403 });
  await assert.rejects(f.service.updatePushSettings('member', 'contact@example.com'), {
    status: 403,
  });
  assert.equal(updated, undefined);
  user = { role: 'OWNER', email: 'owner@example.com', pushContactEmail: null };
  assert.deepEqual(await f.service.updatePushSettings('owner', 'contact@example.com'), {
    contactEmail: 'contact@example.com',
    defaultEmail: 'owner@example.com',
  });
  assert.deepEqual(updated.where, { id: 'owner', role: 'OWNER' });
  await f.service.updatePushSettings('owner', '');
  assert.equal(updated.data.pushContactEmail, null);
});

test('VAPID subject uses the household owner contact for members and falls back to owner account email', async () => {
  const f = setup();
  let owner = { email: 'owner@example.com', pushContactEmail: 'contact@example.com' };
  f.prisma.user.findUnique = async ({ where }) =>
    where.id === 'member'
      ? {
          notificationsEnabled: true,
          role: 'MEMBER',
          email: 'member@example.com',
          pushContactEmail: 'ignored@example.com',
          createdBy: owner,
        }
      : { notificationsEnabled: true, role: 'OWNER', ...owner };
  f.prisma.pushSubscription.findMany = async () => [
    { endpoint: 'https://fcm.googleapis.com/test', p256dh: 'key', auth: 'auth' },
  ];
  const subjects = [];
  f.service.sendPush = async (_sub, _payload, options) =>
    subjects.push(options.vapidDetails.subject);
  await f.service.deliver(['member', 'owner'], 'automation:alert', { message: 'Done' }, f.emit);
  assert.deepEqual(subjects, ['mailto:contact@example.com', 'mailto:contact@example.com']);
  owner = { email: 'owner@example.com', pushContactEmail: null };
  await f.service.deliver(['member'], 'automation:alert', { message: 'Done' }, f.emit);
  assert.equal(subjects[2], 'mailto:owner@example.com');
  owner = { email: 'other-owner@example.com', pushContactEmail: 'other-contact@example.com' };
  await f.service.deliver(['other-owner'], 'automation:alert', { message: 'Done' }, f.emit);
  assert.equal(subjects[3], 'mailto:other-contact@example.com');
});

test('subscription API accepts browser JSON with null, numeric or omitted expirationTime under strict validation', async () => {
  const { ValidationPipe } = require('@nestjs/common');
  const {
    SubscriptionDto,
    NotificationsController,
  } = require('../dist/notifications/notifications.controller');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata = { type: 'body', metatype: SubscriptionDto };
  const base = {
    endpoint: 'https://fcm.googleapis.com/test',
    keys: { p256dh: 'key', auth: 'auth' },
  };
  const calls = [];
  const controller = new NotificationsController({
    subscribe: async (...args) => calls.push(['subscribe', ...args]),
    unsubscribe: async (...args) => calls.push(['unsubscribe', ...args]),
  });
  for (const extra of [{}, { expirationTime: null }, { expirationTime: 1800000000000 }]) {
    const dto = await pipe.transform({ ...base, ...extra }, metadata);
    await controller.subscribe({ user: { id: 'owner' } }, dto);
    await controller.unsubscribe({ user: { id: 'owner' } }, dto);
    assert.equal(calls.at(-2)[1], 'owner');
    assert.equal(calls.at(-1)[2], base.endpoint);
  }
  for (const extra of [
    { expirationTime: 'tomorrow' },
    { expirationTime: -1 },
    { unexpected: true },
  ]) {
    await assert.rejects(pipe.transform({ ...base, ...extra }, metadata), { status: 400 });
  }
  await assert.rejects(
    pipe.transform({ ...base, keys: { ...base.keys, unexpected: true } }, metadata),
    { status: 400 },
  );
});
