const { mkdir, rm, copyFile, readFile, cp, readdir, realpath, lstat } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Preserve package-relative module/Worker URLs without shipping declarations
 * or accepting a symlink that reads code outside the selected package. */
async function copyModules(source, destination) {
    if (await realpath(source) !== source) throw new Error('SDK modules must not contain symbolic links.');
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source, { withFileTypes: true })) {
        if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(entry.name)) throw new Error('Unsafe SDK module path.');
        const file = path.join(source, entry.name);
        const target = path.join(destination, entry.name);
        if (entry.isDirectory()) await copyModules(file, target);
        else if (!entry.isFile()) throw new Error('SDK modules must not contain symlinks or nonregular files.');
        else if (/\.m?js$/.test(entry.name)) await copyFile(file, target);
    }
}

/** Registry builds and explicitly selected candidates share the SDK's asset
 * integrity authority. Callers choose an isolated staging root; this function
 * never substitutes package identity or rewrites its native manifest. */
async function stageEditor({ root, packageRoot, entry, destination }) {
    packageRoot = await realpath(packageRoot);
    if (await realpath(entry) !== entry || !entry.startsWith(path.join(packageRoot, 'src') + path.sep)) throw new Error('Editor entry must be a regular module within its package src directory.');
    const output = path.resolve(destination);
    if (output === packageRoot || output.startsWith(packageRoot + path.sep)) throw new Error('Editor staging must be outside its source package.');
    const { copyAssets } = await import(pathToFileURL(path.join(packageRoot, 'scripts/copy-assets.mjs')).href);
    await rm(destination, { recursive: true, force: true });
    const runtime = path.join(destination, 'editor');
    await mkdir(runtime, { recursive: true });
    await copyAssets(runtime);
    const webview = path.join(destination, 'webview');
    await mkdir(webview, { recursive: true });
    await copyModules(path.join(packageRoot, 'src'), path.join(webview, 'sdk/src'));
    const workers = path.join(packageRoot, 'dist/workers');
    let workerInfo;
    try { workerInfo = await lstat(workers); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (workerInfo) {
        if (!workerInfo.isDirectory()) throw new Error('SDK Worker directory must not be a symlink or nonregular directory.');
        await copyModules(workers, path.join(webview, 'sdk/dist/workers'));
    }
    await copyFile(path.join(packageRoot, 'LICENSE'), path.join(runtime, 'LICENSE'));
    await cp(path.join(packageRoot, 'licenses'), path.join(runtime, 'licenses'), { recursive: true });
    for (const file of ['editor.js', 'editor-session.mjs']) {
        await copyFile(path.join(root, 'webview', file), path.join(webview, file));
    }
}

/** Resolving the public export respects the same entry as package consumers. */
async function editorEntry(packageRoot) {
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    if (manifest.name !== '@drawmotive/editor') throw new Error('Candidate must be an @drawmotive/editor package.');
    const entry = manifest.exports?.['.']?.default;
    if (typeof entry !== 'string' || !entry.startsWith('./')) throw new Error('Editor package must declare its browser export.');
    const resolved = path.resolve(packageRoot, entry);
    if (!resolved.startsWith(path.resolve(packageRoot) + path.sep)) throw new Error('Editor export must stay within its package.');
    return { entry: resolved, manifest };
}

module.exports = { stageEditor, editorEntry };
