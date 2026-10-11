const { mkdir, rm, copyFile, readFile, cp } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** Registry builds and explicitly selected candidates share the SDK's asset
 * integrity authority. Callers choose an isolated staging root; this function
 * never substitutes package identity or rewrites its native manifest. */
async function stageEditor({ root, packageRoot, entry, destination }) {
    const { copyAssets } = await import(pathToFileURL(path.join(packageRoot, 'scripts/copy-assets.mjs')).href);
    await rm(destination, { recursive: true, force: true });
    const runtime = path.join(destination, 'editor');
    await mkdir(runtime, { recursive: true });
    await copyAssets(runtime);
    const webview = path.join(destination, 'webview');
    await mkdir(webview, { recursive: true });
    await copyFile(entry, path.join(webview, 'sdk.js'));
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
