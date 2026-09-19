const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { EditorAssetServer } = require('../out/EditorAssetServer');
const { editorWebviewHtml } = require('../out/editorWebview');
const { writePngWithMetadata, readPngMetadata } = require('../out/pngMetadata');

test('published runtime loads offline, saves a PNG document, and reopens it', { timeout: 180000 }, async t => {
    const assets = new EditorAssetServer(path.resolve('dist/editor'));
    const host = await assets.start();
    const saved = [];
    let initialDocument = '';
    const shell = createServer((request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(request.url === '/shell' ? editorWebviewHtml(host.url)
            : '<!doctype html><iframe id=webview src=/shell style=width:100vw;height:100vh></iframe>');
    });
    await new Promise(resolve => shell.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    t.after(async () => { await browser.close(); shell.close(); shell.closeAllConnections(); assets.dispose(); });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        errors.push(`Unexpected network request: ${url.origin}`);
        return route.abort();
    });
    await page.exposeFunction('extensionMessage', async message => {
        if (message.type === 'ready') {
            await page.evaluate(raw => document.getElementById('webview').contentWindow.postMessage(
                { type: 'init', data: { diagramData: raw } }, location.origin), initialDocument);
        } else if (message.type === 'update') {
            saved.push(message.data);
            await page.evaluate(raw => {
                const target = document.getElementById('webview').contentWindow;
                target.postMessage({ type: 'saved' }, location.origin);
                target.postMessage({ type: 'init', data: { diagramData: raw } }, location.origin);
            }, message.data.raw);
        }
    });
    await page.addInitScript(() => {
        if (!location.pathname.endsWith('/shell')) return;
        // VS Code hides parent; extension messages still come from its outer frame.
        window.parent = window;
        window.acquireVsCodeApi = () => ({ postMessage: message => window.extensionMessage(message) });
    });
    await page.goto(`http://127.0.0.1:${shell.address().port}`);
    try {
        let webview = page.frames().find(frame => frame.url().endsWith('/shell'));
        await webview.waitForFunction(() => !document.getElementById('save').disabled, null, { timeout: 120000 });
        assert.equal(await webview.locator('#status').innerText(), 'Ready');
        await webview.getByRole('button', { name: 'Save diagram' }).click();
        await webview.waitForFunction(() => document.getElementById('status').textContent === 'Saved');
        const exported = saved[0];
        assert.ok(exported.raw.length > 0);
        assert.ok(exported.png.length > 0);
        const png = await writePngWithMetadata(Buffer.from(exported.png, 'base64'), exported.raw);
        assert.equal(await readPngMetadata(png), exported.raw);
        initialDocument = exported.raw;
        await page.reload();
        webview = page.frames().find(frame => frame.url().endsWith('/shell'));
        await webview.waitForFunction(() => !document.getElementById('save').disabled);
        await webview.getByRole('button', { name: 'Save diagram' }).click();
        await webview.waitForFunction(() => document.getElementById('status').textContent === 'Saved');
        assert.equal(saved[1].raw, exported.raw);
        assert.equal(errors.length, 0, errors.join(String.fromCharCode(10)));
    } catch (error) {
        error.message += ' Browser errors: ' + errors.join(String.fromCharCode(10));
        throw error;
    }
});
