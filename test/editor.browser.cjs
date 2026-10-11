const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { EditorAssetServer } = require('../out/EditorAssetServer');
const { editorWebviewHtml } = require('../out/editorWebview');

test('published runtime creates, saves, and reopens complete PNG documents offline', { timeout: 240000 }, async t => {
    const assets = new EditorAssetServer(path.resolve('dist/editor'));
    const host = await assets.start();
    const saved = [];
    let initialPng;
    const shell = createServer(async (request, response) => {
        try {
            if (request.url.startsWith('/assets/')) {
                const file = path.basename(request.url);
                if (!['editor.js', 'editor-session.mjs', 'sdk.js'].includes(file)) { response.writeHead(404).end(); return; }
                response.writeHead(200, { 'Content-Type': 'text/javascript' });
                response.end(await readFile(path.join('dist/webview', file)));
                return;
            }
            response.writeHead(200, { 'Content-Type': 'text/html' });
            const origin = `http://127.0.0.1:${shell.address().port}`;
            const mode = request.url === '/create' ? 'create' : 'edit';
            response.end(['/edit', '/create'].includes(request.url)
                ? editorWebviewHtml({ assetBaseUrl: host.url, scriptUrl: `${origin}/assets/editor.js`, cspSource: origin, sessionId: mode, mode })
                : '<!doctype html><iframe id=webview src=/create style=width:100vw;height:100vh></iframe>');
        } catch (error) { response.writeHead(500).end(String(error)); }
    });
    await new Promise(resolve => shell.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    t.after(async () => { await browser.close(); shell.close(); shell.closeAllConnections(); assets.dispose(); });
    const page = await browser.newPage();
    const errors = [];
    const waitFor = async predicate => {
        const deadline = Date.now() + 120000;
        while (!predicate()) {
            assert.equal(errors.length, 0, errors.join(String.fromCharCode(10)));
            if (Date.now() > deadline) throw new Error('Extension message timed out');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    };
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === '127.0.0.1') return route.continue();
        errors.push(`Unexpected network request: ${url.origin}`);
        return route.abort();
    });
    const post = message => page.evaluate(data => document.getElementById('webview').contentWindow.postMessage(data, location.origin), message);
    let creationComplete = false;
    await page.exposeFunction('extensionMessage', async message => {
        if (message.type === 'createFile') {
            initialPng = message.png;
            await post({ type: 'createdSaved', requestId: message.requestId, revision: message.revision, sessionId: message.sessionId });
        } else if (message.type === 'creationComplete') creationComplete = true;
        else if (message.type === 'ready') await post({ type: 'load', png: initialPng, sessionId: message.sessionId });
        else if (message.type === 'save') {
            saved.push(message);
            await post({ type: 'saved', requestId: message.requestId, revision: message.revision, sessionId: message.sessionId });
            // A filesystem watcher echo is not an external replacement.
            await post({ type: 'external', png: message.png, sessionId: message.sessionId });
        } else if (message.type === 'error') errors.push(message.error);
    });
    await page.addInitScript(() => {
        if (!['/edit', '/create'].includes(location.pathname)) return;
        window.acquireVsCodeApi = () => ({ postMessage: message => window.extensionMessage(message) });
    });
    await page.goto(`http://127.0.0.1:${shell.address().port}`);
    try {
        await waitFor(() => creationComplete);
        assert.deepEqual(Buffer.from(initialPng, 'base64').subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const [webview] = await Promise.all([
            page.waitForEvent('framenavigated', frame => frame.url().endsWith('/edit')),
            page.evaluate(() => { document.getElementById('webview').src = '/edit'; }),
        ]);
        await webview.waitForFunction(() => document.getElementById('status').textContent === 'Ready', null, { timeout: 120000 });
        const runtime = page.frames().find(frame => frame.parentFrame() === webview && frame.url().includes('/embed.html'));
        assert.ok(runtime, 'SDK must create the direct runtime frame');
        await runtime.getByTestId('editor-action-host.save').click();
        await webview.waitForFunction(() => document.getElementById('status').textContent === 'Saved');
        assert.ok(saved[0].png.length > 0);
        initialPng = saved[0].png;
        await webview.goto(`http://127.0.0.1:${shell.address().port}/edit`);
        await webview.waitForFunction(() => document.getElementById('status').textContent === 'Ready', null, { timeout: 120000 });
        const reopened = page.frames().find(frame => frame.parentFrame() === webview && frame.url().includes('/embed.html'));
        await reopened.getByTestId('editor-action-host.save').click();
        await webview.waitForFunction(() => document.getElementById('status').textContent === 'Saved');
        assert.equal(saved.length, 2);
        assert.deepEqual(Buffer.from(saved[1].png, 'base64').subarray(0, 8), Buffer.from(initialPng, 'base64').subarray(0, 8));
        assert.equal(errors.length, 0, errors.join(String.fromCharCode(10)));
    } catch (error) {
        error.message += ' Browser errors: ' + errors.join(String.fromCharCode(10));
        throw error;
    }
});
