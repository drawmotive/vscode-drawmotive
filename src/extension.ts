import * as vscode from 'vscode';
import { DrawmotiveEditorProvider } from './DrawmotiveEditorProvider';
import { createEmptyPng } from './pngMetadata';

export function activate(context: vscode.ExtensionContext) {
    console.log('Drawmotive extension activated');

    // Register the custom editor provider for .draw.png files
    const provider = new DrawmotiveEditorProvider(context);
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
            // Create a valid empty PNG file (not 0 bytes)
            const emptyPngData = createEmptyPng();
            await vscode.workspace.fs.writeFile(uri, emptyPngData);

            // Open the newly created file in the editor
            await vscode.commands.executeCommand('vscode.openWith', uri, 'drawmotive.editor');
        }
    });
    context.subscriptions.push(newDrawingCommand);
}

export function deactivate() {
    console.log('Drawmotive extension deactivated');
}
