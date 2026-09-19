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
    await writeFile(path.join(assets, 'host.html'), '<html>editor</html>');
    await writeFile(path.join(assets, 'runtime.wasm'), Buffer.from([0, 97, 115, 109]));
    await writeFile(path.join(root, 'private.txt'), 'must not be served');
    const server = new EditorAssetServer(assets);
    t.after(async () => { server.dispose(); await rm(root, { recursive: true, force: true }); });
    const host = await server.start();
    assert.deepEqual(await server.start(), host);
    const response = await fetch(host.url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await response.text(), '<html>editor</html>');
    const base = new URL('./', host.url).href;
    const wasm = await fetch(base + 'runtime.wasm');
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.match(wasm.headers.get('content-security-policy'), /wasm-unsafe-eval/);
    assert.equal((await fetch(host.url, { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(host.url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + 'missing')).status, 404);
    assert.equal((await fetch(new URL('/host.html', host.url))).status, 404);
    assert.equal((await fetch(base + '..%2fprivate.txt')).status, 404);
    const rebindingStatus = await new Promise((resolve, reject) => {
        http.get(host.url, { headers: { Host: 'foreign.example' } }, res => {
            res.resume(); resolve(res.statusCode);
        }).on('error', reject);
    });
    assert.equal(rebindingStatus, 403);
    server.allowForwardedOrigin('http://127.0.0.1:9999/token/host.html');
    const forwardedStatus = await new Promise((resolve, reject) => {
        http.get(host.url, { headers: { Host: '127.0.0.1:9999' } }, res => {
            res.resume(); resolve(res.statusCode);
        }).on('error', reject);
    });
    assert.equal(forwardedStatus, 200);
});

test('PNG save replaces the editable document and preserves the preview', async () => {
    const { writePngWithMetadata, readPngMetadata } = require('../out/pngMetadata');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
    const first = await writePngWithMetadata(png, 'first-document');
    const second = await writePngWithMetadata(first, 'updated-document');
    assert.equal(await readPngMetadata(second), 'updated-document');
    assert.equal(second.includes(Buffer.from('first-document')), false);
    assert.equal(second.subarray(0, 8).equals(png.subarray(0, 8)), true);
});
