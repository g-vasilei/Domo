const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { createCipheriv, createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { decodeTuyaMessage, messagePassword } = require('../dist/tuya/tuya-message-codec');
const { TuyaMessagesService } = require('../dist/tuya/tuya-messages.service');

const creds = {
  accessId: 'project',
  accessSecret: '0123456789abcdef0123456789abcdef',
  region: 'eu',
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

function frame(
  data,
  { mode = 'aes_ecb', protocol = 4, messageId = 'message-1', at = Date.now() } = {},
) {
  const key = Buffer.from(creds.accessSecret.slice(8, 24));
  const iv = mode === 'aes_gcm' ? Buffer.alloc(12, 7) : null;
  const cipher = createCipheriv(mode === 'aes_gcm' ? 'aes-128-gcm' : 'aes-128-ecb', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  const encrypted =
    mode === 'aes_gcm' ? Buffer.concat([iv, ciphertext, cipher.getAuthTag()]) : ciphertext;
  const payload = { data: encrypted.toString('base64'), protocol, pv: '2.0', t: at };
  // Reference wire format from Tuya's published envelope/signing specification.
  payload.sign = createHash('md5')
    .update(`data=${payload.data}||protocol=${protocol}||pv=2.0||t=${at}||${creds.accessSecret}`)
    .digest('hex');
  return JSON.stringify({
    messageId,
    payload: Buffer.from(JSON.stringify(payload)).toString('base64'),
    properties: { em: mode },
  });
}

for (const mode of ['aes_ecb', 'aes_gcm']) {
  test(`${mode} authenticates and decodes a real OFF report, including its property timestamp`, () => {
    const decoded = decodeTuyaMessage(
      frame(
        { devId: 'a', status: [{ code: 'switch_1', value: false, t: 1700000000000 }] },
        { mode, at: 1700000000001 },
      ),
      creds.accessSecret,
    );
    assert.equal(decoded.messageId, 'message-1');
    assert.deepEqual(decoded.report, {
      deviceId: 'a',
      status: [{ code: 'switch_1', value: false, reportedAt: 1700000000000 }],
      observedAt: 1700000000001,
    });
  });
}

test('IoT Core string scalars retain false, zero, enum and string property values', () => {
  const decoded = decodeTuyaMessage(
    frame(
      {
        bizCode: 'devicePropertyMessage',
        ts: 1700000000000,
        bizData: {
          devId: 'a',
          properties: [
            { code: 'switch', value: 'false' },
            { code: 'countdown', value: '0' },
            { code: 'mode', value: 'auto' },
            { code: 'name', value: '"Room"' },
          ],
        },
      },
      { protocol: 1000 },
    ),
    creds.accessSecret,
  );
  assert.deepEqual(
    decoded.report.status.map((entry) => entry.value),
    [false, 0, 'auto', 'Room'],
  );
});

test('legacy and IoT Core connectivity reports do not invent power values', () => {
  for (const [protocol, data, online] of [
    [20, { devId: 'a', bizCode: 'online' }, true],
    [20, { devId: 'a', bizCode: 'offline' }, false],
    [1001, { bizCode: 'deviceOnline', bizData: { devId: 'a' } }, true],
    [1001, { bizCode: 'deviceOffline', bizData: { devId: 'a' } }, false],
  ]) {
    const { report } = decodeTuyaMessage(frame(data, { protocol }), creds.accessSecret);
    assert.equal(report.online, online);
    assert.deepEqual(report.status, []);
  }
});

test('tampered signatures and incorrect credentials are rejected before accepting status', () => {
  const raw = JSON.parse(frame({ devId: 'a', status: [{ code: 'switch', value: true }] }));
  const envelope = JSON.parse(Buffer.from(raw.payload, 'base64'));
  envelope.t++;
  raw.payload = Buffer.from(JSON.stringify(envelope)).toString('base64');
  assert.throws(() => decodeTuyaMessage(JSON.stringify(raw), creds.accessSecret), /signature/);
  assert.throws(() => decodeTuyaMessage(frame({}), 'wrong-key'), /signature/);
});

class FakeSocket extends EventEmitter {
  readyState = 0;
  sent = [];
  pings = 0;
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  ping() {
    this.pings++;
  }
  terminate() {
    this.readyState = 3;
    this.emit('close');
  }
}
function fixture(t) {
  const service = new TuyaMessagesService();
  service.logger = { log() {}, warn() {} };
  const sockets = [];
  service.createSocket = (url, options) => {
    const socket = new FakeSocket();
    sockets.push({ socket, url, options });
    return socket;
  };
  t.after(() => service.onModuleDestroy());
  service.ensure(creds);
  return { service, sockets, socket: sockets[0].socket };
}

test('one production subscription is shared per project, with verified TLS and derived password', (t) => {
  const f = fixture(t);
  f.service.ensure(creds);
  assert.equal(f.sockets.length, 1);
  const { url, options } = f.sockets[0];
  assert.ok(
    url.startsWith(
      'wss://mqe.tuyaeu.com:8285/ws/v2/consumer/persistent/project/out/event/project-sub?',
    ),
  );
  assert.ok(url.includes('subscriptionType=Failover'));
  assert.notEqual(options.rejectUnauthorized, false);
  assert.equal(options.headers.password, messagePassword(creds.accessId, creds.accessSecret));
  assert.ok(!url.includes(creds.accessSecret));
  f.socket.open();
  assert.equal(f.service.connected(creds), true);
});

test('messages are acknowledged after status is processed; unsupported messages are also drained', async (t) => {
  const f = fixture(t);
  f.socket.open();
  const reports = [];
  let complete;
  f.service.on('report', async (_creds, report) => {
    reports.push(report);
    await new Promise((resolve) => {
      complete = resolve;
    });
  });
  f.socket.emit(
    'message',
    Buffer.from(frame({ devId: 'a', status: [{ code: 'switch', value: false }] })),
  );
  await flush();
  assert.equal(reports[0].status[0].value, false);
  assert.deepEqual(f.socket.sent, []);
  complete();
  await flush();
  assert.deepEqual(f.socket.sent, [{ messageId: 'message-1' }]);
  f.socket.emit(
    'message',
    Buffer.from(frame({ devId: 'a' }, { protocol: 9999, messageId: 'ignored' })),
  );
  await flush();
  assert.equal(reports.length, 1);
  assert.deepEqual(f.socket.sent[1], { messageId: 'ignored' });
  assert.equal(f.service.diagnostics(creds).received, 2);
});

test('an invalid message closes the stream, does not acknowledge it, and exposes fallback', async (t) => {
  const f = fixture(t);
  f.socket.open();
  f.socket.emit('message', Buffer.from('{}'));
  await flush();
  assert.equal(f.service.connected(creds), false);
  assert.deepEqual(f.socket.sent, []);
});

test('heartbeat loss reconnects with backoff; shutdown cancels every retry', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval', 'setTimeout'], now: 100000 });
  const f = fixture(t);
  f.socket.open();
  t.mock.timers.tick(30000);
  assert.equal(f.socket.pings, 1);
  f.socket.emit('pong');
  for (let i = 0; i < 3; i++) t.mock.timers.tick(30000);
  assert.equal(f.service.connected(creds), false);
  t.mock.timers.tick(30000);
  assert.equal(f.sockets.length, 2);
  f.sockets[1].socket.terminate();
  t.mock.timers.tick(30000);
  assert.equal(f.sockets.length, 2, 'second retry backs off to 60s');
  f.service.onModuleDestroy();
  t.mock.timers.tick(3600000);
  assert.equal(f.sockets.length, 2);
});

test('credential rotation stops the old consumer and ignores its late open/message events', async (t) => {
  const f = fixture(t);
  f.socket.open();
  const reports = [];
  f.service.on('report', (...args) => reports.push(args));
  const rotated = { ...creds, accessSecret: 'abcdef0123456789abcdef0123456789' };
  f.service.ensure(rotated);
  assert.equal(f.sockets.length, 2);
  f.socket.open();
  f.socket.emit(
    'message',
    Buffer.from(frame({ devId: 'a', status: [{ code: 'switch', value: true }] })),
  );
  await flush();
  assert.equal(f.service.connected(rotated), false);
  assert.deepEqual(reports, []);
  f.sockets[1].socket.open();
  assert.equal(f.service.connected(rotated), true);
  assert.equal(f.service.connected(creds), false);
});
