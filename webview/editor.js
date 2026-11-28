import { createEditor } from './sdk/src/index.js';
import { mountEditorUi } from './editor-ui.js';
import { startEditorSession } from './editor-session.mjs';

const config = JSON.parse(document.getElementById('editor-config').textContent);
const saveButton = document.getElementById('save');
const fontRoot = new URL('static/', config.assetBaseUrl);

/** This runs inside the font Worker. Its Blob context cannot use VS Code's
 * resource service worker. Request bytes from the owning webview on cache misses. */
function fetchFontFromWebview(url) {
    return new Promise((resolve, reject) => {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = ({ data }) => {
            port1.close();
            if (data.error) reject(new Error(data.error));
            else resolve(new Response(data.bytes));
        };
        self.postMessage({ type: 'fetchPackagedFont', url }, [port2]);
    });
}

/** Use the webview's authenticated resource transport only for bundled fonts.
 * The SDK Worker still verifies the manifest hash and owns its cache. */
async function serveFontRequest({ data, ports }, signal) {
    if (data?.type !== 'fetchPackagedFont' || ports.length !== 1) return;
    const [port] = ports;
    try {
        const url = new URL(data.url);
        const relative = decodeURIComponent(url.pathname.slice(fontRoot.pathname.length));
        if (!url.href.startsWith(fontRoot.href) || relative.includes('\\') ||
            relative.split('/').some(part => !part || part === '.' || part === '..')) {
            throw new Error('Font URL is outside the packaged assets.');
        }
        const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal });
        if (!response.ok) throw new Error('Font asset unavailable: HTTP ' + response.status);
        const bytes = await response.arrayBuffer();
        port.postMessage({ bytes }, [bytes]);
    } catch (error) {
        port.postMessage({ error: String(error) });
    } finally { port.close(); }
}

// Dedicated Workers cannot start directly from a foreign VS Code resource
// origin. Fetch the packaged self-contained Worker and own its Blob lifetime.
const workerFactory = async (url, options) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Worker asset unavailable: HTTP ${response.status}`);
    const source = await response.blob();
    const fontRequests = options.name === 'drawmotive-fonts' ? new AbortController() : null;
    const script = fontRequests
        ? new Blob(['self.fetch = ', fetchFontFromWebview.toString(), ';\n', source], { type: 'text/javascript' })
        : source;
    const blob = URL.createObjectURL(script);
    let worker;
    try { worker = new Worker(blob, options); }
    catch (error) { URL.revokeObjectURL(blob); throw error; }
    if (fontRequests) {
        worker.addEventListener('message', event => { void serveFontRequest(event, fontRequests.signal); }, { signal: fontRequests.signal });
    }
    return { worker, dispose() { fontRequests?.abort(); worker.terminate(); URL.revokeObjectURL(blob); } };
};
const session = startEditorSession({
    ...config, saveButton, workerFactory, createEditor, mountEditorUi, vscode: acquireVsCodeApi(),
    container: document.getElementById('editor'), status: document.getElementById('status'),
});
saveButton.addEventListener('click', () => { session.save().catch(() => {}); });
document.getElementById('editor').addEventListener('keydown', session.keydown);
addEventListener('message', event => {
    // Only the controlled extension preloader can deliver file operations.
    if (event.origin === location.origin) session.receive(event.data);
});
addEventListener('pagehide', () => { session.dispose().catch(() => {}); }, { once: true });
