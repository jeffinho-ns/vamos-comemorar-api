const test = require('node:test');
const assert = require('node:assert/strict');
const { runAll, formatReport } = require('./solCloseSimulator');

test('simulação: Sol fecha reservas e honra as configs nos cenários combinados', () => {
  const results = runAll();
  const failed = results.filter((row) => !row.ok);
  if (failed.length) {
    console.error(formatReport(results));
  }
  assert.equal(
    failed.length,
    0,
    failed.map((row) => `${row.id}: ${row.failures.join('; ')}`).join('\n')
  );
});
