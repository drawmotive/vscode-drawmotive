import * as vscode from 'vscode';
import { DrawmotiveEditorProvider } from './DrawmotiveEditorProvider';
import { EditorAssetServer } from './EditorAssetServer';
import { drawingPath } from './drawingPath';

export function activate(context: vscode.ExtensionContext) {
    console.log('Drawmotive extension activated');

    // Register the custom editor provider for .draw.png files
    const assetServer = new EditorAssetServer(vscode.Uri.joinPath(context.extensionUri, 'dist', 'editor').fsPath);
    context.subscriptions.push(assetServer);
    const provider = new DrawmotiveEditorProvider(context, assetServer);
    const registration = vscode.window.registerCustomEditorProvider(
        'drawmotive.editor',
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            },
            supportsMultipleEditorsPerDocument: false
        }
    );
    context.subscriptions.push(registration);

    // Register command to create new drawing
    const newDrawingCommand = vscode.commands.registerCommand('drawmotive.newDrawing', async () => {
        const uri = await vscode.window.showSaveDialog({
            // Dialog extensions describe the PNG container; automatic editor
            // association is restricted to *.draw.png by package.json.
            filters: {
                'Drawmotive Diagrams': ['png']
            },
            saveLabel: 'Create Drawing'
        });

        if (uri) {
            const target = uri.with({ path: drawingPath(uri.path) });
            if (target.path !== uri.path) {
                // The dialog confirmed uri, not the normalized target. Never
                // overwrite a different existing file without that confirmation.
                try {
                    await vscode.workspace.fs.stat(target);
                    await vscode.window.showErrorMessage(`A drawing already exists at ${target.fsPath}. Select that file explicitly to replace it.`);
                    return;
                } catch (error) {
                    if (!(error instanceof vscode.FileSystemError && error.code === 'FileNotFound')) throw error;
                }
            }
            await provider.createDrawing(target);
        }
    });
    context.subscriptions.push(newDrawingCommand);
}

export function deactivate() {
    console.log('Drawmotive extension deactivated');
}
