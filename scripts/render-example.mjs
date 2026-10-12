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
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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

  // Keep the introduction's source and output together in GitHub and Marketplace,
  // where responsive page CSS and custom Markdown layouts are unavailable.
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const code = source.trimEnd().split('\n').map(line => {
    const kind = line.includes('{') ? 'group' : line.includes('->') ? 'edge' : 'label';
    return `<span class="${kind}">${escape(line)}</span>`;
  }).join('\n');
  const { displayWidth, displayHeight } = result.preview.png;
  await page.setViewportSize({ width: 1280, height: 1260 });
  await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8">
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 44px; background: #f3f6fb; color: #17263c; font-family: Arial, sans-serif; }
      header { margin-bottom: 28px; }
      h1 { margin: 0 0 10px; font-size: 38px; letter-spacing: -1px; }
      header p { margin: 0; font-size: 21px; color: #53657d; }
      main { display: grid; grid-template-columns: 1fr 475px; gap: 24px; align-items: start; }
      section { overflow: hidden; border-radius: 16px; background: white; border: 1px solid #dfe5ee; }
      h2 { margin: 0; padding: 20px 24px; font-size: 16px; letter-spacing: 1.5px; }
      .source { background: #142239; border-color: #142239; color: #e6edf7; }
      .source h2 { color: #a4b6cf; border-bottom: 1px solid #2a3a52; }
      pre { margin: 0; padding: 28px 24px 34px; font: 16px/1.85 'DejaVu Sans Mono', monospace; white-space: pre; }
      .group { color: #95c8ff; }
      .edge { color: #7de2c2; }
      .label { color: #dfe7f3; }
      .output h2 { color: #53657d; border-bottom: 1px solid #e8edf4; }
      img { display: block; width: ${displayWidth}px; height: ${displayHeight}px; margin: 16px auto; }
      footer { margin-top: 18px; font-size: 16px; color: #53657d; }
    </style>
    <header><h1>From a few lines to a story everyone can follow.</h1><p>What happens when you place an online order?</p></header>
    <main><section class="source"><h2>DESCRIBE IT · TEXTGRAPH</h2><pre><code>${code}</code></pre></section>
    <section class="output"><h2>SEE IT · DRAWMOTIVE</h2><img alt="Rendered online order workflow" src="data:image/png;base64,${result.preview.png.base64}"></section></main>
    <footer>Same source. Real output. Open the editable PNG in VS Code and make it yours.</footer>
  </html>`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({ path: path.join(root, 'docs/images/online-order-demo.png'), fullPage: true });
  console.log(`Rendered and reopened online-order.draw.png (${result.drawing.png.width} × ${result.drawing.png.height}); preview ${result.preview.png.width} × ${result.preview.png.height}.`);
} finally {
  await browser?.close();
  assets.dispose();
}
