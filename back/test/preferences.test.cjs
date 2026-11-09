const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { UsersService } = require('../dist/users/users.service');
const { UpdatePreferencesDto } = require('../dist/users/dto/update-preferences.dto');

test('preferences validate cities, units and boolean flags, including null rejection', async () => {
  for (const patch of [
    { weatherCityId: 'veria' },
    { tempUnit: 'F' },
    { notificationsEnabled: false },
  ]) {
    assert.equal((await validate(plainToInstance(UpdatePreferencesDto, patch))).length, 0);
  }
  for (const patch of [
    { weatherCityId: 'unknown' },
    { tempUnit: 'K' },
    { notificationsEnabled: 'true' },
    { weatherCityId: null },
    { tempUnit: null },
    { notificationsEnabled: null },
  ]) {
    assert.ok((await validate(plainToInstance(UpdatePreferencesDto, patch))).length > 0);
  }
});

test('partial preference updates target only the authenticated user and preserve omitted fields', async () => {
  let query;
  const prefs = { weatherCityId: 'veria', tempUnit: 'F', notificationsEnabled: false };
  const service = new UsersService(
    {
      user: {
        update: async (input) => {
          query = input;
          return prefs;
        },
        findUnique: async (input) => {
          query = input;
          return prefs;
        },
      },
    },
    {},
    {},
    {},
  );
  assert.deepEqual(await service.updatePreferences('member-id', { tempUnit: 'F' }), prefs);
  assert.deepEqual(query.where, { id: 'member-id' });
  assert.deepEqual(query.data, { tempUnit: 'F' });
  assert.deepEqual(query.select, {
    weatherCityId: true,
    tempUnit: true,
    notificationsEnabled: true,
  });
  await service.getPreferences('other-user');
  assert.deepEqual(query.where, { id: 'other-user' });
});
