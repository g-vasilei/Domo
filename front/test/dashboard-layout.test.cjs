const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { setImmediate } = require('node:timers');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, modules) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? require(name) });
  return exports;
}

function layoutFixture(props = {}) {
  let dragEnd;
  let reordered;
  const { default: Layout } = load('components/DashboardLayout.tsx', {
    '@dnd-kit/core': {
      DndContext: ({ children, onDragEnd }) => {
        dragEnd = onDragEnd;
        return children;
      },
      useSensor: () => ({}),
      useSensors: () => [],
    },
    '@dnd-kit/sortable': {
      arrayMove: require('@dnd-kit/sortable').arrayMove,
      SortableContext: ({ children }) => children,
      useSortable: () => ({ attributes: {}, listeners: {}, transform: null }),
    },
  });
  const markup = renderToStaticMarkup(
    React.createElement(Layout, {
      items: ['alarm', 'weather', 'temperature'].map((id) => ({
        id,
        label: id,
        content: React.createElement('span', {}, id),
      })),
      order: ['weather', 'temperature', 'alarm'],
      onReorder: (ids) => {
        reordered = ids;
      },
      editing: true,
      disabled: false,
      className: 'grid',
      ...props,
    }),
  );
  return {
    markup,
    drop: (active, over) => dragEnd({ active: { id: active }, over: over ? { id: over } : null }),
    result: () => reordered,
  };
}

test('saved order renders and a drop moves only the chosen card', () => {
  const f = layoutFixture();
  assert.ok(f.markup.indexOf('>weather</span>') < f.markup.indexOf('>alarm</span>'));
  f.drop('alarm', 'weather');
  assert.deepEqual(Array.from(f.result()), ['alarm', 'weather', 'temperature']);
});

test('dragging is disabled outside customization and while a save is pending', () => {
  for (const props of [{ editing: false }, { disabled: true }]) {
    const f = layoutFixture(props);
    f.drop('alarm', 'weather');
    assert.equal(f.result(), undefined);
    if (props.editing === false) assert.ok(!f.markup.includes('Μετακίνηση:'));
  }
});

test('layout save updates immediately, persists only its field and restores order on failure', async () => {
  let reject;
  let request;
  const auth = { getState: () => ({ accessToken: 'account-a' }), subscribe: () => {} };
  const { usePrefsStore } = load('store/prefs.store.ts', {
    '../lib/api': {
      api: {
        patch: (url, patch) => {
          request = { url, patch };
          return new Promise((_resolve, rejectRequest) => {
            reject = rejectRequest;
          });
        },
      },
    },
    '../lib/greekCities': { DEFAULT_WEATHER_CITY: 'veria' },
    './auth.store': { useAuthStore: auth },
  });
  const oldOrder = usePrefsStore.getState().dashboardCardOrder;
  const nextOrder = ['weather', 'alarm', 'temperature'];
  usePrefsStore.getState().setDashboardCardOrder(nextOrder);
  assert.deepEqual(usePrefsStore.getState().dashboardCardOrder, nextOrder);
  assert.equal(usePrefsStore.getState().saving, true);
  assert.deepEqual(JSON.parse(JSON.stringify(request)), {
    url: '/users/me/preferences',
    patch: { dashboardCardOrder: nextOrder },
  });
  reject(new Error('offline'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(usePrefsStore.getState().dashboardCardOrder, oldOrder);
  assert.equal(usePrefsStore.getState().saving, false);
  assert.ok(usePrefsStore.getState().saveError);
});

test('hidden cards are absent in both modes and return in their saved position when shown', () => {
  for (const editing of [true, false]) {
    const hidden = layoutFixture({ editing, hiddenIds: ['weather'] });
    assert.ok(!hidden.markup.includes('>weather</span>'));
    assert.ok(
      hidden.markup.indexOf('>temperature</span>') < hidden.markup.indexOf('>alarm</span>'),
    );
    const shown = layoutFixture({ editing, hiddenIds: [] });
    assert.ok(
      shown.markup.indexOf('>weather</span>') < shown.markup.indexOf('>temperature</span>'),
    );
  }
});

test('reordering visible cards preserves hidden IDs and completely hidden groups render no gaps', () => {
  const f = layoutFixture({ hiddenIds: ['temperature'] });
  f.drop('alarm', 'weather');
  assert.deepEqual(Array.from(f.result()), ['alarm', 'weather', 'temperature']);
  assert.equal(layoutFixture({ hiddenIds: ['alarm', 'weather', 'temperature'] }).markup, '');
});

test('visibility changes persist independently of order and roll back after a failed save', async () => {
  let reject;
  let patch;
  const { usePrefsStore } = load('store/prefs.store.ts', {
    '../lib/api': {
      api: {
        patch: (_url, input) => {
          patch = input;
          return new Promise((_resolve, rejectRequest) => {
            reject = rejectRequest;
          });
        },
      },
    },
    '../lib/greekCities': { DEFAULT_WEATHER_CITY: 'veria' },
    './auth.store': {
      useAuthStore: { getState: () => ({ accessToken: 'account' }), subscribe: () => {} },
    },
  });
  const originalOrder = usePrefsStore.getState().dashboardSectionOrder;
  usePrefsStore.getState().setDashboardHiddenSections(['stats']);
  assert.deepEqual(Array.from(usePrefsStore.getState().dashboardHiddenSections), ['stats']);
  assert.deepEqual(JSON.parse(JSON.stringify(patch)), { dashboardHiddenSections: ['stats'] });
  assert.equal(usePrefsStore.getState().dashboardSectionOrder, originalOrder);
  reject(new Error('offline'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(usePrefsStore.getState().dashboardHiddenSections.length, 0);
  assert.equal(usePrefsStore.getState().dashboardSectionOrder, originalOrder);
});
