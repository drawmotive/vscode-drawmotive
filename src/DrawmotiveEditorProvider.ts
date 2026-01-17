import * as vscode from 'vscode';
import * as path from 'path';
import { readPngMetadata, writePngWithMetadata } from './pngMetadata';

/**
 * Provider for Drawmotive custom editor that handles .draw.png files
 */
export class DrawmotiveEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'drawmotive.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Called when the custom editor is opened
     */
    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Setup webview options
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        // Set webview HTML content
        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'ready':
                        // Webview is ready, send initial data
                        await this.updateWebview(document, webviewPanel.webview);
                        break;
                    case 'update':
                        // Received update from webview, save to document
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

        // Send initial data
        await this.updateWebview(document, webviewPanel.webview);
    }

    /**
     * Updates the webview with data from the document
     */
    private async updateWebview(document: vscode.TextDocument, webview: vscode.Webview): Promise<void> {
        try {
            const fileUri = document.uri;
            const fileData = await vscode.workspace.fs.readFile(fileUri);

            let diagramData = '';

            if (fileData.length > 0) {
                // Try to extract metadata from PNG
                const metadata = await readPngMetadata(Buffer.from(fileData));
                if (metadata) {
                    diagramData = metadata;
                }
            }

            webview.postMessage({
                type: 'init',
                data: {
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

    /**
     * Updates the document with data from the webview
     */
    private async updateDocument(document: vscode.TextDocument, data: any): Promise<void> {
        try {
            const { raw, png, width, height } = data;

            if (!raw || !png) {
                throw new Error('Missing required data fields (raw or png)');
            }

            // Decode base64 PNG image
            const pngBuffer = Buffer.from(png, 'base64');

            // Write PNG with embedded metadata
            const finalPngBuffer = await writePngWithMetadata(pngBuffer, raw);

            // Update the document
            const edit = new vscode.WorkspaceEdit();
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );

            // Convert buffer to base64 for text document
            const base64Content = finalPngBuffer.toString('base64');
            edit.replace(document.uri, fullRange, base64Content);

            // Apply the edit
            const success = await vscode.workspace.applyEdit(edit);

            if (!success) {
                throw new Error('Failed to apply edit to document');
            }

            // Save the document
            await document.save();
        } catch (error) {
            console.error('Error updating document:', error);
            vscode.window.showErrorMessage(`Failed to save diagram: ${error}`);
        }
    }

    /**
     * Gets the HTML content for the webview
     */
    private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        // Use the pre-built index.html from the editor
        const indexPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor', 'index.html');
        const indexBytes = await vscode.workspace.fs.readFile(indexPath);
        let html = Buffer.from(indexBytes).toString('utf8');

        // Get URI for editor resources
        const editorUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor')
        );

        const nonce = this.getNonce();

        // Convert all relative paths to webview URIs
        html = html.replace(/href="([^"]+)"/g, (match, path) => {
            if (path.startsWith('http')) return match;
            return `href="${editorUri}/${path}"`;
        });

        html = html.replace(/src="([^"]+)"/g, (match, path) => {
            if (path.startsWith('http')) return match;
            return `src="${editorUri}/${path}"`;
        });

        // Update CSP and add nonces
        html = html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline';
        style-src ${webview.cspSource} 'unsafe-inline';
        img-src ${webview.cspSource} data: blob:;
        font-src ${webview.cspSource};
        connect-src ${webview.cspSource};
        worker-src ${webview.cspSource} blob:;
    ">`);

        // Add VSCode integration script
        html = html.replace('</body>', `
    <script>
        const vscode = acquireVsCodeApi();
        window.editorCallbacks = {
            handleSave: (exportData) => {
                vscode.postMessage({ type: 'update', data: exportData });
            }
        };
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'init' && window.editorInstance) {
                if (message.data.diagramData) {
                    window.editorInstance.loadData(message.data.diagramData);
                }
            }
        });
        vscode.postMessage({ type: 'ready' });
    </script>
</body>`);

        return html;
    }

    /**
     * Generates a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
