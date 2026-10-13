import { randomBytes } from 'node:crypto';

interface WebviewOptions {
    assetBaseUrl: string;
    runtimeDocument?: string;
    scriptUrl: string;
    cspSource: string;
    sessionId: string;
    mode?: 'edit' | 'create';
}

/** Local SDK modules own the outer webview. Browser runtime documents use the
 * same controlled origin; desktop runtimes use their resolved HTTP origin. */
export function editorWebviewHtml({ assetBaseUrl, runtimeDocument, scriptUrl, cspSource, sessionId, mode = 'edit' }: WebviewOptions): string {
    const nonce = randomBytes(24).toString('hex');
    const origin = new URL(assetBaseUrl).origin;
    const frameSource = runtimeDocument === undefined ? origin : "'self'";
    const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const config = JSON.stringify({ assetBaseUrl, runtimeDocument, sessionId, mode }).replaceAll('<', '\\u003c');
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${attribute(cspSource)}; style-src 'nonce-${nonce}'; frame-src ${attribute(frameSource)}; object-src 'none'; base-uri 'none';">
<title>DrawMotive</title>
<style nonce="${nonce}">
html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
body { display: flex; flex-direction: column; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
#status { padding: 6px 10px; color: var(--vscode-errorForeground, #f14c4c); }
#status[hidden] { display: none; }
#editor { flex: 1; min-height: 0; }
#editor > iframe { display: block; width: 100%; height: 100%; border: 0; }
</style>
</head>
<body>
<div id="status" role="alert" hidden></div>
<div id="editor"></div>
<script id="editor-config" type="application/json" nonce="${nonce}">${config}</script>
<script type="module" src="${attribute(scriptUrl)}" nonce="${nonce}"></script>
</body>
</html>`;
}
