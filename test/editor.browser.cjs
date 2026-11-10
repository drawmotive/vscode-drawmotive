const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { editorWebviewHtml } = require('../out/editorWebview');

for (const resourceTransport of [false, true]) {
test(`runtime creates, saves, and reopens complete PNG documents using ${resourceTransport ? 'authenticated host resources' : 'same-origin HTTP'} offline`, { timeout: 240000 }, async t => {
    const assetRoot = process.env.DRAWMOTIVE_EDITOR_TEST_ASSETS ?? path.resolve('dist');
    const saved = [];
    let initialPng;
    let expectLoadFailure = false;
    const loadFailures = [];
    const resourceOrigin = 'https://vscode-remote+tunnel-002bcontrol-002dplane.vscode-resource.vscode-cdn.net';
    const resourceBase = resourceOrigin + '/packaged/editor/';
    const shell = createServer(async (request, response) => {
        try {
            const pathname = new URL(request.url, 'http://localhost').pathname;
            const route = pathname.startsWith('/assets/') ? ['webview', '/assets/'] : pathname.startsWith('/runtime/') ? ['editor', '/runtime/'] : undefined;
            if (route) {
                const directory = path.resolve(assetRoot, route[0]);
                const file = path.resolve(directory, decodeURIComponent(pathname.slice(route[1].length)));
                if (!file.startsWith(directory + path.sep)) { response.writeHead(404).end(); return; }
                const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json' };
                response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
                response.end(await readFile(file));
                return;
            }
            response.writeHead(200, { 'Content-Type': 'text/html' });
            const origin = `http://127.0.0.1:${shell.address().port}`;
            const mode = request.url === '/create' ? 'create' : 'edit';
            response.end(['/edit', '/create'].includes(request.url)
                ? editorWebviewHtml({ assetBaseUrl: resourceTransport ? resourceBase : `${origin}/runtime/`, scriptUrl: resourceTransport ? `${resourceOrigin}/packaged/webview/editor.js` : `${origin}/assets/editor.js`, cspSource: resourceTransport ? `${origin} https://*.vscode-cdn.net` : origin, sessionId: mode, mode })
                : '<!doctype html><iframe id=webview src=/create style=width:100vw;height:100vh></iframe>');
        } catch (error) { response.writeHead(500).end(String(error)); }
    });
    await new Promise(resolve => shell.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ headless: true });
    t.after(async () => { await browser.close(); shell.close(); shell.closeAllConnections(); });
    const page = await browser.newPage();
    const errors = [];
    let phase = 'creating the initial document';
    const recordError = message => errors.push(`${phase}: ${message}`);
    const waitFor = async predicate => {
        const deadline = Date.now() + 120000;
        while (!predicate()) {
            assert.equal(errors.length, 0, errors.join(String.fromCharCode(10)));
            if (Date.now() > deadline) throw new Error('Extension message timed out');
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    };
    page.on('pageerror', error => recordError(error.message));
    page.on('console', message => { if (message.type() === 'error') recordError(message.text()); });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (resourceTransport && url.origin === resourceOrigin && url.pathname.startsWith('/packaged/')) {
            const relative = decodeURIComponent(url.pathname.slice('/packaged/'.length));
            assert.ok(!relative.includes('..'));
            assert.match(relative, /^(editor|webview)\//);
            const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' };
            return route.fulfill({ body: await readFile(path.join(assetRoot, relative)), contentType: types[path.extname(relative)] ?? 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' } });
        }
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
        } else if (message.type === 'error') (expectLoadFailure ? loadFailures : errors).push(message.error);
    });
    await page.addInitScript(() => {
        if (!['/edit', '/create'].includes(location.pathname) || location.hash.startsWith('#nonce=')) return;
        window.acquireVsCodeApi = () => ({ postMessage: message => window.extensionMessage(message) });
    });
    await page.goto(`http://127.0.0.1:${shell.address().port}`);
    try {
        await waitFor(() => creationComplete);
        assert.deepEqual(Buffer.from(initialPng, 'base64').subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        phase = 'opening the created file';
        const [webview] = await Promise.all([
            page.waitForEvent('framenavigated', frame => frame.url().endsWith('/edit')),
            page.evaluate(() => { document.getElementById('webview').src = '/edit'; }),
        ]);
        const ready = async () => {
            await webview.waitForFunction(() => !document.querySelector('[data-testid="editor-action-host.save"]').disabled, null, { timeout: 120000 });
            assert.equal(await webview.locator('#status').isVisible(), false);
            assert.equal(await webview.locator('#editor canvas').count(), 1);
            await webview.getByTestId('drawing-toolbar').waitFor({ state: 'visible' });
            assert.equal(await webview.getByRole('button', { name: 'Rectangle', exact: true }).evaluate(element => getComputedStyle(element).pointerEvents), 'auto');
            assert.equal(webview.childFrames().length, 0, 'The SDK mounts its canvas in the host document');
            return webview;
        };
        let runtime = await ready();
        phase = 'drawing a rectangle';
        const canvas = runtime.locator('#editor canvas');
        await runtime.getByRole('button', { name: 'Rectangle', exact: true }).click();
        const box = await canvas.boundingBox();
        await page.mouse.move(box.x + 280, box.y + 180);
        await page.mouse.down();
        await page.mouse.move(box.x + 440, box.y + 280, { steps: 8 });
        await page.mouse.up();
        await runtime.getByTestId('context-toolbar').waitFor({ state: 'visible' });
        phase = 'editing the selected rectangle through public properties';
        const corner = runtime.getByTestId('context-toolbar-corner-radius');
        const wasRounded = await corner.getAttribute('aria-pressed');
        await corner.click();
        await runtime.waitForFunction(previous => {
            const button = document.querySelector('[data-testid="context-toolbar-corner-radius"]');
            return button && button.getAttribute('aria-pressed') !== previous;
        }, wasRounded);
        if (process.env.DRAWMOTIVE_EDITOR_TEST_SCREENSHOT && !resourceTransport) await webview.locator('body').screenshot({ path: process.env.DRAWMOTIVE_EDITOR_TEST_SCREENSHOT });
        phase = 'saving the rectangle';
        await runtime.getByTestId('editor-action-host.save').click();
        await waitFor(() => saved.length === 1);
        assert.ok(saved[0].png.length > 0);
        initialPng = saved[0].png;
        phase = 'reopening the saved drawing';
        await webview.goto(`http://127.0.0.1:${shell.address().port}/edit`);
        const reopened = await ready();
        await reopened.getByTestId('editor-action-host.save').click();
        await waitFor(() => saved.length === 2);
        assert.equal(saved.length, 2);
        assert.deepEqual(Buffer.from(saved[1].png, 'base64').subarray(0, 8), Buffer.from(initialPng, 'base64').subarray(0, 8));
        initialPng = '';
        phase = 'opening an empty file';
        await webview.goto(`http://127.0.0.1:${shell.address().port}/edit`);
        runtime = await ready();
        assert.equal(saved.length, 2, 'Opening an empty file does not write it');
        await runtime.getByTestId('editor-action-host.save').click();
        await waitFor(() => saved.length === 3);
        assert.deepEqual(Buffer.from(saved[2].png, 'base64').subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        initialPng = Buffer.from('invalid PNG').toString('base64');
        expectLoadFailure = true;
        phase = 'opening an invalid PNG';
        await webview.goto(`http://127.0.0.1:${shell.address().port}/edit`);
        await webview.locator('#status').waitFor({ state: 'visible', timeout: 120000 });
        assert.ok((await webview.locator('#status').textContent()).length > 0);
        assert.equal(await webview.locator('#status').evaluate(element => getComputedStyle(element).color), 'rgb(241, 76, 76)');
        await waitFor(() => loadFailures.length === 1);
        phase = 'recovering from the invalid PNG';
        await post({ type: 'external', png: saved[2].png, sessionId: 'edit' });
        runtime = await ready();
        assert.equal(await runtime.getByTestId('editor-action-host.save').isEnabled(), true);
        assert.equal(errors.length, 0, errors.join(String.fromCharCode(10)));
    } catch (error) {
        error.message += ' Browser errors: ' + errors.join(String.fromCharCode(10));
        throw error;
    }
});
}
