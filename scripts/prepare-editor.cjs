const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { stageEditor } = require('./stage-editor.cjs');

/** Normal compilation consumes only the exact installed registry dependency.
 * Candidate tests have a separate explicit command and never certify release
 * readiness for this lockfile or leave their assets in the release directory. */
async function prepareEditor() {
    const root = path.resolve(__dirname, '..');
    const entry = require.resolve('@drawmotive/editor');
    const packageRoot = path.resolve(path.dirname(entry), '..');
    const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
    const expected = require('../package.json').dependencies['@drawmotive/editor'];
    if (manifest.version !== expected) throw new Error(`Install @drawmotive/editor@${expected} with npm ci`);
    await stageEditor({ root, packageRoot, entry, destination: path.join(root, 'dist') });
    console.log(`Prepared @drawmotive/editor@${manifest.version}`);
}

prepareEditor().catch(error => { console.error(error); process.exitCode = 1; });
