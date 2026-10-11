const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdtemp, mkdir, writeFile, readFile, realpath, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { publishStable } = require('../scripts/publish-stable.cjs');

async function fixture(t) {
    const root = await mkdtemp(path.join(tmpdir(), 'vscode-release-policy-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const directory = path.join(root, 'retained');
    await mkdir(directory); await mkdir(path.join(root, '.release'));
    const save = (file, value) => writeFile(path.join(root, file), JSON.stringify(value));
    const pkg = { name: 'vscode-drawmotive', publisher: 'drawmotive', version: '0.2.7' };
    const target = { name: pkg.name, version: pkg.version, releaseVersion: '0.2.2-alpha.8', channel: 'alpha' };
    const bytes = Buffer.from('exact tested preview');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const archive = pkg.name + '-' + pkg.version + '.vsix';
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Release Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'fixture'], { cwd: root });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const evidence = { commit, receipt: { ...pkg, filename: archive, preRelease: true, sha256 }, host: { passed: true, sha256 } };
    await save('package.json', pkg); await save('.release/target.json', target);
    await save('retained/receipt.json', evidence);
    await writeFile(path.join(directory, archive), bytes);
    return { root, directory, save, pkg, target, evidence, archive, commit, sha256 };
}

test('retained GitHub verification confirms tested bytes and commit without dependencies or publication', async t => {
    const f = await fixture(t);
    const { verifyRetained } = await import('../scripts/verify-retained.mjs');
    const result = await verifyRetained(f.directory, { root: f.root, releaseTag: 'v0.2.2-pre.8', archive: f.archive });
    assert.deepEqual(result, { status: 'verified', destination: 'github', releaseTag: 'v0.2.2-pre.8', commit: f.commit, sha256: f.sha256 });
    assert.deepEqual(JSON.parse(await readFile(path.join(f.directory, 'verification.json'))), result);
    assert.deepEqual(JSON.parse(await readFile(path.join(f.directory, 'receipt.json'))), f.evidence);
});

test('retained verification rejects wrong tag, archive, commit, host evidence, package identity and changed bytes', async t => {
    const f = await fixture(t);
    const { verifyRetained } = await import('../scripts/verify-retained.mjs');
    const options = { root: f.root, releaseTag: 'v0.2.2-pre.8', archive: f.archive };
    await assert.rejects(verifyRetained(f.directory, { ...options, releaseTag: 'v0.2.7' }));
    await assert.rejects(verifyRetained(f.directory, { ...options, archive: '../another.vsix' }));
    for (const mutate of [
        evidence => { evidence.commit = 'b'.repeat(40); },
        evidence => { evidence.host.passed = false; },
        evidence => { evidence.host.sha256 = 'b'.repeat(64); },
        evidence => { evidence.receipt.version = '0.2.8'; },
        evidence => { evidence.receipt.preRelease = false; },
    ]) {
        const changed = structuredClone(f.evidence); mutate(changed);
        await f.save('retained/receipt.json', changed);
        await assert.rejects(verifyRetained(f.directory, options));
    }
    await f.save('retained/receipt.json', f.evidence);
    await writeFile(path.join(f.directory, f.archive), 'changed bytes');
    await assert.rejects(verifyRetained(f.directory, options), /differs from the tested VSIX/);
});

test('Marketplace publication rejects a numeric preview before loading checks or invoking vsce', async t => {
    const f = await fixture(t);
    assert.throws(() => publishStable(f.root, { run: () => assert.fail('Must not execute a preview publisher') }), /only through GitHub/);
});

test('stable publication checks release inputs and calls only the stable vsce command', async t => {
    const f = await fixture(t);
    await f.save('.release/target.json', { ...f.target, channel: 'stable', releaseVersion: f.pkg.version });
    await writeFile(path.join(f.root, '.release/check.cjs'), "exports.checkComponent = (_root, options) => options.ready && options.installed ? [] : ['missing gate'];");
    const cli = path.join(f.root, 'node_modules/@vscode/vsce/vsce.js');
    await mkdir(path.dirname(cli), { recursive: true }); await writeFile(cli, '');
    const calls = [];
    assert.equal(publishStable(f.root, { run: (command, args, options) => { calls.push({ command, args, options }); return { status: 0 }; } }), 0);
    assert.deepEqual(calls, [{ command: process.execPath, args: [await realpath(cli), 'publish', '--no-dependencies'], options: { cwd: f.root, stdio: 'inherit' } }]);
    assert.equal(publishStable(f.root, { run: () => ({ status: 2 }) }), 2);
});
