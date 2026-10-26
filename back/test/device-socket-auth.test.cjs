const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { DevicesModule } = require('../dist/devices/devices.module');
const { DevicesGateway } = require('../dist/devices/devices.gateway');

function gateway() {
  const jwtModule = Reflect.getMetadata('imports', DevicesModule).find(
    (entry) => entry.module === JwtModule,
  );
  const factory = jwtModule.providers.find((provider) => provider.provide === 'JWT_MODULE_OPTIONS');
  const config = {
    JWT_ACCESS_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
  };
  const jwt = new JwtService(
    factory.useFactory({ get: (key, fallback) => config[key] ?? fallback }),
  );
  return new DevicesGateway(jwt);
}

function socket(token) {
  return {
    id: 'test',
    handshake: { auth: { token }, headers: {} },
    data: {},
    disconnected: false,
    disconnect() {
      this.disconnected = true;
    },
  };
}

test('websocket accepts the same access-token secret as login without a legacy JWT_SECRET', async () => {
  const token = new JwtService({ secret: 'test-access-secret' }).sign({ sub: 'owner' });
  const client = socket(token);
  await gateway().handleConnection(client);
  assert.equal(client.data.userId, 'owner');
  assert.equal(client.disconnected, false);
});

test('websocket rejects refresh tokens, expired tokens and missing credentials', async () => {
  const refresh = new JwtService({ secret: 'test-refresh-secret' }).sign({ sub: 'owner' });
  const expired = new JwtService({ secret: 'test-access-secret' }).sign(
    { sub: 'owner' },
    { expiresIn: -1 },
  );
  for (const token of [refresh, expired, undefined]) {
    const client = socket(token);
    await gateway().handleConnection(client);
    assert.equal(client.disconnected, true);
    assert.equal(client.data.userId, undefined);
  }
});
