const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { URLSearchParams } = require('node:url');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { StaticRouter } = require('react-router-dom/server');

function load(file, modules) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    URLSearchParams,
    require: (name) => modules[name] ?? require(name),
  });
  return exports;
}

function renderHistory(role, level = 'error') {
  const queries = [];
  const query = {
    useQuery: (options) => {
      queries.push(options);
      if (options.queryKey[0] === 'me')
        return { data: { role, permissions: { canArmAlarm: false } } };
      return {
        data: {
          items: [
            {
              id: 'event',
              context: 'device',
              level: 'error',
              message: 'Αποτυχία εντολής',
              createdAt: '2026-11-09T12:00:00Z',
              user: { email: 'user@example.test' },
              metadata: null,
            },
          ],
          hasMore: true,
        },
        refetch: () => {},
      };
    },
  };
  const { default: Activity } = load('pages/ActivityPage.tsx', {
    '@tanstack/react-query': query,
    '../lib/api': { api: {} },
  });
  const html = renderToStaticMarkup(
    React.createElement(
      StaticRouter,
      { location: `/activity?level=${level}` },
      React.createElement(Activity),
    ),
  );
  return { html, queries };
}

test('standalone history preserves the activity filters, entries and pagination for owners and members', () => {
  for (const role of ['OWNER', 'MEMBER']) {
    const { html, queries } = renderHistory(role);
    assert.match(html, />Ιστορικό ενεργειών<\/h1>/);
    assert.match(html, /Αποτυχία εντολής/);
    assert.match(html, /Κατηγορία/);
    assert.match(html, /Σελίδα 1/);
    const activity = queries.find((query) => query.queryKey[0] === 'activity');
    assert.equal(activity.queryKey[2], 'error');
    assert.ok(!queries.some((query) => query.queryKey[0] === 'logs'));
  }
});

test('history deep link restores its filter when loaded again', () => {
  for (let reload = 0; reload < 2; reload++) {
    const { queries } = renderHistory('OWNER', 'warn');
    assert.equal(queries.find((query) => query.queryKey[0] === 'activity').queryKey[2], 'warn');
  }
});
