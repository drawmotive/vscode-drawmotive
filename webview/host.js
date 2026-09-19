import { initializeEditor } from './sdk.js';

// Only the enclosing VS Code webview can load or export this editor instance.
const parameters = new URLSearchParams(location.hash.slice(1));
const channel = parameters.get('channel');
const parentOrigin = parameters.get('parentOrigin');
if (parent === window || !channel || !parentOrigin || parentOrigin === 'null') {
    throw new Error('Missing VS Code editor context');
}
const send = message => parent.postMessage({ ...message, channel }, parentOrigin);
let editor;
let currentDocument;
let pending = Promise.resolve();

addEventListener('message', event => {
    if (event.source !== parent || event.origin !== parentOrigin || event.data?.channel !== channel) return;
    const message = event.data;
    pending = pending.then(async () => {
        if (message.type === 'init') {
            const raw = message.data.diagramData || '';
            if (editor && raw === currentDocument) return;
            const previous = editor;
            editor = undefined;
            currentDocument = undefined;
            if (previous) await previous.dispose();
            editor = await initializeEditor({
                container: document.getElementById('editor'),
                assetBaseUrl: new URL('./', location.href).href,
                ...(raw ? { document: raw } : {}),
            });
            currentDocument = raw;
            send({ type: 'loaded' });
        } else if (message.type === 'save' && editor) {
            const data = await editor.exportDocument();
            currentDocument = data.raw;
            send({ type: 'update', data });
        }
    }).catch(error => send({ type: 'error', error: error.message ?? String(error) }));
});

addEventListener('pagehide', () => { void editor?.dispose(); });
send({ type: 'ready' });
