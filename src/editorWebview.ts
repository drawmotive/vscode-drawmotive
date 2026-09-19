import { randomBytes } from 'node:crypto';

/** A small VS Code shell bridges file I/O to the public SDK's HTTP host. The
 * origin/channel checks prevent nested runtime messages becoming file writes. */
export function editorWebviewHtml(hostUrl: string): string {
    const nonce = randomBytes(24).toString('hex');
    const origin = new URL(hostUrl).origin;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-src ${origin};">
<title>DrawMotive</title>
<style nonce="${nonce}">
html, body { margin: 0; height: 100%; overflow: hidden; }
body { display: flex; flex-direction: column; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
header { padding: 6px 10px; display: flex; gap: 12px; align-items: center; }
button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 5px 12px; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
iframe { flex: 1; width: 100%; border: 0; }
</style>
</head>
<body>
<header><button id="save" disabled>Save diagram</button><span id="status" role="status">Loading editor…</span></header>
<iframe id="editor" title="DrawMotive diagram editor"></iframe>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const frame = document.getElementById('editor');
const save = document.getElementById('save');
const status = document.getElementById('status');
const channel = crypto.randomUUID();
const host = new URL(${JSON.stringify(hostUrl)});
host.hash = new URLSearchParams({ channel, parentOrigin: location.origin }).toString();
const send = message => frame.contentWindow.postMessage({ ...message, channel }, host.origin);
addEventListener('message', event => {
    const message = event.data;
    if (!message) return;
    if (event.source === frame.contentWindow) {
        if (event.origin !== host.origin || message.channel !== channel) return;
        if (message.type === 'ready' || message.type === 'update' || message.type === 'error') {
            vscode.postMessage(message);
        }
        if (message.type === 'loaded') { save.disabled = false; status.textContent = 'Ready'; }
        if (message.type === 'error') { save.disabled = false; status.textContent = message.error; }
    } else if (event.origin === location.origin) {
        // VS Code hides window.parent; its preloader still sends from our origin.
        if (message.channel) return;
        if (message.type === 'init') send(message);
        if (message.type === 'saved') { save.disabled = false; status.textContent = 'Saved'; }
        if (message.type === 'error') { save.disabled = false; status.textContent = message.error; }
    }
});
save.addEventListener('click', () => {
    save.disabled = true;
    status.textContent = 'Saving…';
    send({ type: 'save' });
});
frame.src = host.href;
</script>
</body>
</html>`;
}
