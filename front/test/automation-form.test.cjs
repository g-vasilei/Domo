const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function render(actions, error = false) {
  const queries = [];
  const js = ts.transpileModule(
    fs.readFileSync(path.join(__dirname, '../src/components/RuleModal.tsx'), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    },
  ).outputText;
  const exports = {};
  const modules = {
    '@tanstack/react-query': {
      useQueryClient: () => ({}),
      useMutation: () => ({ isError: error }),
      useQuery: (options) => {
        queries.push(options);
        return {
          data:
            options.queryKey[0] === 'devices'
              ? [{ id: 'a', name: 'Switch' }]
              : [
                  { code: 'switch_1', value: false },
                  { code: 'battery', value: 80 },
                ],
        };
      },
    },
    '../lib/api': { api: {} },
    './TimePicker': { default: () => null },
  };
  vm.runInNewContext(js, { exports, require: (name) => modules[name] ?? require(name) });
  const html = renderToStaticMarkup(
    React.createElement(exports.default, {
      rule: {
        id: 'rule',
        name: 'Rule',
        conditions: [{ type: 'time', timeValue: '12:00' }],
        actions,
      },
      onClose: () => {},
    }),
  );
  return { html, queries };
}

test('countdown editor loads status and offers boolean switches only', () => {
  const { html, queries } = render([
    { type: 'countdown', deviceId: 'a', statusCode: 'switch_1', minutes: 5 },
  ]);
  assert.match(html, /aria-label="Διακόπτης αντίστροφης μέτρησης"/);
  assert.match(html, /value="switch_1" selected=""/);
  assert.doesNotMatch(html, /value="battery"/);
  assert.ok(
    queries.some(
      (query) =>
        query.queryKey[0] === 'device-status' && query.queryKey[1] === 'a' && query.enabled,
    ),
  );
  assert.doesNotMatch(html, /disabled=""/);
});

test('incomplete countdowns cannot be saved and API failures are visible', () => {
  const { html } = render([{ type: 'countdown', deviceId: 'a', minutes: 5 }], true);
  assert.match(html, /disabled=""/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Η αποθήκευση απέτυχε/);
});
