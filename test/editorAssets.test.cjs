const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { EditorAssetServer } = require('../out/EditorAssetServer');

test('serves only token-scoped editor assets with browser MIME types', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'drawmotive-assets-'));
    const assets = path.join(root, 'editor');
    await mkdir(assets);
    await writeFile(path.join(assets, 'embed.html'), '<html>editor</html>');
    await writeFile(path.join(assets, 'runtime.wasm'), Buffer.from([0, 97, 115, 109]));
    await writeFile(path.join(root, 'private.txt'), 'must not be served');
    const server = new EditorAssetServer(assets);
    t.after(async () => { server.dispose(); await rm(root, { recursive: true, force: true }); });
    const host = await server.start();
    assert.deepEqual(await server.start(), host);
    const runtimeUrl = new URL('embed.html', host.url).href;
    const response = await fetch(runtimeUrl);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await response.text(), '<html>editor</html>');
    const base = new URL('./', host.url).href;
    const wasm = await fetch(base + 'runtime.wasm');
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.match(wasm.headers.get('content-security-policy'), /wasm-unsafe-eval/);
    assert.equal((await fetch(runtimeUrl, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(runtimeUrl, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + 'missing')).status, 404);
    assert.equal((await fetch(new URL('/embed.html', host.url))).status, 404);
    assert.equal((await fetch(base + '..%2fprivate.txt')).status, 404);
    const rebindingStatus = await new Promise((resolve, reject) => {
        http.get(runtimeUrl, { headers: { Host: 'foreign.example' } }, res => {
            res.resume(); resolve(res.statusCode);
        }).on('error', reject);
    });
    assert.equal(rebindingStatus, 403);
    server.allowForwardedOrigin('http://127.0.0.1:9999/token/');
    const forwardedStatus = await new Promise((resolve, reject) => {
        http.get(runtimeUrl, { headers: { Host: '127.0.0.1:9999' } }, res => {
            res.resume(); resolve(res.statusCode);
        }).on('error', reject);
    });
    assert.equal(forwardedStatus, 200);
});

test('webview loads SDK modules locally and gives only the runtime an HTTP frame origin', () => {
    const { editorWebviewHtml } = require('../out/editorWebview');
    const html = editorWebviewHtml({ assetBaseUrl: 'https://forwarded.example/token/', scriptUrl: 'https://webview.example/editor.js', cspSource: 'https://webview.example', sessionId: 'session' });
    assert.match(html, /script-src 'nonce-[a-f0-9]+'/);
    assert.ok(html.includes('https://webview.example'));
    assert.ok(html.includes('frame-src https://forwarded.example'));
    assert.ok(html.includes('type="module" src="https://webview.example/editor.js"'));
    assert.equal(html.includes('<iframe'), false);
    assert.equal(html.includes('<button'), false);
    const escaped = editorWebviewHtml({ assetBaseUrl: 'http://localhost/', scriptUrl: 'https://webview.example/"<script>', cspSource: 'https://webview.example', sessionId: '</script><script>alert(1)</script>' });
    assert.equal(escaped.includes('</script><script>alert(1)'), false);
    assert.match(escaped, /\\u003c/);
});
