import { createEditor } from './sdk.js';
import { startEditorSession } from './editor-session.mjs';

const config = JSON.parse(document.getElementById('editor-config').textContent);
const session = startEditorSession({
    ...config, createEditor, vscode: acquireVsCodeApi(),
    container: document.getElementById('editor'), status: document.getElementById('status'),
});
addEventListener('message', event => {
    // The extension preloader sends from the webview origin; runtime messages
    // travel over its private SDK port and must never become file operations.
    if (event.origin === location.origin) session.receive(event.data);
});
addEventListener('pagehide', () => { session.dispose().catch(() => {}); }, { once: true });
