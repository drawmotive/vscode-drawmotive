import * as vscode from 'vscode';
import { readPngMetadata, writePngWithMetadata } from './pngMetadata';

/**
 * Provider for Drawmotive custom editor that handles .draw.png files (binary PNG format)
 */
export class DrawmotiveEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static readonly viewType = 'drawmotive.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

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
        // Setup webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'ready':
                        await this.updateWebview(document.uri, webviewPanel.webview);
                        break;
                    case 'update':
                        await this.updateDocument(document.uri, message.data);
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(`Drawmotive: ${message.error}`);
                        break;
                }
            },
            null,
            this.context.subscriptions
        );

        // Watch for external file changes
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(document.uri, '*')
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

    private async updateDocument(fileUri: vscode.Uri, data: any): Promise<void> {
        try {
            console.log('[DrawmotiveEditorProvider] updateDocument called with data:', data);
            const { raw, png } = data;

            if (!raw || !png) {
                console.error('[DrawmotiveEditorProvider] Missing data fields:', { hasRaw: !!raw, hasPng: !!png });
                throw new Error('Missing required data fields (raw or png)');
            }

            console.log(`[DrawmotiveEditorProvider] Received raw data length: ${raw.length}, png data length: ${png.length}`);
            const pngBuffer = Buffer.from(png, 'base64');
            console.log(`[DrawmotiveEditorProvider] Decoded PNG buffer: ${pngBuffer.length} bytes`);

            const finalPngBuffer = await writePngWithMetadata(pngBuffer, raw);
            console.log(`[DrawmotiveEditorProvider] Final PNG with metadata: ${finalPngBuffer.length} bytes`);

            // Write binary PNG data directly to file
            await vscode.workspace.fs.writeFile(fileUri, finalPngBuffer);
            console.log('[DrawmotiveEditorProvider] File written successfully');
        } catch (error) {
            console.error('Error updating document:', error);
            vscode.window.showErrorMessage(`Failed to save diagram: ${error}`);
        }
    }

    private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const indexPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor', 'index.html');
        const indexBytes = await vscode.workspace.fs.readFile(indexPath);
        let html = Buffer.from(indexBytes).toString('utf8');

        const editorUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor')
        );

        // Convert relative paths to absolute webview URIs
        html = html.replace(/href="([^"]+)"/g, (match, path) => {
            if (path.startsWith('http')) return match;
            return `href="${editorUri}/${path}"`;
        });

        html = html.replace(/src="([^"]+)"/g, (match, path) => {
            if (path.startsWith('http')) return match;
            return `src="${editorUri}/${path}"`;
        });

        // Add CSP
        html = html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval';
        script-src-elem ${webview.cspSource} 'unsafe-inline';
        style-src ${webview.cspSource} 'unsafe-inline';
        img-src ${webview.cspSource} data: blob:;
        font-src ${webview.cspSource};
        connect-src ${webview.cspSource} http://localhost data: blob:;
        worker-src ${webview.cspSource} blob:;
        child-src ${webview.cspSource} blob:;
    ">`);

        return html;
    }
}
