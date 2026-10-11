const { mkdtemp, readFile, readdir, realpath, rm, lstat } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { stageEditor, editorEntry } = require('./stage-editor.cjs');

async function run(command, args, options = {}) {
    await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
    });
}

async function regularTree(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await regularTree(file);
        else if (!entry.isFile() || (await lstat(file)).nlink !== 1) throw new Error('Candidate archive must contain only regular files and directories.');
    }
}

/** A local candidate is explicitly supplied, verified by its protocol-v2 SDK
 * copier, and tested from temporary assets. Registry locks, installed packages
 * and the normal distributable directory remain independent release inputs. */
async function candidatePackage(input, extracted) {
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new Error('Usage: npm run test:browser:candidate -- <absolute Editor package directory or .tgz>');
    const candidate = await realpath(input);
    const info = await lstat(candidate);
    if (info.isDirectory()) return candidate;
    if (!info.isFile() || !candidate.endsWith('.tgz')) throw new Error('Candidate must be an Editor package directory or retained .tgz.');
    // tar rejects absolute/traversal members by default. Extract in a private
    // temporary directory, then reject links before executing package helpers.
    await run('tar', ['-xzf', candidate, '-C', extracted, '--no-same-owner', '--no-same-permissions']);
    await regularTree(extracted);
    return path.join(extracted, 'package');
}

async function testCandidate(input) {
    const temporary = await mkdtemp(path.join(tmpdir(), 'drawmotive-vscode-candidate-'));
    try {
        const root = path.resolve(__dirname, '..');
        const packageRoot = await candidatePackage(input, temporary);
        const { entry, manifest: pkg } = await editorEntry(packageRoot);
        const native = JSON.parse(await readFile(path.join(packageRoot, 'generated/editor-manifest.json'), 'utf8'));
        if (native.protocolVersion !== 2 || native.packageName !== pkg.name || native.packageVersion !== pkg.version) throw new Error('Candidate requires a matching protocol-v2 Editor manifest.');
        const { verifyAssets } = await import(pathToFileURL(path.join(packageRoot, 'scripts/verify-assets.mjs')).href);
        await verifyAssets(packageRoot);
        const destination = path.join(temporary, 'staged');
        await stageEditor({ root, packageRoot, entry, destination });
        console.log(`Testing explicit Editor candidate ${pkg.version}; registry dependency remains ${require('../package.json').dependencies['@drawmotive/editor']}.`);
        await run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc')], { cwd: root });
        const tests = (await readdir(path.join(root, 'test'))).filter(file => file.endsWith('.browser.cjs')).map(file => path.join(root, 'test', file));
        await run(process.execPath, ['--test', '--test-concurrency=1', ...tests], { cwd: root, env: { ...process.env, DRAWMOTIVE_EDITOR_TEST_ASSETS: destination } });
    } finally { await rm(temporary, { recursive: true, force: true }); }
}

module.exports = { candidatePackage, testCandidate };
if (require.main === module) {
    if (process.argv.length !== 3) { console.error('Usage: npm run test:browser:candidate -- <absolute Editor package directory or .tgz>'); process.exitCode = 1; }
    else testCandidate(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
