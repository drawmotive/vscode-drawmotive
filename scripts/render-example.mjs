import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { EditorAssetServer } = require('../out/EditorAssetServer.js');
const root = path.resolve(import.meta.dirname, '..');
const packageRoot = path.resolve(path.dirname(require.resolve('@drawmotive/editor')), '..');
const source = await readFile(path.join(root, 'examples/online-order.textgraph'), 'utf8');
const readme = await readFile(path.join(root, 'README.md'), 'utf8');
assert.equal(readme.match(/```textgraph\n([\s\S]*?)```/)?.[1], source, 'README source must match the example');
const playgroundLinks = [...readme.matchAll(/https:\/\/textgraph\.dev\/playground#source=([^)]*)/g)];
assert.ok(playgroundLinks.length > 0, 'README must link to the playable example');
for (const [, encoded] of playgroundLinks) {
  assert.equal(decodeURIComponent(encoded), source, 'Playground links must open the same example');
}
const assets = new EditorAssetServer(packageRoot);
const host = await assets.start();
let browser;

// Generate the example with the same locked public runtime as the extension.
// SDK export owns PNG metadata; reopening proves the download stays editable.
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${host.url}example`, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><style>html,body{margin:0}#editor{height:100vh}</style><div id="editor"></div></html>',
  }));
  await page.goto(`${host.url}example`);
  const result = await page.evaluate(async ({ source, host }) => {
    const { createEditor } = await import(`${host}src/index.js`);
    const editor = await createEditor({
      container: document.getElementById('editor'),
      assetBaseUrl: `${host}generated/editor/`,
      modules: { analytics: false, authentication: false, remoteSync: false },
    });
    let phase = 'importing TextGraph';
    try {
      await editor.replaceTextGraph(source);
      phase = 'exporting the editable PNG';
      const drawing = await editor.exportSnapshot({ formats: ['png'], png: { embedDocument: true } });
      phase = 'exporting the preview';
      const preview = await editor.exportSnapshot({ formats: ['png'], render: { scale: 2 } });
      phase = 'reopening the editable PNG';
      await editor.replacePngDocument(drawing.png.base64);
      phase = 'checking the reopened document';
      const reopened = await editor.exportSnapshot({ formats: ['png'], render: { scale: 2 } });
      return { drawing, preview, reopened, state: await editor.getState() };
    } catch (error) {
      throw new Error(`${phase}: ${error.message}`);
    } finally {
      await editor.dispose();
    }
  }, { source, host: host.url });
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(result.state.health, 'healthy');
  assert.ok(result.reopened.png.base64 === result.preview.png.base64, 'Reopening must preserve the rendered diagram');
  assert.equal(result.preview.revision, result.drawing.revision, 'Preview and drawing must show the same document');
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const drawing = Buffer.from(result.drawing.png.base64, 'base64');
  const preview = Buffer.from(result.preview.png.base64, 'base64');
  assert.deepEqual(drawing.subarray(0, 8), pngHeader);
  assert.deepEqual(preview.subarray(0, 8), pngHeader);
  await mkdir(path.join(root, 'docs/images'), { recursive: true });
  await writeFile(path.join(root, 'examples/online-order.draw.png'), drawing);
  await writeFile(path.join(root, 'docs/images/online-order.png'), preview);

  // Load the downloadable bytes in a fresh editor, matching the extension's
  // toolbar and import path. Capture the actual canvas, rather than a mockup.
  await page.reload();
  await page.evaluate(async ({ host, png }) => {
    const { createEditor } = await import(`${host}src/index.js`);
    const editor = await createEditor({
      container: document.getElementById('editor'),
      assetBaseUrl: `${host}generated/editor/`,
      modules: { analytics: false, authentication: false, remoteSync: false },
      ui: { actions: [{ id: 'host.save', label: 'Save diagram', icon: 'save', onInvoke: () => {} }] },
    });
    await editor.replacePngDocument(png);
    await editor.fitViewport();
    window.exampleEditor = editor;
  }, { host: host.url, png: result.drawing.png.base64 });
  const runtime = page.frames().find(frame => frame.url().includes('/embed.html'));
  await runtime.getByTestId('editor-action-host.save').waitFor();
  await runtime.locator('canvas').first().waitFor();
  await page.screenshot({ path: path.join(root, 'docs/images/online-order-editor.png') });
  await page.evaluate(() => window.exampleEditor.dispose());
  assert.equal(errors.length, 0, errors.join(String.fromCharCode(10)));
  console.log(`Rendered and reopened online-order.draw.png (${result.drawing.png.width} × ${result.drawing.png.height}); preview ${result.preview.png.width} × ${result.preview.png.height}.`);
} finally {
  await browser?.close();
  assets.dispose();
}
