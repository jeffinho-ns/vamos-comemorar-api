const { runAll, formatReport } = require('../tests/simulation/solCloseSimulator');

const results = runAll();
console.log(formatReport(results));
console.log('');
const failed = results.filter((row) => !row.ok);
process.exit(failed.length ? 1 : 0);
