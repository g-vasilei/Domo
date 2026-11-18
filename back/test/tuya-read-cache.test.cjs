const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TuyaReadCache } = require('../dist/tuya/tuya-read-cache');

test('concurrent cache misses perform one read; expiry rechecks cloud state', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const cache = new TuyaReadCache();
  let calls = 0;
  const load = async () => ({ on: ++calls === 1 });
  const snapshots = await Promise.all(
    Array.from({ length: 30 }, () => cache.read('project:state:list', 120000, load)),
  );
  assert.equal(calls, 1);
  snapshots[0].on = false;
  assert.equal(snapshots[1].on, true);
  t.mock.timers.tick(120000);
  assert.equal((await cache.read('project:state:list', 120000, load)).on, false);
  assert.equal(calls, 2);
});

test('failed reads release the lock and never cache a success or stale fallback', async () => {
  const cache = new TuyaReadCache();
  await assert.rejects(
    () =>
      cache.read('a', 1000, async () => {
        throw Error('offline');
      }),
    /offline/,
  );
  assert.equal(await cache.read('a', 1000, async () => false), false);
});

test('invalidation protects newer state from late reads, including their waiting callers', async () => {
  const cache = new TuyaReadCache();
  let finishOld;
  const old = cache.read(
    'project:state:a',
    1000,
    () =>
      new Promise((resolve) => {
        finishOld = resolve;
      }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  cache.invalidate('project:state:');
  assert.equal(await cache.read('project:state:a', 1000, async () => false), false);
  finishOld(true);
  assert.equal(await old, false);
  assert.equal(await cache.read('project:state:a', 1000, async () => true), false);
});
