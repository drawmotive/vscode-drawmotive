import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseChannel } from '../.release/release-version.cjs';

/** CI checks downloaded preview evidence only. It cannot publish a Marketplace
 * version and does not rebuild the archive after real host verification. */
export async function verifyRetained(directory, { root = path.resolve(import.meta.dirname, '..'), releaseTag = process.env.RELEASE_TAG, archive = process.env.ARCHIVE } = {}) {
  assert.ok(directory && path.isAbsolute(directory), 'Select an absolute retained release directory');
  const evidence = JSON.parse(await readFile(path.join(directory, 'receipt.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const target = JSON.parse(await readFile(path.join(root, '.release/target.json'), 'utf8'));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(evidence.commit, commit);
  assert.equal(pkg.name, 'vscode-drawmotive');
  assert.equal(target.name, pkg.name);
  assert.ok([1, 2].includes(target.schemaVersion), 'Unknown release target schema');
  const legacy = target.schemaVersion === 1;
  assert.equal(target.channel, 'alpha');
  assert.equal(releaseChannel(target.releaseVersion, { legacy, channel: target.channel }), target.channel);
  if (!legacy) assert.equal(target.version, target.releaseVersion, 'Numeric products share one release identity');
  assert.equal(releaseTag, 'v' + (legacy ? target.releaseVersion.replace('-alpha.', '-pre.') : target.releaseVersion));
  assert.equal(evidence.receipt.name, pkg.name);
  assert.equal(evidence.receipt.publisher, pkg.publisher);
  assert.equal(evidence.receipt.version, pkg.version);
  assert.equal(evidence.receipt.version, target.version);
  assert.equal(evidence.receipt.preRelease, true);
  assert.equal(evidence.host.sha256, evidence.receipt.sha256);
  assert.equal(evidence.host.passed, true);
  assert.match(evidence.receipt.filename, /^[A-Za-z0-9_.-]+[.]vsix$/);
  assert.equal(archive, evidence.receipt.filename);
  const sha256 = createHash('sha256').update(await readFile(path.join(directory, archive))).digest('hex');
  assert.equal(sha256, evidence.receipt.sha256, 'Downloaded preview differs from the tested VSIX');
  const result = { status: 'verified', destination: 'github', releaseTag, commit, sha256 };
  await writeFile(path.join(directory, 'verification.json'), JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory, ...extra] = process.argv.slice(2);
  assert.equal(extra.length, 0, 'Unexpected retained verification arguments');
  verifyRetained(directory).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
