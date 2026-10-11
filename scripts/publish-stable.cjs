const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** The target owns the release channel. A numeric package version by itself
 * cannot authorize promoting a coordinated preview into Marketplace stable. */
function publishStable(root = path.resolve(__dirname, '..'), { run = spawnSync } = {}) {
  const target = JSON.parse(fs.readFileSync(path.join(root, '.release/target.json'), 'utf8'));
  assert.equal(target.channel, 'stable', 'DrawMotive previews are distributed only through GitHub Releases');
  const requireComponent = createRequire(path.join(root, 'package.json'));
  const { checkComponent } = requireComponent('./.release/check.cjs');
  assert.deepEqual(checkComponent(root, { ready: true, installed: true }), []);
  const result = run(process.execPath, [requireComponent.resolve('@vscode/vsce/vsce'), 'publish', '--no-dependencies'], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

module.exports = { publishStable };
if (require.main === module) {
  try { process.exitCode = publishStable(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
