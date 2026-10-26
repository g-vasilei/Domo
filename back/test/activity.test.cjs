const { test } = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { UsersService } = require('../dist/users/users.service');
const { ActivityQueryDto } = require('../dist/users/dto/activity-query.dto');

function fixture(role, rows = []) {
  let query;
  const service = new UsersService(
    {
      user: {
        findUnique: async () => (role ? { role } : null),
        findMany: async ({ where }) => {
          assert.equal(where.createdById, 'owner');
          return [{ id: 'member' }];
        },
      },
      log: {
        findMany: async (input) => {
          query = input;
          return rows;
        },
      },
    },
    {},
    {},
    {},
  );
  return { service, query: () => query };
}

test('owner activity is limited to their account and filters precede pagination', async () => {
  const f = fixture(
    'OWNER',
    Array.from({ length: 51 }, (_, id) => ({ id })),
  );
  const result = await f.service.getActivity('owner', {
    page: 2,
    context: 'automation',
    level: 'error',
  });
  assert.deepEqual(f.query().where, {
    userId: { in: ['owner', 'member'] },
    context: 'automation',
    level: 'error',
  });
  assert.equal(f.query().skip, 50);
  assert.equal(result.items.length, 50);
  assert.equal(result.hasMore, true);
  assert.deepEqual(f.query().orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
});

test('members see only their own activity and no unrelated log categories', async () => {
  const f = fixture('MEMBER');
  const result = await f.service.getActivity('member', {});
  assert.deepEqual(f.query().where.userId, { in: ['member'] });
  assert.deepEqual(f.query().where.context, { in: ['device', 'alarm', 'automation'] });
  assert.equal(result.hasMore, false);
  assert.equal(result.page, 1);
});

test('missing user cannot read activity', async () => {
  const f = fixture(null);
  await assert.rejects(f.service.getActivity('missing', {}), { status: 403 });
  assert.equal(f.query(), undefined);
});

test('activity query validates categories, levels and bounded pages', async () => {
  assert.equal(
    (await validate(plainToInstance(ActivityQueryDto, { page: '2', context: 'alarm' }))).length,
    0,
  );
  for (const input of [
    { page: 0 },
    { page: 1001 },
    { page: 1.5 },
    { page: 'oops' },
    { context: 'auth' },
    { level: 'anything' },
  ]) {
    assert.ok((await validate(plainToInstance(ActivityQueryDto, input))).length > 0);
  }
});

test('recent failures are filtered by time in the database before pagination', async () => {
  const f = fixture('OWNER');
  const since = '2026-10-25T08:00:00.000Z';
  await f.service.getActivity('owner', { level: 'error', since });
  assert.equal(f.query().where.level, 'error');
  assert.equal(f.query().where.createdAt.gte.toISOString(), since);
  assert.deepEqual(f.query().where.userId, { in: ['owner', 'member'] });
});

test('activity time filter rejects invalid dates', async () => {
  assert.equal(
    (await validate(plainToInstance(ActivityQueryDto, { since: '2026-10-25T08:00:00.000Z' })))
      .length,
    0,
  );
  for (const since of ['yesterday', '2026-02-30T12:00:00Z', '2026-13-01T12:00:00Z']) {
    assert.ok((await validate(plainToInstance(ActivityQueryDto, { since }))).length > 0);
  }
});
