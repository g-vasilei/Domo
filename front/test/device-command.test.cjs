const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { QueryClient } = require('@tanstack/react-query');

function load(file, modules = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? require(name) });
  return exports;
}
const greek = load('lib/greek.ts');
const commands = load('lib/deviceCommands.ts', { './greek': greek });

function fixture() {
  const client = new QueryClient();
  const original = {
    id: 'a',
    name: 'A',
    status: [
      { code: 'switch', value: false },
      { code: 'battery', value: 50 },
    ],
  };
  client.setQueryData(['device', 'a'], original);
  client.setQueryData(['device', 'b'], { id: 'b', status: [] });
  client.setQueryData(['devices'], [original, { id: 'b', status: [] }]);
  client.setQueryData(['rooms'], [{ id: 'room', devices: [original] }]);
  const ref = { current: false };
  const requests = [];
  let resolveRequest, rejectRequest, options, completion;
  const mutation = {
    isPending: false,
    isError: false,
    isSuccess: false,
    variables: undefined,
    mutate(variables) {
      const invocation = options;
      Object.assign(mutation, { variables, isPending: true, isError: false, isSuccess: false });
      completion = (async () => {
        try {
          const data = await invocation.mutationFn(variables);
          await invocation.onSuccess(data, variables);
          mutation.isSuccess = true;
        } catch (error) {
          mutation.isError = true;
          mutation.error = error;
        } finally {
          mutation.isPending = false;
          invocation.onSettled();
        }
      })();
    },
  };
  const hook = load('hooks/useDeviceCommand.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (config) => {
        options = config;
        return mutation;
      },
    },
    react: { useRef: () => ref },
    '../lib/deviceCommands': commands,
    '../lib/api': {
      api: {
        post: (...args) => {
          requests.push(args);
          return new Promise((resolve, reject) => {
            resolveRequest = resolve;
            rejectRequest = reject;
          });
        },
      },
    },
  }).useDeviceCommand;
  return {
    client,
    original,
    requests,
    view: (id = 'a') => hook(id),
    resolve: (data = true) => resolveRequest({ data }),
    reject: (error) => rejectRequest(error),
    done: () => completion,
  };
}
const on = [{ code: 'switch', value: true }];

test('pending commands preserve confirmed state and suppress repeated clicks', async () => {
  const f = fixture();
  const view = f.view();
  view.sendCommand(on);
  view.sendCommand(on);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0][2].timeout, 15000);
  assert.equal(f.view().feedback.kind, 'pending');
  assert.equal(f.client.getQueryData(['device', 'a']).status[0].value, false);
  f.resolve();
  await f.done();
  assert.equal(f.view().feedback.kind, 'success');
  for (const item of [
    f.client.getQueryData(['device', 'a']),
    f.client.getQueryData(['devices'])[0],
    f.client.getQueryData(['rooms'])[0].devices[0],
  ]) {
    assert.equal(item.status.find((s) => s.code === 'switch').value, true);
    assert.equal(item.status.find((s) => s.code === 'battery').value, 50);
  }
});

test('permission failures keep confirmed state and allow an explicit retry', async () => {
  const f = fixture();
  f.view().sendCommand(on);
  f.reject({ response: { status: 403 } });
  await f.done();
  assert.equal(f.view().feedback.kind, 'error');
  assert.ok(f.view().feedback.message.includes('δικαίωμα'));
  assert.equal(f.client.getQueryData(['device', 'a']).status[0].value, false);
  f.view().sendCommand(on);
  assert.equal(f.requests.length, 2);
  assert.equal(f.view().feedback.kind, 'pending');
  f.resolve();
  await f.done();
});

test('network ambiguity and rejected commands never produce success or optimistic state', async () => {
  const f = fixture();
  f.view().sendCommand(on);
  f.reject(Error('timeout'));
  await f.done();
  assert.ok(f.view().feedback.message.includes('Δεν επιβεβαιώθηκε'));
  f.view().sendCommand(on);
  f.resolve(false);
  await f.done();
  assert.equal(f.view().feedback.kind, 'error');
  assert.ok(f.view().feedback.message.includes('δεν αποδέχτηκε'));
  assert.equal(f.client.getQueryData(['device', 'a']).status[0].value, false);
});

test('navigating during a request cannot apply the result or feedback to a different device', async () => {
  const f = fixture();
  f.view('a').sendCommand(on);
  assert.equal(f.view('b').feedback, null);
  f.resolve();
  await f.done();
  assert.equal(f.client.getQueryData(['device', 'b']).status.length, 0);
  assert.equal(f.view('b').feedback, null);
  assert.equal(f.view('a').feedback.kind, 'success');
});

test('websocket patching supports new status codes without creating missing device caches', () => {
  const client = new QueryClient();
  commands.updateDeviceCaches(client, 'missing', on);
  assert.equal(client.getQueryData(['device', 'missing']), undefined);
  assert.equal(client.getQueryData(['devices']), undefined);
  const patched = commands.patchDevice({ id: 'a' }, on);
  assert.equal(patched.status[0].value, true);
});

test('feedback exposes accessible sending, success and error messages', () => {
  const Component = load('components/CommandFeedback.tsx').default;
  for (const kind of ['pending', 'success', 'error']) {
    const html = renderToStaticMarkup(
      React.createElement(Component, { feedback: { kind, message: 'Feedback' } }),
    );
    assert.ok(html.includes(`role="${kind === 'error' ? 'alert' : 'status'}"`));
    assert.ok(html.includes('Feedback'));
  }
});

test('read-only device cards show no power or timer actions', () => {
  const timers = { timers: [], start: () => {}, cancel: () => {} };
  const Component = load('components/DeviceCard.tsx', {
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    'react-router-dom': { useNavigate: () => () => {} },
    '../hooks/useDeviceCommand': {
      useDeviceCommand: () => ({ sendCommand: () => {}, isPending: false, feedback: null }),
    },
    '../hooks/useDevicePermissions': { useDevicePermissions: () => ({ canControl: false }) },
    '../store/timer.store': { useTimerStore: (selector) => (selector ? selector(timers) : timers) },
    '../store/prefs.store': {
      usePrefsStore: (selector) => selector({ tempUnit: 'C' }),
      convertTemp: (value) => value,
    },
    './PowerSwitch': load('components/PowerSwitch.tsx'),
    './CommandFeedback': { default: () => null },
    './TimerModal': { default: () => null },
  }).default;
  const html = renderToStaticMarkup(
    React.createElement(Component, {
      device: { id: 'a', online: true, category: 'cz', status: [{ code: 'switch', value: false }] },
    }),
  );
  assert.ok(html.includes('Μόνο προβολή'));
  assert.ok(!html.includes('aria-label="Άναμμα"'));
  assert.ok(!html.includes('Ορισμός αυτόματου σβησίματος'));
});
