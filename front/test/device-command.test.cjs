const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { QueryClient, QueryObserver } = require('@tanstack/react-query');

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
const power = load('lib/devicePower.ts');

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
        let data, failure;
        try {
          data = await invocation.mutationFn(variables);
          mutation.isSuccess = true;
        } catch (error) {
          failure = error;
          mutation.isError = true;
          mutation.error = error;
        } finally {
          await invocation.onSettled(data, failure, variables);
          mutation.isPending = false;
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

test('pending and accepted commands preserve reported state and suppress repeated clicks', async () => {
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
    assert.equal(item.status.find((s) => s.code === 'switch').value, false);
    assert.equal(item.status.find((s) => s.code === 'battery').value, 50);
  }
  for (const key of [['device', 'a'], ['devices'], ['rooms']]) {
    assert.equal(f.client.getQueryState(key).isInvalidated, true);
  }
});

test('accepted commands re-read active views and show the reported value instead of the request', async () => {
  const f = fixture();
  const keys = [['device', 'a'], ['devices'], ['rooms'], ['device-status', 'a']];
  const reads = [];
  const subscriptions = keys.map((queryKey) => {
    const observer = new QueryObserver(f.client, {
      queryKey,
      staleTime: Infinity,
      queryFn: async () => {
        reads.push(queryKey);
        if (queryKey[0] === 'device-status') return f.original.status;
        return f.client.getQueryData(queryKey);
      },
    });
    return observer.subscribe(() => {});
  });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    reads.length = 0;
    f.view().sendCommand(on);
    f.resolve();
    await f.done();
    assert.deepEqual(new Set(reads.map(JSON.stringify)), new Set(keys.map(JSON.stringify)));
    assert.equal(f.client.getQueryData(['device', 'a']).status[0].value, false);
    assert.equal(f.view().feedback.kind, 'success');
  } finally {
    subscriptions.forEach((unsubscribe) => unsubscribe());
    f.client.clear();
  }
});

test('an ambiguous command failure still picks up a change reported by the device', async () => {
  const f = fixture();
  const reported = { ...f.original, status: on };
  let reads = 0;
  const observer = new QueryObserver(f.client, {
    queryKey: ['device', 'a'],
    staleTime: Infinity,
    queryFn: async () => {
      reads++;
      return reported;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    f.view().sendCommand(on);
    f.reject(Error('timeout'));
    await f.done();
    assert.equal(reads, 1);
    assert.equal(f.client.getQueryData(['device', 'a']).status[0].value, true);
    assert.equal(f.view().feedback.kind, 'error');
  } finally {
    unsubscribe();
    f.client.clear();
  }
});

test('a poll started before a command cannot overwrite the newer device report', async () => {
  const f = fixture();
  const reported = { ...f.original, status: on };
  let finishPoll, pollSignal;
  let reads = 0;
  const observer = new QueryObserver(f.client, {
    queryKey: ['device', 'a'],
    staleTime: Infinity,
    queryFn: ({ signal }) => {
      if (++reads === 1) {
        pollSignal = signal;
        return new Promise((resolve) => {
          finishPoll = resolve;
        });
      }
      return reported;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    const polling = f.client.refetchQueries({ queryKey: ['device', 'a'] });
    f.view().sendCommand(on);
    f.resolve();
    await f.done();
    assert.equal(pollSignal.aborted, true);
    finishPoll(f.original);
    await polling;
    assert.equal(f.client.getQueryData(['device', 'a']).status[0].value, true);
  } finally {
    unsubscribe();
    f.client.clear();
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
  assert.equal(f.client.getQueryState(['device', 'a']).isInvalidated, true);
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

test('refreshing never manufactures device data or missing caches', async () => {
  const client = new QueryClient();
  await commands.refreshDeviceCaches(client, 'missing');
  assert.equal(client.getQueryData(['device', 'missing']), undefined);
  assert.equal(client.getQueryData(['devices']), undefined);
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

function renderCard({ canControl = false, device = {} } = {}) {
  const timers = { timers: [], start: () => {}, cancel: () => {} };
  const Component = load('components/DeviceCard.tsx', {
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    'react-router-dom': { useNavigate: () => () => {} },
    '../hooks/useDeviceCommand': {
      useDeviceCommand: () => ({ sendCommand: () => {}, isPending: false, feedback: null }),
    },
    '../hooks/useDevicePermissions': { useDevicePermissions: () => ({ canControl }) },
    '../lib/devicePower': power,
    '../lib/deviceCommands': commands,
    '../store/timer.store': { useTimerStore: (selector) => (selector ? selector(timers) : timers) },
    '../store/prefs.store': {
      usePrefsStore: (selector) => selector({ tempUnit: 'C' }),
      convertTemp: (value) => value,
    },
    './PowerSwitch': load('components/PowerSwitch.tsx'),
    './CommandFeedback': { default: () => null },
    './TimerModal': { default: () => null },
  }).default;
  return renderToStaticMarkup(
    React.createElement(Component, {
      device: {
        id: 'a',
        online: true,
        category: 'cz',
        status: [{ code: 'switch', value: false }],
        ...device,
      },
    }),
  );
}

test('read-only device cards show power state without power or timer actions', () => {
  const html = renderCard();
  assert.ok(html.includes('Μόνο προβολή'));
  assert.ok(html.includes('Σβηστή'));
  assert.ok(!html.includes('aria-label="Άναμμα"'));
  assert.ok(!html.includes('Ορισμός αυτόματου σβησίματος'));
});

test('connectivity and power have separate visible labels', () => {
  const off = renderCard({ canControl: true });
  assert.ok(off.includes('Σε σύνδεση'));
  assert.ok(off.includes('Σβηστή'));
  assert.ok(off.includes('role="switch"'));
  assert.ok(off.includes('aria-checked="false"'));
  assert.ok(off.includes('OFF</button>'));
  assert.ok(!off.includes('ON</button>'));
  const on = renderCard({ device: { status: [{ code: 'switch', value: true }] } });
  assert.ok(on.includes('Αναμμένη'));
  assert.ok(on.includes('Σε σύνδεση'));
  const offline = renderCard({ device: { online: false } });
  assert.ok(offline.includes('Εκτός σύνδεσης'));
  assert.ok(offline.includes('Τελευταία ένδειξη: '));
});

test('fourteen online devices with false power values all render OFF', () => {
  for (let i = 0; i < 14; i++) {
    const html = renderCard({
      canControl: true,
      device: {
        id: `device-${i}`,
        name: `Συσκευή ${i}`,
        online: true,
        status: [
          { code: 'switch_1', value: false },
          { code: 'switch_backlight', value: true },
        ],
        statusUpdatedAt: 100000,
      },
    });
    assert.ok(html.includes('aria-checked="false"'));
    assert.ok(!html.includes('aria-checked="true"'));
    assert.ok(html.includes('OFF</button>'));
    assert.ok(html.includes('Σβηστή'));
    assert.ok(html.includes('Τελευταία ενημέρωση:'));
  }
});

test('missing power state stays unknown rather than defaulting to ON or OFF', () => {
  const html = renderCard({ canControl: true, device: { status: [] } });
  assert.ok(html.includes('Άγνωστη κατάσταση'));
  assert.ok(!html.includes('role="switch"'));
  assert.ok(!html.includes('Αναμμένη'));
  assert.ok(!html.includes('Σβηστή'));
});

test('manual refresh forces a server read without turning automatic polling into forced reads', async () => {
  const client = new QueryClient();
  const stale = { id: 'a', status: [{ code: 'switch', value: true }] };
  const fresh = { id: 'a', status: [{ code: 'switch', value: false }], statusUpdatedAt: 100000 };
  client.setQueryData(['devices'], [stale]);
  let normalReads = 0,
    config;
  const requests = [];
  const observer = new QueryObserver(client, {
    queryKey: ['devices'],
    staleTime: Infinity,
    queryFn: async () => {
      normalReads++;
      return [fresh];
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const hook = load('hooks/useDeviceRefresh.ts', {
    '@tanstack/react-query': {
      useQueryClient: () => client,
      useMutation: (options) => {
        config = options;
        return {};
      },
    },
    '../lib/api': {
      api: {
        get: async (...args) => {
          requests.push(args);
          return { data: [fresh] };
        },
      },
    },
  }).useDeviceRefresh;
  try {
    hook(['devices'], '/devices');
    await config.onMutate();
    config.onSuccess(await config.mutationFn());
    assert.equal(requests[0][1].params.refresh, true);
    assert.equal(client.getQueryData(['devices'])[0].status[0].value, false);
    await client.refetchQueries({ queryKey: ['devices'] });
    assert.equal(normalReads, 1);
    assert.equal(requests.length, 1);
  } finally {
    unsubscribe();
    client.clear();
  }
});

test('auxiliary switches never become the device power or a timer target', () => {
  const status = [
    { code: 'switch_backlight', value: true },
    { code: 'switch_inching', value: true },
    { code: 'child_lock_switch', value: true },
  ];
  const html = renderCard({ canControl: true, device: { status } });
  assert.ok(!html.includes('Αναμμένη'));
  assert.ok(!html.includes('aria-label="Σβήσιμο"'));
  assert.ok(!html.includes('Ορισμός αυτόματου σβησίματος'));
  assert.equal(power.powerSwitchCodes({ status }).length, 0);
  assert.deepEqual(
    Array.from(power.powerSwitchCodes({ status: [...status, { code: 'switch_1', value: false }] })),
    ['switch_1'],
  );
  assert.deepEqual(
    Array.from(
      power.powerSwitchCodes({
        category: 'kt',
        status: [
          { code: 'switch_vertical', value: true },
          { code: 'switch', value: false },
        ],
      }),
    ),
    ['switch'],
  );
});
