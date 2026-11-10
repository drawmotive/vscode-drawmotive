const { readFile, readdir, realpath, lstat } = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { build } = require('esbuild');

/** Module comments often refer to separate license files. Preserve the actual
 * notices of every package in the bundled JS/CSS dependency closure. */
async function bundledNotices(inputs, root) {
    const packages = new Map();
    for (const input of inputs) {
        if (input.startsWith('<')) continue;
        let directory = path.dirname(path.resolve(root, input));
        while (true) {
            let manifest;
            try { manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            if (manifest) {
                const key = manifest.name + '@' + (manifest.version ?? 'unversioned');
                if (!packages.has(key)) {
                    const names = (await readdir(directory, { withFileTypes: true })).filter(file => /^(license|licence|copying|notice)([._-]|$)/i.test(file.name));
                    // This exact npm distribution omits its MIT license file.
                    // Keep the attributed upstream text in the host, never fetch
                    // mutable license content during compilation.
                    if (!names.length && key === 'react-remove-scroll-bar@2.3.8') {
                        packages.set(key, await readFile(path.join(root, 'third-party/react-remove-scroll-bar-2.3.8-LICENSE'), 'utf8'));
                        break;
                    }
                    if (!names.length) throw new Error('Bundled package is missing license notices: ' + key);
                    const notices = [];
                    for (const file of names.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
                        if (!file.isFile()) throw new Error('Bundled license notices must be regular files: ' + key);
                        notices.push(file.name + '\n' + await readFile(path.join(directory, file.name), 'utf8'));
                    }
                    packages.set(key, notices.join('\n\n'));
                }
                break;
            }
            const parent = path.dirname(directory);
            if (parent === directory) throw new Error('Bundled input has no package attribution: ' + input);
            directory = parent;
        }
    }
    return Buffer.from([...packages].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, notice]) => name + '\n\n' + notice).join('\n\n---\n\n'));
}

/** Bundle the public UI distribution for an offline webview. Rebuilding in
 * memory also gives retained-VSIX verification the same byte authority. */
async function editorUiFiles({ root, uiPackageRoot }) {
    let expectedVersion;
    if (!uiPackageRoot) {
        const host = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
        expectedVersion = host.dependencies?.['@drawmotive/editor-ui'];
        if (!expectedVersion) throw new Error('Editor UI registry adoption is deferred until a compatible @drawmotive/editor-ui dependency and lock are prepared. Select an explicit Editor/UI candidate pair.');
        uiPackageRoot = path.join(root, 'node_modules/@drawmotive/editor-ui');
        const installed = await lstat(uiPackageRoot).catch(() => undefined);
        if (!installed?.isDirectory() || await realpath(uiPackageRoot) !== uiPackageRoot) throw new Error('Install @drawmotive/editor-ui@' + expectedVersion + ' locally with npm ci; source workspaces require an explicit candidate.');
    }
    uiPackageRoot = await realpath(uiPackageRoot);
    const manifest = JSON.parse(await readFile(path.join(uiPackageRoot, 'package.json'), 'utf8'));
    if (manifest.name !== '@drawmotive/editor-ui') throw new Error('UI candidate must be an @drawmotive/editor-ui package.');
    if (expectedVersion && manifest.version !== expectedVersion) throw new Error('Install @drawmotive/editor-ui@' + expectedVersion + ' with npm ci.');
    const exported = async name => {
        const declaration = manifest.exports?.[name];
        const relative = typeof declaration === 'string' ? declaration : declaration?.default;
        if (typeof relative !== 'string' || !relative.startsWith('./')) throw new Error('UI package must declare its public ' + name + ' export.');
        const file = path.resolve(uiPackageRoot, relative);
        if (!file.startsWith(uiPackageRoot + path.sep) || await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error('UI exports must be regular files within the selected package.');
        return file;
    };
    const entry = await exported('.');
    const css = await exported('./styles.css');
    const resolveUi = createRequire(path.join(uiPackageRoot, 'package.json'));
    const mantine = resolveUi.resolve('@mantine/core/styles.css');
    const result = await build({
        stdin: { contents: `export { mountEditorUi } from ${JSON.stringify(entry)}; import ${JSON.stringify(mantine)}; import ${JSON.stringify(css)};`, resolveDir: uiPackageRoot },
        absWorkingDir: root, outfile: 'editor-ui.js', bundle: true, write: false,
        platform: 'browser', format: 'esm', minify: true, charset: 'utf8', metafile: true,
        // Never bundle a second SDK: its canvas lease, preferences and DOM
        // notifications must be the same ones used by host file operations.
        plugins: [{ name: 'host-sdk', setup(builder) { builder.onResolve({ filter: new RegExp('^@drawmotive/editor$') }, () => ({ path: './sdk/src/index.js', external: true })); } }],
    });
    const files = new Map(result.outputFiles.map(file => [path.basename(file.path), Buffer.from(file.contents)]));
    files.set('editor-ui-NOTICES.txt', await bundledNotices(Object.keys(result.metafile.inputs), root));
    for (const name of ['MaterialSymbols-LICENSE.txt', 'MaterialSymbols-NOTICE.txt']) {
        const file = path.join(path.dirname(entry), name);
        if (await realpath(file) !== file || !(await lstat(file)).isFile()) throw new Error('UI attribution must be a regular file.');
        files.set(name, await readFile(file));
    }
    return files;
}

module.exports = { editorUiFiles };
