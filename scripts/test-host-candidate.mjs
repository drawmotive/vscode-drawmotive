import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';

const require = createRequire(import.meta.url);
const { candidatePackage } = require('./test-browser-candidate.cjs');
const { stageEditor, editorEntry } = require('./stage-editor.cjs');
const root = path.resolve(import.meta.dirname, '..');
const version = process.env.VSCODE_VERSION || '1.101.0';

/** Install an explicitly selected candidate as a real VSIX. The driver lives
 * in a separate development extension, so package URLs, CSP and activation
 * are exercised by VS Code itself. Normal dist and registry locks are untouched. */
async function main(input, retained = false) {
    assert.ok(input && path.isAbsolute(input), 'Select an absolute Editor package or retained VSIX path');
    const artifacts = await mkdtemp(path.join(os.tmpdir(), 'drawmotive-vscode-host-'));
    console.log('VS Code host artifacts: ' + artifacts);
    let vsix, sdk, native, identity;
    if (retained) {
        // Release testing installs these exact bytes and never rebuilds them.
        identity = await require('../.release/vsix.cjs').verifyVsix(input, root);
        vsix = path.join(artifacts, 'candidate.vsix');
        await cp(input, vsix);
        assert.deepEqual(await readFile(vsix), await readFile(input));
        ({ manifest: sdk } = await editorEntry(path.join(root, 'node_modules/@drawmotive/editor')));
        native = { privateSource: { commit: JSON.parse(await readFile(path.join(root, 'node_modules/@drawmotive/editor/generated/editor-manifest.json'), 'utf8')).privateSource.commit } };
    } else {
        const extracted = path.join(artifacts, 'extracted');
        await mkdir(extracted);
        const packageRoot = await candidatePackage(input, extracted);
        const selected = await editorEntry(packageRoot);
        const { entry } = selected; sdk = selected.manifest;
        const { verifyAssets } = await import(pathToFileURL(path.join(packageRoot, 'scripts/verify-assets.mjs')).href);
        native = await verifyAssets(packageRoot);
        const product = path.join(artifacts, 'product');
        const dist = path.join(product, 'dist');
        await stageEditor({ root, packageRoot, entry, destination: dist });
        // Bundle the actual production entry; only its output directory changes.
        await command(process.execPath, [path.join(root, 'node_modules/webpack-cli/bin/cli.js'), '--mode', 'production', '--output-path', dist], { cwd: root });
        const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
        // VSIX is self-contained. Omit build hooks so vsce cannot restage alpha.6.
        delete manifest.scripts;
        delete manifest.devDependencies;
        delete manifest.dependencies;
        await writeFile(path.join(product, 'package.json'), JSON.stringify(manifest, null, 2));
        for (const file of ['README.md', 'LICENSE', 'icon.png']) await cp(path.join(root, file), path.join(product, file));
        vsix = path.join(artifacts, 'candidate.vsix');
        await command(process.execPath, [path.join(root, 'node_modules/@vscode/vsce/vsce'), 'package', '--no-dependencies', '--out', vsix], { cwd: product });
    }
    const executable = await downloadAndUnzipVSCode(version);
    const userData = path.join(artifacts, 'user-data');
    const extensions = path.join(artifacts, 'extensions');
    const workspace = path.join(artifacts, 'workspace');
    const runtime = path.join(artifacts, 'runtime');
    await mkdir(path.join(userData, 'User'), { recursive: true });
    await mkdir(extensions);
    await mkdir(workspace);
    await mkdir(runtime, { mode: 0o700 });
    await writeFile(path.join(userData, 'User/settings.json'), JSON.stringify({
        'workbench.startupEditor': 'none', 'workbench.tips.enabled': false,
        'window.restoreWindows': 'none', 'window.dialogStyle': 'custom',
        'files.simpleDialog.enable': true,
        'extensions.autoUpdate': false, 'extensions.autoCheckUpdates': false,
        'telemetry.telemetryLevel': 'off', 'update.mode': 'none',
        'git.enabled': false, 'security.workspace.trust.enabled': false,
    }));
    await writeFile(path.join(artifacts, 'candidate.json'), JSON.stringify({ vscode: version, sdk: sdk.version, nativeSource: native.privateSource.commit, identity, vsix, sha256: createHash('sha256').update(await readFile(vsix)).digest('hex') }, null, 2));
    const environment = { ...process.env, XDG_RUNTIME_DIR: runtime, DONT_PROMPT_WSL_INSTALL: '1' };
    const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executable, { reuseMachineInstall: true });
    await command(cli, [...cliArgs, '--no-sandbox', '--user-data-dir', userData, '--extensions-dir', extensions, '--install-extension', vsix, '--force'], { env: environment });
    const port = await freePort();
    const launchArgs = [workspace, '--user-data-dir', userData, '--extensions-dir', extensions,
        '--extensionDevelopmentPath=' + path.join(root, 'test/host'),
        '--no-sandbox', '--disable-gpu', '--disable-gpu-sandbox', '--disable-workspace-trust',
        '--skip-welcome', '--skip-release-notes', '--disable-updates', '--use-inmemory-secretstorage',
        '--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'];
    const headlessLinux = process.platform === 'linux' && !process.env.DISPLAY;
    await command(headlessLinux ? 'xvfb-run' : executable, headlessLinux ? ['-a', executable, ...launchArgs] : launchArgs, {
        env: { ...environment, DRAWMOTIVE_HOST_WORKSPACE: workspace,
            DRAWMOTIVE_HOST_EXTENSIONS: extensions, DRAWMOTIVE_HOST_CDP: 'http://127.0.0.1:' + port,
            DRAWMOTIVE_HOST_ARTIFACTS: artifacts },
    });
    const result = JSON.parse(await readFile(path.join(artifacts, 'result.json'), 'utf8'));
    assert.ok(!result.error, result.error);
    assert.equal(result.checks.length, 6, 'Driver must complete every host check');
    console.log('Real VS Code host checks passed. Evidence: ' + artifacts);
}

async function freePort() {
    const server = createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
}

/** Each launch owns a process group; failures and interrupts terminate every
 * child so a timed-out test cannot leave an invisible Extension Host running. */
async function command(executable, args, options = {}) {
    await new Promise((resolve, reject) => {
        const child = spawn(executable, args, { stdio: 'inherit', detached: process.platform !== 'win32', ...options });
        let stopping = false;
        const stop = reason => {
            if (stopping) return;
            stopping = true;
            if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F']);
            else { try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') reject(error); } }
            reject(new Error(reason));
        };
        const interrupt = () => stop('VS Code host test interrupted');
        const timer = setTimeout(() => stop('VS Code operation exceeded five minutes'), 300000);
        process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
        const cleanup = () => { clearTimeout(timer); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); };
        child.once('error', error => { cleanup(); reject(error); });
        child.once('exit', code => { cleanup(); if (!stopping) code === 0 ? resolve() : reject(new Error(executable + ' exited ' + code)); });
    });
}

const args = process.argv.slice(2);
main(args.at(-1), args[0] === '--vsix').catch(error => { console.error(error); process.exitCode = 1; });
