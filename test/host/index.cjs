const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const { chromium } = require('playwright');

// This driver automates the real workbench and installed product. It neither
// replaces acquireVsCodeApi nor reaches into the provider or SDK internals.
exports.run = async function () {
    const artifacts = process.env.DRAWMOTIVE_HOST_ARTIFACTS;
    const uri = vscode.Uri.file(path.join(process.env.DRAWMOTIVE_HOST_WORKSPACE, 'host-test.draw.png'));
    const evidence = { vscode: vscode.version, node: process.versions.node, checks: [] };
    let browser;
    try {
        const extension = vscode.extensions.getExtension('drawmotive.vscode-drawmotive');
        assert.ok(extension, 'Candidate VSIX must be installed');
        assert.ok(extension.extensionPath.startsWith(process.env.DRAWMOTIVE_HOST_EXTENSIONS + path.sep), 'Product must load from installed VSIX');
        browser = await retry(() => chromium.connectOverCDP(process.env.DRAWMOTIVE_HOST_CDP), 20000);
        const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('workbench'));
        assert.ok(page, 'Actual VS Code workbench must expose CDP');
        if (process.env.DRAWMOTIVE_EXAMPLE_CAPTURE) {
            await page.waitForFunction(() => innerWidth >= 1599 && innerHeight >= 1199);
            const root = process.env.DRAWMOTIVE_EXAMPLE_CAPTURE;
            const example = vscode.Uri.file(path.join(process.env.DRAWMOTIVE_HOST_WORKSPACE, 'online-order.draw.png'));
            await vscode.commands.executeCommand('vscode.open', example);
            const webview = await findWebview(browser);
            await ready(webview);
            const runtime = await findRuntime(webview);
            await runtime.locator('canvas').first().waitFor();
            // Top-level workbench supplies actual host context; never crop to the webview.
            for (const selector of ['.part.titlebar', '.part.activitybar', '.part.sidebar', '.part.statusbar', '.tabs-container']) {
                await page.locator(selector).first().waitFor({ state: 'visible' });
            }
            const image = path.join(root, 'docs/images/online-order-editor.png');
            const bytes = await page.screenshot({ path: image });
            const { createHash } = require('node:crypto');
            const rendered = JSON.parse(await fs.readFile(path.join(root, 'examples/online-order.render.json'), 'utf8'));
            const bounds = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
            await fs.writeFile(image.replace('.png', '.capture.json'), JSON.stringify({
                application: 'Visual Studio Code', version: vscode.version,
                extension: extension.packageJSON.version, editor: rendered.editor, ...bounds,
                sha256: createHash('sha256').update(bytes).digest('hex'),
                sourceSha256: createHash('sha256').update(await fs.readFile(path.join(root, 'examples/online-order.textgraph'))).digest('hex'), source: 'online-order.textgraph',
                drawingSha256: createHash('sha256').update(await fs.readFile(example.fsPath)).digest('hex'),
            }, null, 2) + '\n');
            evidence.checks.push('canonical editable PNG inside actual VS Code workbench');
            await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2));
            return;
        }
        const ordinary = vscode.Uri.file(path.join(process.env.DRAWMOTIVE_HOST_WORKSPACE, 'ordinary.png'));
        await vscode.workspace.fs.writeFile(ordinary, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
        await vscode.commands.executeCommand('vscode.open', ordinary);
        await retry(() => {
            const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
            assert.ok(input instanceof vscode.TabInputCustom);
            assert.equal(input.viewType, 'imagePreview.previewEditor', 'Ordinary PNG must use the built-in image editor');
        }, 10000);
        assert.equal(extension.isActive, false, 'Ordinary PNG must not activate DrawMotive');
        evidence.checks.push('ordinary .png opens the built-in image editor without activating DrawMotive');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        // Run the contributed command, including its actual Save dialog.
        const creation = vscode.commands.executeCommand('drawmotive.newDrawing');
        const pathInput = page.locator('.quick-input-widget input').first();
        await pathInput.waitFor({ timeout: 20000 });
        await pathInput.fill(uri.fsPath.replace(/\.draw\.png$/, '.png'));
        await pathInput.press('Enter');
        await creation;
        assert.equal(extension.isActive, true);
        let webview = await findWebview(browser);
        await ready(webview);
        const blank = Buffer.from(await vscode.workspace.fs.readFile(uri));
        assert.deepEqual(blank.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        evidence.checks.push('contributed New Diagram command creates a complete PNG before opening the custom editor');
        let runtime = await findRuntime(webview);
        assert.match(webview.url(), /^vscode-webview:/);
        const scriptUrl = await webview.locator('script[type=module][src]').getAttribute('src');
        assert.match(scriptUrl, /vscode-resource/);
        const csp = await webview.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
        assert.match(csp, /default-src 'none'/);
        assert.match(csp, /script-src 'nonce-/);
        evidence.checks.push('installed asWebviewUri modules and strict CSP load the native canvas with packaged Blob Workers');
        const bounds = await webview.evaluate(() => {
            const rect = document.getElementById('editor').getBoundingClientRect();
            return { x: rect.x, y: rect.y, bottom: rect.bottom, actionsBottom: document.getElementById('actions').getBoundingClientRect().bottom, width: rect.width, viewportWidth: innerWidth, viewportHeight: innerHeight };
        });
        assert.equal(bounds.x, 0);
        assert.equal(bounds.y, bounds.actionsBottom);
        assert.equal(bounds.bottom, bounds.viewportHeight);
        assert.equal(bounds.width, bounds.viewportWidth);
        assert.equal(await webview.locator('#status').isVisible(), false);
        evidence.checks.push('canvas fills the space below host Save and normal status messages occupy no space');
        assert.equal(await runtime.getByTestId('home-toolbar-profile').count(), 0);
        assert.equal(await runtime.getByTestId('badge-not-syncing').count(), 0);
        assert.equal(await runtime.locator('script[src*="googletagmanager"], script[src*="google-analytics"]').count(), 0);
        await drawRectangle(runtime);
        await save(runtime, uri);
        const edited = Buffer.from(await vscode.workspace.fs.readFile(uri));
        assert.ok(!edited.equals(blank), 'Drawing a rectangle must change the saved PNG');
        evidence.checks.push('native canvas input changes the document and host Save writes the WASM-encoded PNG');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await retry(async () => { assert.equal(await runtime.locator('canvas').count().catch(() => 0), 0); }, 10000);
        await vscode.commands.executeCommand('vscode.open', uri);
        await retry(() => {
            const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
            assert.ok(input instanceof vscode.TabInputCustom);
            assert.equal(input.viewType, 'drawmotive.editor', '*.draw.png must automatically select DrawMotive');
        }, 10000);
        webview = await findWebview(browser);
        await ready(webview);
        runtime = await findRuntime(webview);
        await save(runtime, uri);
        assert.deepEqual(await pixels(page, await vscode.workspace.fs.readFile(uri)), await pixels(page, edited), 'Reopen and unchanged Save must preserve the drawing pixels');
        evidence.checks.push('close cleans up the webview; .draw.png automatically opens DrawMotive and unchanged Save preserves its drawing pixels');
        // Write through the actual filesystem while the runtime has dirty edits.
        await drawRectangle(runtime, 120);
        await fs.writeFile(uri.fsPath, blank);
        const reloadDialog = page.getByRole('dialog');
        await reloadDialog.waitFor({ timeout: 20000 });
        await reloadDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await reloadDialog.waitFor({ state: 'hidden' });
        await ready(webview);
        // A write of the existing saved baseline is a watcher echo, not a
        // replacement request. Establish a new baseline after proving Cancel
        // kept the edit, then make an independent dirty edit before Reload.
        await save(runtime, uri);
        assert.ok(!Buffer.from(await vscode.workspace.fs.readFile(uri)).equals(edited), 'Cancel must preserve the unsaved rectangle');
        await drawRectangle(runtime, 240);
        await fs.writeFile(uri.fsPath, edited);
        await reloadDialog.waitFor({ timeout: 20000 });
        await reloadDialog.getByRole('button', { name: 'Reload', exact: true }).click();
        await ready(webview);
        await save(runtime, uri);
        assert.deepEqual(await pixels(page, await vscode.workspace.fs.readFile(uri)), await pixels(page, edited));
        evidence.checks.push('real filesystem watcher asks before discarding dirty edits; Cancel keeps edits and Reload imports disk bytes');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        const emptyUri = vscode.Uri.file(path.join(process.env.DRAWMOTIVE_HOST_WORKSPACE, 'empty.draw.png'));
        await vscode.workspace.fs.writeFile(emptyUri, new Uint8Array());
        await vscode.commands.executeCommand('vscode.open', emptyUri);
        webview = await findWebview(browser);
        await ready(webview);
        runtime = await findRuntime(webview);
        assert.equal((await vscode.workspace.fs.readFile(emptyUri)).length, 0, 'Opening a zero-byte file must not write it');
        assert.equal(await webview.locator('#status').isVisible(), false);
        await drawRectangle(runtime);
        await save(runtime, emptyUri);
        const emptyEdited = Buffer.from(await vscode.workspace.fs.readFile(emptyUri));
        assert.deepEqual(emptyEdited.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await vscode.commands.executeCommand('vscode.open', emptyUri);
        webview = await findWebview(browser);
        await ready(webview);
        runtime = await findRuntime(webview);
        await save(runtime, emptyUri);
        assert.deepEqual(await pixels(page, await vscode.workspace.fs.readFile(emptyUri)), await pixels(page, emptyEdited));
        evidence.checks.push('zero-byte .draw.png opens a blank editable canvas without writes or errors and saves/reopens as a complete drawing PNG');
        // Keep host notifications from covering the controls in UI evidence.
        await vscode.commands.executeCommand('notifications.clearAll');
        const canvas = await runtime.locator('canvas').first().boundingBox();
        await runtime.locator('canvas').first().click({ position: { x: canvas.width / 2, y: canvas.height / 2 } });
        await runtime.getByTestId('context-toolbar').waitFor({ state: 'visible' });
        await page.screenshot({ path: path.join(artifacts, 'editor.png') });
        await runtime.getByRole('button', { name: 'Settings', exact: true }).click();
        // Preferences are acknowledged asynchronously by the native canvas;
        // wait for its published theme instead of an immediate DOM checkbox.
        await runtime.getByTestId('settings-dark-theme').click();
        await runtime.waitForFunction(() => document.querySelector('.dm-editor-ui')?.getAttribute('data-mantine-color-scheme') === 'dark');
        await page.screenshot({ path: path.join(artifacts, 'editor-dark.png') });
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(evidence));
    } catch (error) {
        evidence.error = error.stack || String(error);
        await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(evidence, null, 2));
        for (const [index, page] of (browser?.contexts().flatMap(context => context.pages()) || []).entries()) {
            await page.screenshot({ path: path.join(artifacts, 'failure-' + index + '.png') }).catch(() => {});
        }
        throw error;
    } finally { await browser?.close(); }
};

async function retry(action, timeout = 120000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
        try { return await action(); } catch (error) { last = error; }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Host test timed out: ' + last?.message, { cause: last });
}
async function findWebview(browser) {
    return retry(async () => {
        for (const page of browser.contexts().flatMap(context => context.pages())) {
            for (const frame of page.frames()) {
                if (await frame.locator('#editor-config').count().catch(() => 0)) return frame;
            }
        }
        throw new Error('DrawMotive webview not found');
    });
}
async function findRuntime(webview) {
    return retry(async () => {
        await webview.locator('#editor canvas').first().waitFor();
        assert.equal(webview.childFrames().length, 0, 'SDK canvas must mount in the host webview');
        return webview;
    });
}
async function ready(webview) {
    const runtime = await findRuntime(webview);
    await runtime.waitForFunction(() => !document.querySelector('[data-testid="editor-action-host.save"]').disabled, null, { timeout: 120000 });
    assert.equal(await webview.locator('#status').isVisible(), false);
    await runtime.getByTestId('drawing-toolbar').waitFor({ state: 'visible' });
}
async function save(runtime, uri) {
    const before = await fs.stat(uri.fsPath, { bigint: true });
    await runtime.getByTestId('editor-action-host.save').click();
    await retry(async () => {
        assert.notEqual((await fs.stat(uri.fsPath, { bigint: true })).mtimeNs, before.mtimeNs, 'Save must finish the actual file write');
        assert.equal(await runtime.getByTestId('editor-action-host.save').isEnabled(), true);
    });
}
async function drawRectangle(runtime, offset = 0) {
    await runtime.locator('canvas').first().press('r');
    const canvas = await runtime.locator('canvas').first().boundingBox();
    assert.ok(canvas);
    const mouse = runtime.page().mouse;
    await mouse.move(canvas.x + 250 + offset, canvas.y + 240);
    await mouse.down();
    await mouse.move(canvas.x + 340 + offset, canvas.y + 330, { steps: 8 });
    await mouse.up();
}


// PNG exports do not promise canonical document serialization. Decode with
// Chromium to compare actual raster content;
// managed tests separately assert stable item identities and canonical models.
async function pixels(page, bytes) {
    return page.evaluate(async base64 => {
        const data = Uint8Array.from(atob(base64), value => value.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([data], { type: 'image/png' }));
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        context.drawImage(bitmap, 0, 0);
        const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
        const digest = await crypto.subtle.digest('SHA-256', pixels);
        bitmap.close();
        return { width: canvas.width, height: canvas.height, hash: Array.from(new Uint8Array(digest)).join(',') };
    }, Buffer.from(bytes).toString('base64'));
}


// Ordinary workbench mode permits real modal dialogs; extensionTestsPath would
// activate VS Code's test-only dialog refusal. Results, not the process exit
// code alone, determine success in the parent launcher.
exports.activate = function () {
    exports.run().then(
        () => vscode.commands.executeCommand('workbench.action.quit'),
        error => { console.error(error); return vscode.commands.executeCommand('workbench.action.quit'); },
    );
};
