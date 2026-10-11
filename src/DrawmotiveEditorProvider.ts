import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { EditorAssetServer } from './EditorAssetServer';
import { EditorFileSession } from './EditorFileSession';
import { editorWebviewHtml } from './editorWebview';

/** The readonly provider deliberately owns its explicit Save action rather
 * than adopting VS Code's native save/backup lifecycle in this integration. */
export class DrawmotiveEditorProvider implements vscode.CustomReadonlyEditorProvider {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly assetServer: EditorAssetServer,
    ) {}

    public async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken,
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        panel: vscode.WebviewPanel,
        token: vscode.CancellationToken,
    ): Promise<void> {
        await this.configurePanel(document.uri, panel, 'edit', token);
    }

    /** A temporary runtime exports the initial document before the target is
     * created. Closing its panel cancels queued work and prevents openWith. */
    public async createDrawing(uri: vscode.Uri): Promise<void> {
        const panel = vscode.window.createWebviewPanel('drawmotive.create', 'Creating DrawMotive diagram', vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        let completed = false;
        let closed = false;
        try {
            await new Promise<void>((resolve, reject) => {
                panel.onDidDispose(() => { closed = true; if (!completed) reject(new Error('Drawing creation cancelled.')); });
                this.configurePanel(uri, panel, 'create', undefined, () => { completed = true; resolve(); }, reject).catch(reject);
            });
            if (completed && !closed) await vscode.commands.executeCommand('vscode.openWith', uri, 'drawmotive.editor');
        } catch (error) {
            if (!(error instanceof Error && error.message === 'Drawing creation cancelled.')) {
                await vscode.window.showErrorMessage(`Failed to create drawing: ${error}`);
            }
        } finally { panel.dispose(); }
    }

    private async configurePanel(
        uri: vscode.Uri,
        panel: vscode.WebviewPanel,
        mode: 'edit' | 'create',
        token?: vscode.CancellationToken,
        completed?: () => void,
        failed?: (error: Error) => void,
    ): Promise<void> {
        let disposed = false;
        const resources: vscode.Disposable[] = [];
        const onDispose = panel.onDidDispose(() => { disposed = true; resources.forEach(resource => resource.dispose()); });
        resources.push(onDispose);
        if (token) resources.push(token.onCancellationRequested(() => panel.dispose()));
        const host = await this.assetServer.start();
        const assetBaseUrl = (await vscode.env.asExternalUri(vscode.Uri.parse(host.url))).toString();
        if (disposed) return;
        if (token?.isCancellationRequested) { panel.dispose(); return; }
        this.assetServer.allowForwardedOrigin(assetBaseUrl);
        const assets = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
        panel.webview.options = { enableScripts: true, localResourceRoots: [assets] };
        const sessionId = randomUUID();
        let creationWritten = false;
        const file = new EditorFileSession(sessionId, mode, {
            read: () => Promise.resolve(vscode.workspace.fs.readFile(uri)),
            write: bytes => Promise.resolve(vscode.workspace.fs.writeFile(uri, bytes)),
        }, message => {
            if (message.type === 'createdSaved') creationWritten = true;
            return Promise.resolve(panel.webview.postMessage(message));
        });
        resources.push({ dispose: () => file.dispose() });
        resources.push(panel.webview.onDidReceiveMessage(async message => {
            if (!file.accepts(message)) return;
            if (message.type === 'confirmReload' && typeof message.requestId === 'string') {
                const choice = await vscode.window.showWarningMessage('This diagram changed on disk. Reload and discard your unsaved changes?', { modal: true }, 'Reload');
                if (!disposed) await panel.webview.postMessage({ type: 'reloadDecision', requestId: message.requestId, reload: choice === 'Reload', sessionId });
            } else if (message.type === 'creationComplete' && mode === 'create' && creationWritten) {
                completed?.();
            } else if (message.type === 'error' && typeof message.error === 'string') {
                if (mode === 'create') failed?.(new Error(message.error));
                else await vscode.window.showErrorMessage(`DrawMotive: ${message.error}`);
            } else await file.receive(message);
        }));
        if (mode === 'edit') {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), uri.path.split('/').pop()!));
            const changed = () => { void file.fileChanged(); };
            resources.push(watcher, watcher.onDidChange(changed), watcher.onDidCreate(changed), watcher.onDidDelete(changed));
        }
        panel.webview.html = editorWebviewHtml({
            assetBaseUrl, sessionId, mode, cspSource: panel.webview.cspSource,
            scriptUrl: panel.webview.asWebviewUri(vscode.Uri.joinPath(assets, 'editor.js')).toString(),
        });
    }
}
