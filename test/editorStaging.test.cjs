const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath, cp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { stageEditor, editorEntry } = require('../scripts/stage-editor.cjs');
const { editorUiFiles } = require('../scripts/bundle-editor-ui.cjs');

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
    await save('host/package.json', '{}');
    await save('ui/package.json', JSON.stringify({ name: '@drawmotive/editor-ui', exports: { '.': { default: './dist/index.js' }, './styles.css': { default: './dist/index.css' } } }));
    await save('ui/dist/index.js', "import { value } from '@drawmotive/editor'; export function mountEditorUi() { return value; }");
    await save('ui/dist/index.css', '.dm-test { color: red; }');
    await save('ui/dist/MaterialSymbols-LICENSE.txt', 'Symbols license');
    await save('ui/dist/MaterialSymbols-NOTICE.txt', 'Symbols notice');
    await save('ui/LICENSE', 'UI copyright and permission');
    await save('ui/node_modules/@mantine/core/package.json', JSON.stringify({ name: '@mantine/core', exports: { './styles.css': './styles.css' } }));
    await save('ui/node_modules/@mantine/core/styles.css', '.mantine-test { color: blue; }');
    await save('ui/node_modules/@mantine/core/LICENSE', 'Mantine copyright and permission');
    const packageRoot = path.join(root, 'package');
    const { entry } = await editorEntry(packageRoot);
    const options = { root: path.join(root, 'host'), packageRoot, entry, uiPackageRoot: path.join(root, 'ui'), destination: path.join(root, 'staged') };
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
    const controls = await import(pathToFileURL(path.join(f.options.destination, 'webview/editor-ui.js')).href);
    assert.equal(controls.mountEditorUi(), 42, 'UI resolves the same staged SDK modules');
    assert.match(await readFile(path.join(f.options.destination, 'webview/editor-ui.css'), 'utf8'), /dm-test/);
    assert.equal(await readFile(path.join(f.options.destination, 'webview/MaterialSymbols-NOTICE.txt'), 'utf8'), 'Symbols notice');
    const notices = await readFile(path.join(f.options.destination, 'webview/editor-ui-NOTICES.txt'), 'utf8');
    assert.match(notices, /UI copyright and permission/);
    assert.match(notices, /Mantine copyright and permission/);
});

test('UI staging rejects missing attribution and exports outside the selected package', async t => {
    const f = await fixture(t);
    await rm(path.join(f.options.uiPackageRoot, 'dist/MaterialSymbols-NOTICE.txt'));
    await assert.rejects(editorUiFiles(f.options), /ENOENT/);
    await f.save('ui/package.json', JSON.stringify({ name: '@drawmotive/editor-ui', exports: { '.': '../outside.js' } }));
    await assert.rejects(editorUiFiles(f.options), /public/);
});

test('normal UI staging requires factual registry adoption rather than an ancestor workspace', async t => {
    const f = await fixture(t);
    await assert.rejects(editorUiFiles({ root: f.options.root }), /registry adoption is deferred/);
});

test('normal UI staging rejects an installed version different from its exact dependency', async t => {
    const f = await fixture(t);
    await f.save('host/package.json', JSON.stringify({ dependencies: { '@drawmotive/editor-ui': '0.3.3' } }));
    const installed = path.join(f.options.root, 'node_modules/@drawmotive/editor-ui');
    await cp(f.options.uiPackageRoot, installed, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
    await writeFile(path.join(installed, 'package.json'), JSON.stringify({ ...manifest, version: '0.3.2' }));
    await assert.rejects(editorUiFiles({ root: f.options.root }), /Install @drawmotive.editor-ui@0.3.3/);
    await f.save('host/package.json', JSON.stringify({ dependencies: { '@drawmotive/editor-ui': '0.3.2' } }));
    assert.ok((await editorUiFiles({ root: f.options.root })).has('editor-ui.js'));
});

test('normal UI staging rejects source workspace links even when versions match', async t => {
    const f = await fixture(t);
    await f.save('host/package.json', JSON.stringify({ dependencies: { '@drawmotive/editor-ui': '0.3.2' } }));
    await mkdir(path.join(f.options.root, 'node_modules/@drawmotive'), { recursive: true });
    await symlink(f.options.uiPackageRoot, path.join(f.options.root, 'node_modules/@drawmotive/editor-ui'), 'junction');
    await assert.rejects(editorUiFiles({ root: f.options.root }), /source workspaces require an explicit candidate/);
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
