import { createEditor } from './sdk.js';
import { startEditorSession } from './editor-session.mjs';

const config = JSON.parse(document.getElementById('editor-config').textContent);
// Load the current controlled webview document first to retain its service
// worker, then let the SDK write the trusted packaged runtime into that frame.
const frameDocument = config.runtimeDocument === undefined ? undefined : { url: window.frameElement.src, html: config.runtimeDocument };
const session = startEditorSession({
    ...config, frameDocument, createEditor, vscode: acquireVsCodeApi(),
    container: document.getElementById('editor'), status: document.getElementById('status'),
});
addEventListener('message', event => {
    // The extension preloader sends from the webview origin; runtime messages
    // travel over its private SDK port and must never become file operations.
    if (event.origin === location.origin) session.receive(event.data);
});
addEventListener('pagehide', () => { session.dispose().catch(() => {}); }, { once: true });
