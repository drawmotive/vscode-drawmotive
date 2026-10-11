import * as vscode from 'vscode';
import { DrawmotiveEditorProvider } from './DrawmotiveEditorProvider';
import { EditorAssetServer } from './EditorAssetServer';

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
            filters: {
                'Drawmotive Diagrams': ['draw.png']
            },
            saveLabel: 'Create Drawing'
        });

        if (uri) {
            await provider.createDrawing(uri);
        }
    });
    context.subscriptions.push(newDrawingCommand);
}

export function deactivate() {
    console.log('Drawmotive extension deactivated');
}
