import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { publishVsix } from '../.release/release-marketplace.mjs';
import { runCommand } from '../.release/process.mjs';

// Publication owns only the retained archive. The receipt binds it to the
// checked source commit, identity and channel without rebuilding the extension.
const [directory, ...extra] = process.argv.slice(2);
assert.ok(directory && path.isAbsolute(directory) && !extra.length, 'Select an absolute retained release directory');
const evidence = JSON.parse(await readFile(path.join(directory, 'receipt.json'), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const commit = (await runCommand('git', ['rev-parse', 'HEAD'], { capture: true })).stdout.trim();
assert.equal(evidence.commit, commit);
assert.equal(evidence.receipt.name, pkg.name);
assert.equal(evidence.receipt.publisher, pkg.publisher);
assert.equal(evidence.receipt.version, pkg.version);
assert.equal(evidence.receipt.preRelease, true);
assert.equal(evidence.host.sha256, evidence.receipt.sha256);
assert.equal(evidence.host.passed, true);
const result = await publishVsix(evidence.receipt, directory, { run: runCommand, cli: path.resolve('node_modules/@vscode/vsce/vsce') });
await writeFile(path.join(directory, 'publication.json'), JSON.stringify({ ...result, verifiedAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify(result));
