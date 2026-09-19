import * as vscode from 'vscode';
import { readPngMetadata, writePngWithMetadata } from './pngMetadata';
import { EditorAssetServer } from './EditorAssetServer';
import { editorWebviewHtml } from './editorWebview';

/**
 * Provider for Drawmotive custom editor that handles .draw.png files (binary PNG format)
 */
export class DrawmotiveEditorProvider implements vscode.CustomReadonlyEditorProvider {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly assetServer: EditorAssetServer,
    ) {}

    public async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    public async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        const host = await this.assetServer.start();
        // Resolve the actual client origin before CSP/message checks: remote
        // tunnels may allocate a different port from the extension-host listener.
        const externalUrl = (await vscode.env.asExternalUri(vscode.Uri.parse(host.url))).toString();
        this.assetServer.allowForwardedOrigin(externalUrl);
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [],
        };

        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'ready':
                        await this.updateWebview(document.uri, webviewPanel.webview);
                        break;
                    case 'update':
                        try {
                            await this.updateDocument(document.uri, message.data);
                            await webviewPanel.webview.postMessage({ type: 'saved' });
                        } catch (error) {
                            const message = `Failed to save diagram: ${error}`;
                            await webviewPanel.webview.postMessage({ type: 'error', error: message });
                            vscode.window.showErrorMessage(message);
                        }
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(`Drawmotive: ${message.error}`);
                        break;
                }
            },
            null,
            this.context.subscriptions
        );

        webviewPanel.webview.html = editorWebviewHtml(externalUrl);

        // Watch for external file changes
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, '..'), document.uri.path.split('/').pop()!)
        );
        watcher.onDidChange(async () => {
            await this.updateWebview(document.uri, webviewPanel.webview);
        });
        webviewPanel.onDidDispose(() => {
            watcher.dispose();
        });
    }

    private async updateWebview(fileUri: vscode.Uri, webview: vscode.Webview): Promise<void> {
        try {
            // Read file as binary PNG data
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            console.log(`[DrawmotiveEditorProvider] Read file: ${fileData.length} bytes`);

            let diagramData = '';
            if (fileData.length > 0) {
                const metadata = await readPngMetadata(Buffer.from(fileData));
                console.log(`[DrawmotiveEditorProvider] Extracted metadata: ${metadata ? metadata.substring(0, 100) + '...' : 'null'}`);
                if (metadata) {
                    diagramData = metadata;
                }
            }

            console.log(`[DrawmotiveEditorProvider] Sending init message with diagramData length: ${diagramData.length}`);
            webview.postMessage({
                type: 'init',
                data: {
                    fileId: fileUri.fsPath,
                    diagramData: diagramData,
                    pngData: fileData.length > 0 ? Buffer.from(fileData).toString('base64') : ''
                }
            });
        } catch (error) {
            console.error('Error updating webview:', error);
            webview.postMessage({
                type: 'error',
                error: `Failed to load diagram: ${error}`
            });
        }
    }

    private async updateDocument(fileUri: vscode.Uri, data: unknown): Promise<void> {
        if (!data || typeof data !== 'object' || !('raw' in data) || !('png' in data)
            || typeof data.raw !== 'string' || typeof data.png !== 'string' || !data.raw || !data.png) {
            throw new Error('Missing required data fields (raw or png)');
        }
        const finalPngBuffer = await writePngWithMetadata(Buffer.from(data.png, 'base64'), data.raw);
        await vscode.workspace.fs.writeFile(fileUri, finalPngBuffer);
    }
}
