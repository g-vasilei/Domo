const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const deployScript = path.resolve(__dirname, '../../deploy.sh');

function runDeploy({ first = false, changed = '', failMigration = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domo-deploy-test-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const log = path.join(dir, 'commands.jsonl');
    fs.writeFileSync(
      path.join(bin, 'git'),
      `#!${process.execPath}\nconst args=process.argv.slice(2); if(args[0]==='rev-parse') console.log('new-commit'); if(args[0]==='diff') console.log(process.env.DEPLOY_TEST_CHANGED);\n`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(bin, 'docker'),
      `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.DEPLOY_TEST_LOG,JSON.stringify(args)+'\\n');if(args.includes('migrate')&&process.env.DEPLOY_TEST_FAIL==='yes')process.exit(13);\n`,
      { mode: 0o755 },
    );
    const marker = path.join(dir, '.last-deploy-commit');
    if (!first) fs.writeFileSync(marker, 'old-commit\n');
    const result = spawnSync('bash', [deployScript], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        DEPLOY_TEST_LOG: log,
        DEPLOY_TEST_CHANGED: changed,
        DEPLOY_TEST_FAIL: failMigration ? 'yes' : 'no',
      },
    });
    assert.ifError(result.error);
    return {
      status: result.status,
      commands: fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line).join(' '))
        : [],
      marker: fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8').trim() : null,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const migrate = 'compose run --rm backend npx prisma migrate deploy';

test('first deployment builds, migrates, then starts services', () => {
  const result = runDeploy({ first: true });
  assert.equal(result.status, 0);
  assert.deepEqual(result.commands, ['compose build', migrate, 'compose up -d']);
  assert.equal(result.marker, 'new-commit');
});

test('backend updates always apply pending migrations before restart', () => {
  const result = runDeploy({ changed: 'back/src/devices/devices.service.ts' });
  assert.equal(result.status, 0);
  assert.deepEqual(result.commands, [
    'compose build backend',
    migrate,
    'compose up -d backend',
    'image prune -f',
  ]);
});

test('root changes do one full rebuild with migrations before startup', () => {
  const result = runDeploy({
    changed: 'package-lock.json\nback/prisma/migrations/new/migration.sql\nfront/src/App.tsx',
  });
  assert.equal(result.status, 0);
  assert.deepEqual(result.commands, ['compose build', migrate, 'compose up -d', 'image prune -f']);
});

test('frontend-only updates do not restart backend or run migrations', () => {
  const result = runDeploy({ changed: 'front/src/App.tsx' });
  assert.equal(result.status, 0);
  assert.deepEqual(result.commands, [
    'compose build frontend',
    'compose up -d frontend',
    'image prune -f',
  ]);
});

test('failed migration stops deploy and preserves previous deployment marker', () => {
  const result = runDeploy({
    changed: 'back/prisma/migrations/new/migration.sql',
    failMigration: true,
  });
  assert.equal(result.status, 13);
  assert.deepEqual(result.commands, ['compose build backend', migrate]);
  assert.equal(result.marker, 'old-commit');
});

test('failed migration on first deployment does not start backend or mark success', () => {
  const result = runDeploy({ first: true, failMigration: true });
  assert.equal(result.status, 13);
  assert.deepEqual(result.commands, ['compose build', migrate]);
  assert.equal(result.marker, null);
});
