import { createEditor } from './sdk/src/index.js';
import { startEditorSession } from './editor-session.mjs';

const config = JSON.parse(document.getElementById('editor-config').textContent);
const saveButton = document.getElementById('save');
// Dedicated Workers cannot start directly from a foreign VS Code resource
// origin. Fetch the packaged self-contained Worker and own its Blob lifetime.
const workerFactory = async (url, options) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Worker asset unavailable: HTTP ${response.status}`);
    const blob = URL.createObjectURL(await response.blob());
    let worker;
    try { worker = new Worker(blob, options); }
    catch (error) { URL.revokeObjectURL(blob); throw error; }
    return { worker, dispose() { worker.terminate(); URL.revokeObjectURL(blob); } };
};
const session = startEditorSession({
    ...config, saveButton, workerFactory, createEditor, vscode: acquireVsCodeApi(),
    container: document.getElementById('editor'), status: document.getElementById('status'),
});
saveButton.addEventListener('click', () => { session.save().catch(() => {}); });
document.getElementById('editor').addEventListener('keydown', session.keydown);
addEventListener('message', event => {
    // Only the controlled extension preloader can deliver file operations.
    if (event.origin === location.origin) session.receive(event.data);
});
addEventListener('pagehide', () => { session.dispose().catch(() => {}); }, { once: true });
