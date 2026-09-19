const { spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const mochaCli = path.join(projectRoot, 'node_modules', 'mocha', 'bin', '_mocha');
const result = spawnSync(
  process.execPath,
  [mochaCli, 'src/test/**/*.cjs', '--recursive', '--exit'],
  { cwd: projectRoot, env: { ...process.env, NODE_ENV: 'test' }, stdio: 'inherit' }
);

process.exit(result.status === null ? 1 : result.status);
