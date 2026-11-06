const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stageEditor, editorEntry } = require('../scripts/stage-editor.cjs');

async function fixture(t) {
    // macOS /tmp and Windows short-name temporary paths can alias an ancestor.
    // Stage from the canonical fixture root, as production candidate resolution does.
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'editor-staging-')));
    t.after(() => rm(root, { recursive: true, force: true }));
    const save = async (file, bytes) => {
        const destination = path.join(root, file);
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
    };
    await save('package.json', JSON.stringify({ type: 'module' }));
    await save('package/package.json', JSON.stringify({ name: '@drawmotive/editor', exports: { '.': { default: './src/index.js' } } }));
    await save('package/src/index.js', "export { workerUrl, value } from './nested/core.js';");
    await save('package/src/nested/core.js', "export { value } from '../value.js'; export const workerUrl = new URL('../../dist/workers/resource.worker.js', import.meta.url);");
    await save('package/src/value.js', 'export const value = 42;');
    await save('package/dist/workers/resource.worker.js', 'postMessage(42);');
    await save('package/dist/workers/document.worker.js', 'postMessage("document");');
    await save('package/LICENSE', 'MIT');
    await save('package/licenses/notice.txt', 'Runtime notice');
    await save('package/scripts/copy-assets.mjs', "import { writeFile } from 'node:fs/promises'; export async function copyAssets(destination) { await writeFile(destination + '/runtime.wasm', 'native runtime'); }");
    await save('host/webview/editor.js', 'host entry');
    await save('host/webview/editor-session.mjs', 'host session');
    const packageRoot = path.join(root, 'package');
    const { entry } = await editorEntry(packageRoot);
    const options = { root: path.join(root, 'host'), packageRoot, entry, destination: path.join(root, 'staged') };
    return { root, save, options };
}

test('staged SDK resolves nested modules and package-relative workers without its source package', async t => {
    const f = await fixture(t);
    await stageEditor(f.options);
    await rm(f.options.packageRoot, { recursive: true });
    const staged = await import(pathToFileURL(path.join(f.options.destination, 'webview/sdk/src/index.js')).href);
    assert.equal(staged.value, 42);
    assert.equal(await readFile(staged.workerUrl, 'utf8'), 'postMessage(42);');
    assert.equal(await readFile(path.join(f.options.destination, 'webview/sdk/dist/workers/document.worker.js'), 'utf8'), 'postMessage("document");');
    assert.equal(await readFile(path.join(f.options.destination, 'editor/runtime.wasm'), 'utf8'), 'native runtime');
});

test('staging rejects SDK module and worker symlinks', async t => {
    for (const relative of ['src/value.js', 'dist/workers/resource.worker.js']) {
        const f = await fixture(t);
        const file = path.join(f.options.packageRoot, relative);
        await rm(file);
        await symlink(path.join(f.root, 'package.json'), file);
        await assert.rejects(stageEditor(f.options), /symbolic links|symlink/);
    }
});

test('staging requires the current SDK Worker tree', async t => {
    const f = await fixture(t);
    const workers = path.join(f.options.packageRoot, 'dist/workers');
    await rm(workers, { recursive: true });
    await assert.rejects(stageEditor(f.options), /Worker directory.*missing/);
});

test('staging requires both current SDK Worker bundles', async t => {
    for (const names of [['resource.worker.js'], ['document.worker.js'], ['resource.worker.js', 'document.worker.js']]) {
        const f = await fixture(t);
        for (const name of names) await rm(path.join(f.options.packageRoot, 'dist/workers', name));
        await assert.rejects(stageEditor(f.options), /required SDK Worker bundle/);
    }
});

test('staging rejects a dangling Worker directory link', async t => {
    const f = await fixture(t);
    const workers = path.join(f.options.packageRoot, 'dist/workers');
    await rm(workers, { recursive: true });
    await symlink(path.join(f.root, 'missing'), workers, 'dir');
    await assert.rejects(stageEditor(f.options), /symbolic links|symlink/);
});
