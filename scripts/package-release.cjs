const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { releaseChannel } = require('../.release/release-version.cjs');

/** Standalone packages carry the same preview flag as retained release VSIXes.
 * The target owns that decision before vsce can build or package anything. */
function packageArguments(target) {
  assert.ok([1, 2].includes(target.schemaVersion), 'Unknown release target schema');
  const legacy = target.schemaVersion === 1;
  assert.equal(releaseChannel(target.releaseVersion, { legacy }), target.channel, 'Release channel/version mismatch');
  if (!legacy) assert.equal(target.version, target.releaseVersion, 'Numeric products share one release identity');
  return ['package', '--no-dependencies', ...(target.channel === 'alpha' ? ['--pre-release'] : [])];
}
function packageRelease(root = path.resolve(__dirname, '..'), { run = spawnSync } = {}) {
  const target = JSON.parse(fs.readFileSync(path.join(root, '.release/target.json'), 'utf8'));
  const args = packageArguments(target);
  const requireComponent = createRequire(path.join(root, 'package.json'));
  assert.deepEqual(requireComponent('./.release/check.cjs').checkComponent(root, { build: true }), []);
  const result = run(process.execPath, [requireComponent.resolve('@vscode/vsce/vsce'), ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
module.exports = { packageArguments, packageRelease };
if (require.main === module) {
  try { process.exitCode = packageRelease(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
