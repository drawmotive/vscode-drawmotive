import * as vscode from 'vscode';
import { readPngMetadata, writePngWithMetadata } from './pngMetadata';

/**
 * Provider for Drawmotive custom editor that handles .draw.png files
 */
export class DrawmotiveEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'drawmotive.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
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
                        await this.updateWebview(document, webviewPanel.webview);
                        break;
                    case 'update':
                        await this.updateDocument(document, message.data);
                        break;
                    case 'error':
                        vscode.window.showErrorMessage(`Drawmotive: ${message.error}`);
                        break;
                }
            },
            null,
            this.context.subscriptions
        );

        // Update webview when document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
                this.updateWebview(document, webviewPanel.webview);
            }
        });
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });
    }

    private async updateWebview(document: vscode.TextDocument, webview: vscode.Webview): Promise<void> {
        try {
            const fileUri = document.uri;
            const fileData = await vscode.workspace.fs.readFile(fileUri);

            let diagramData = '';
            if (fileData.length > 0) {
                const metadata = await readPngMetadata(Buffer.from(fileData));
                if (metadata) {
                    diagramData = metadata;
                }
            }

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

    private async updateDocument(document: vscode.TextDocument, data: any): Promise<void> {
        try {
            const { raw, png } = data;

            if (!raw || !png) {
                throw new Error('Missing required data fields (raw or png)');
            }

            const pngBuffer = Buffer.from(png, 'base64');
            const finalPngBuffer = await writePngWithMetadata(pngBuffer, raw);

            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );

            const base64Content = finalPngBuffer.toString('base64');
            edit.replace(document.uri, fullRange, base64Content);

            const success = await vscode.workspace.applyEdit(edit);
            if (!success) {
                throw new Error('Failed to apply edit to document');
            }

            await document.save();
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
