const { test } = require('node:test');
const assert = require('node:assert/strict');
const pino = require('pino');
const { httpLoggingOptions } = require('../dist/common/logging');
const { TuyaService } = require('../dist/tuya/tuya.service');

test('routine requests use debug while HTTP failures remain visible', () => {
  const level = httpLoggingOptions.customLogLevel;
  assert.equal(level({}, { statusCode: 200 }), 'debug');
  assert.equal(level({}, { statusCode: 304 }), 'debug');
  assert.equal(level({}, { statusCode: 401 }), 'warn');
  assert.equal(level({}, { statusCode: 500 }), 'error');
  assert.equal(level({}, { statusCode: 200 }, new Error('failed')), 'error');
});

test('HTTP logs keep method, path, status and timing without headers or query secrets even at debug', () => {
  let output = '';
  const logger = pino(
    { ...httpLoggingOptions, level: 'debug' },
    {
      write: (chunk) => {
        output += chunk;
      },
    },
  );
  logger
    .child({
      req: {
        id: 7,
        method: 'GET',
        url: '/devices?token=query-secret',
        headers: { authorization: 'bearer-secret', cookie: 'cookie-secret' },
        body: { password: 'body-secret' },
      },
    })
    .debug(
      { res: { statusCode: 200, headers: { 'set-cookie': 'response-secret' } }, responseTime: 12 },
      'request completed',
    );
  const entry = JSON.parse(output);
  assert.deepEqual(entry.req, { id: 7, method: 'GET', url: '/devices' });
  assert.deepEqual(entry.res, { statusCode: 200 });
  assert.equal(entry.responseTime, 12);
  for (const secret of [
    'query-secret',
    'bearer-secret',
    'cookie-secret',
    'body-secret',
    'response-secret',
  ]) {
    assert.ok(!output.includes(secret));
  }
});

test('Tuya debug logging never prints token or device response payloads', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  const responses = [
    {
      success: true,
      result: { access_token: 'token-secret', refresh_token: 'refresh-secret', expire_time: 7200 },
    },
    {
      success: true,
      result: { devices: [{ id: 'device', local_key: 'device-secret', name: 'private-name' }] },
    },
  ];
  global.fetch = async () => ({ status: 200, json: async () => responses.shift() });
  const lines = [];
  const service = new TuyaService();
  service.logger = { debug: (line) => lines.push(line) };
  const result = await service.getDevices('client', 'secret', 'eu');
  assert.equal(result.devices[0].local_key, 'device-secret');
  assert.equal(lines.length, 2);
  for (const secret of ['token-secret', 'refresh-secret', 'device-secret', 'private-name']) {
    assert.ok(!lines.join('\n').includes(secret));
  }
  assert.ok(lines.every((line) => line.includes('HTTP 200')));
});
