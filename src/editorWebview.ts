import { randomBytes } from 'node:crypto';

interface WebviewOptions {
    assetBaseUrl: string;
    scriptUrl: string;
    styleUrl?: string;
    cspSource: string;
    sessionId: string;
    mode?: 'edit' | 'create';
}

/** The host owns file actions while the SDK mounts one canvas in this document.
 * Scripts and runtime data use only the authenticated packaged resource source. */
export function editorWebviewHtml({ assetBaseUrl, scriptUrl, styleUrl = new URL('editor-ui.css', scriptUrl).href, cspSource, sessionId, mode = 'edit' }: WebviewOptions): string {
    const nonce = randomBytes(24).toString('hex');
    const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const config = JSON.stringify({ assetBaseUrl, sessionId, mode }).replaceAll('<', '\\u003c');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${attribute(cspSource)} 'wasm-unsafe-eval'; style-src ${attribute(cspSource)} 'unsafe-inline'; img-src ${attribute(cspSource)} data: blob:; font-src ${attribute(cspSource)}; connect-src ${attribute(cspSource)} data: blob:; worker-src blob:; frame-src 'none'; object-src 'none'; base-uri 'none';">
<title>DrawMotive</title>
<link rel="stylesheet" href="${attribute(styleUrl)}">
<style nonce="${nonce}">
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
body { display: flex; flex-direction: column; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
#status { padding: 6px 10px; color: var(--vscode-errorForeground, #f14c4c); }
#status[hidden] { display: none; }
#editor { flex: 1; min-height: 0; }
#actions { padding: 6px 10px; }
#shortcuts { margin-left: 12px; font-size: 12px; color: var(--vscode-descriptionForeground); }
#save { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 4px 12px; cursor: pointer; }
#save:disabled { opacity: .5; cursor: default; }
</style>
</head>
<body>
<div id="actions"${mode === 'create' ? ' hidden' : ''}><button id="save" type="button" data-testid="editor-action-host.save" aria-keyshortcuts="Control+s Meta+s" disabled>Save diagram</button><span id="shortcuts">Canvas keys: A Arrow · R Rectangle · O Ellipse · D Diamond · T Text · Esc Cancel · Ctrl/Cmd+S Save</span></div>
<div id="status" role="alert" hidden></div>
<div id="editor" aria-describedby="shortcuts"></div>
<script id="editor-config" type="application/json" nonce="${nonce}">${config}</script>
<script type="module" src="${attribute(scriptUrl)}" nonce="${nonce}"></script>
</body>
</html>`;
}
