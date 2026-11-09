const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const { EncryptionService } = require('../dist/encryption/encryption.service');
const { NotificationsService } = require('../dist/notifications/notifications.service');
const make = (key) => new EncryptionService({ get: () => key });

test('existing UTF-8 Tuya key supports generating and decrypting persisted VAPID keys', async () => {
  const encryption = make('existing-live-key-with-32-bytes!!');
  let stored;
  const service = new NotificationsService(
    {
      pushKey: {
        findUnique: async () => stored,
        upsert: async ({ create }) => {
          stored = create;
          return stored;
        },
      },
    },
    encryption,
  );
  const keys = await service.keys();
  assert.equal(Buffer.from(keys.publicKey, 'base64url').length, 65);
  assert.equal(Buffer.from(encryption.decrypt(keys.privateKey), 'base64url').length, 32);
  assert.equal((await service.keys()).publicKey, keys.publicKey);
});

test('existing hex-key GCM ciphertext remains readable', () => {
  const hex = 'ab'.repeat(32);
  const iv = Buffer.alloc(12, 1);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update('existing-secret', 'utf8'), cipher.final()]);
  const data = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  assert.equal(make(hex).decrypt(data), 'existing-secret');
});

test('invalid encryption configuration fails before serving requests and never prints the secret', () => {
  for (const key of [undefined, '', 'short-secret']) {
    assert.throws(() => make(key), /ENCRYPTION_KEY/);
  }
});
