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
    dashboardHiddenCards: true,
    dashboardHiddenSections: true,
    dashboardTemperatureDeviceIds: true,
    dashboardCardOrder: true,
    dashboardSectionOrder: true,
    weatherCityId: true,
    tempUnit: true,
    notificationsEnabled: true,
  });
  await service.getPreferences('other-user');
  assert.deepEqual(query.where, { id: 'other-user' });
});

test('dashboard order accepts permutations but rejects duplicates, unknown cards, omissions and null', async () => {
  for (const patch of [
    { dashboardCardOrder: ['temperature', 'weather', 'alarm'] },
    { dashboardSectionOrder: ['devices', 'overview', 'health', 'stats'] },
  ])
    assert.equal((await validate(plainToInstance(UpdatePreferencesDto, patch))).length, 0);
  for (const patch of [
    { dashboardCardOrder: ['alarm', 'alarm', 'weather'] },
    { dashboardCardOrder: ['alarm', 'weather'] },
    { dashboardCardOrder: ['alarm', 'weather', 'unknown'] },
    { dashboardCardOrder: null },
    { dashboardSectionOrder: ['devices', 'overview', 'stats'] },
    { dashboardSectionOrder: ['devices', 'overview', 'stats', 'stats'] },
    { dashboardSectionOrder: ['devices', 'overview', 'stats', 'unknown'] },
  ])
    assert.ok((await validate(plainToInstance(UpdatePreferencesDto, patch))).length > 0);
});

test('temperature selections permit zero to two unique IDs and reject malformed requests', async () => {
  for (const ids of [[], ['a'], ['a', 'b']]) {
    assert.equal(
      (
        await validate(
          plainToInstance(UpdatePreferencesDto, { dashboardTemperatureDeviceIds: ids }),
        )
      ).length,
      0,
    );
  }
  for (const ids of [null, 'a', ['a', 'a'], ['a', 'b', 'c'], [''], [42]]) {
    assert.ok(
      (
        await validate(
          plainToInstance(UpdatePreferencesDto, { dashboardTemperatureDeviceIds: ids }),
        )
      ).length > 0,
    );
  }
});

test('temperature preferences reject hidden or non-temperature devices before saving', async () => {
  let saved;
  let cloudCalls = 0;
  const viewer = {
    role: 'MEMBER',
    createdById: 'owner',
    permissions: { canViewDevices: true, allowedDeviceIds: ['sensor', 'switch'] },
  };
  const service = new UsersService(
    {
      user: {
        findUnique: async () => viewer,
        update: async ({ where, data }) => {
          saved = { where, data };
          return data;
        },
      },
    },
    {},
    {
      getDevices: async () => {
        cloudCalls++;
        return {
          devices: [
            { id: 'sensor', status: [{ code: 'temp_current', value: 18 }] },
            { id: 'switch', status: [{ code: 'switch', value: true }] },
          ],
        };
      },
    },
    {},
  );
  service.getTuyaCredentials = async () => ({ accessId: 'a', accessSecret: 's', region: 'eu' });
  await assert.rejects(
    service.updatePreferences('member', { dashboardTemperatureDeviceIds: ['hidden'] }),
    { status: 403 },
  );
  assert.equal(cloudCalls, 0);
  await assert.rejects(
    service.updatePreferences('member', { dashboardTemperatureDeviceIds: ['switch'] }),
    { status: 400 },
  );
  assert.equal(saved, undefined);
  await service.updatePreferences('member', { dashboardTemperatureDeviceIds: ['sensor'] });
  assert.deepEqual(saved, {
    where: { id: 'member' },
    data: { dashboardTemperatureDeviceIds: ['sensor'] },
  });
  await service.updatePreferences('member', { dashboardTemperatureDeviceIds: [] });
  assert.deepEqual(saved.data.dashboardTemperatureDeviceIds, []);
});

test('dashboard visibility accepts subsets including all hidden and rejects unknown or duplicate IDs', async () => {
  for (const patch of [
    { dashboardHiddenCards: [] },
    { dashboardHiddenSections: [] },
    {
      dashboardHiddenCards: [
        'alarm',
        'weather',
        'temperature',
        'total-devices',
        'online-devices',
        'offline-devices',
        'rooms',
      ],
    },
    { dashboardHiddenSections: ['overview', 'devices', 'stats', 'health'] },
  ])
    assert.equal((await validate(plainToInstance(UpdatePreferencesDto, patch))).length, 0);
  for (const patch of [
    { dashboardHiddenCards: null },
    { dashboardHiddenSections: null },
    { dashboardHiddenCards: ['unknown'] },
    { dashboardHiddenSections: ['unknown'] },
    { dashboardHiddenCards: ['weather', 'weather'] },
    { dashboardHiddenSections: ['stats', 'stats'] },
    { dashboardHiddenCards: 'alarm' },
  ])
    assert.ok((await validate(plainToInstance(UpdatePreferencesDto, patch))).length > 0);
});
