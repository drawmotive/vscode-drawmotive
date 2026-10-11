const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { candidatePackage, testCandidate } = require('../scripts/test-browser-candidate.cjs');

test('candidate selection requires an explicit absolute package directory or retained archive', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'editor-candidate-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await assert.rejects(candidatePackage(undefined, root), /absolute/);
    await assert.rejects(candidatePackage('relative/package', root), /absolute/);
    const packageRoot = path.join(root, 'package');
    await mkdir(packageRoot);
    await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({ name: '@drawmotive/editor' }));
    assert.equal(await candidatePackage(packageRoot, root), packageRoot);
    const archive = path.join(root, 'candidate.tgz');
    await promisify(execFile)('tar', ['-czf', archive, '-C', root, 'package']);
    const extracted = path.join(root, 'extracted');
    await mkdir(extracted);
    const selected = await candidatePackage(archive, extracted);
    assert.deepEqual(JSON.parse(await readFile(path.join(selected, 'package.json'), 'utf8')), { name: '@drawmotive/editor' });
});

test('protocol-v1 candidate fails before invoking helpers and leaves registry and distributable inputs intact', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'editor-candidate-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'generated'));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@drawmotive/editor', version: '0.2.2-alpha.7', exports: { '.': { default: './src/index.js' } } }));
    await writeFile(path.join(root, 'generated/editor-manifest.json'), JSON.stringify({ protocolVersion: 1, packageName: '@drawmotive/editor', packageVersion: '0.2.2-alpha.7' }));
    const before = await Promise.all(['package.json', 'package-lock.json'].map(file => readFile(file, 'utf8')));
    await assert.rejects(testCandidate(root), /protocol-v2/);
    const after = await Promise.all(['package.json', 'package-lock.json'].map(file => readFile(file, 'utf8')));
    assert.deepEqual(after, before);
    // No helper files are present: rejection must precede helper import/staging.
});

test('candidate package rejects browser exports outside the explicitly selected root', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'editor-candidate-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: '@drawmotive/editor', exports: { '.': { default: './../outside.js' } } }));
    await assert.rejects(testCandidate(root), /within its package/);
});
