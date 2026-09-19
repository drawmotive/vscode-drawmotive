const { mkdir, rm, copyFile, readFile, cp } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** The installed registry package owns every runtime byte; clean the staging
 * directory on every build so upgrades cannot retain obsolete local binaries. */
async function prepareEditor() {
    const root = path.resolve(__dirname, '..');
    const entry = require.resolve('@drawmotive/editor');
    const packageRoot = path.resolve(path.dirname(entry), '..');
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    const expected = require('../package.json').dependencies['@drawmotive/editor'];
    if (manifest.version !== expected) throw new Error(`Install @drawmotive/editor@${expected} with npm ci`);
    const { copyAssets } = await import(pathToFileURL(path.join(packageRoot, 'scripts/copy-assets.mjs')).href);
    const destination = path.join(root, 'dist/editor');
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    await copyAssets(destination);
    await copyFile(entry, path.join(destination, 'sdk.js'));
    await copyFile(path.join(packageRoot, 'LICENSE'), path.join(destination, 'LICENSE'));
    await cp(path.join(packageRoot, 'licenses'), path.join(destination, 'licenses'), { recursive: true });
    for (const file of ['host.html', 'host.js']) {
        await copyFile(path.join(root, 'webview', file), path.join(destination, file));
    }
    console.log(`Prepared @drawmotive/editor@${manifest.version}`);
}

prepareEditor().catch(error => { console.error(error); process.exitCode = 1; });
