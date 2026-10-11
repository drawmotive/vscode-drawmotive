const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ writeError = false } = {}) {
    const panels = [];
    const reads = [];
    const writes = [];
    const commands = [];
    const errors = [];
    const uri = value => ({ path: value, fsPath: value, toString: () => value });
    const disposable = () => ({ dispose() {} });
    const panel = () => {
        const disposeHandlers = [];
        let listener;
        const result = {
            disposed: false,
            messages: [],
            onDidDispose: handler => { disposeHandlers.push(handler); return disposable(); },
            dispose: () => { if (result.disposed) return; result.disposed = true; disposeHandlers.forEach(handler => handler()); },
            webview: {
                cspSource: 'https://webview.example',
                options: {},
                html: '',
                asWebviewUri: value => uri(`https://webview.example${value.path}`),
                onDidReceiveMessage: handler => { listener = handler; return disposable(); },
                postMessage: async message => { result.messages.push(message); return true; },
            },
            send: message => listener(message),
            sessionId: () => JSON.parse(result.webview.html.split('id="editor-config"')[1].split('</script>')[0].slice(result.webview.html.split('id="editor-config"')[1].indexOf('>') + 1)).sessionId,
        };
        return result;
    };
    const vscode = {
        Uri: { parse: uri, joinPath: (value, ...parts) => uri(path.posix.join(value.path, ...parts)) },
        ViewColumn: { Active: 1 },
        RelativePattern: class {},
        env: { asExternalUri: async value => value },
        commands: { executeCommand: async (...args) => { commands.push(args); } },
        window: {
            createWebviewPanel: () => { const result = panel(); panels.push(result); return result; },
            showErrorMessage: async error => { errors.push(error); },
            showWarningMessage: async () => undefined,
        },
        workspace: {
            fs: {
                readFile: async value => { reads.push(value); return Buffer.from('full file bytes'); },
                writeFile: async (value, bytes) => { if (writeError) throw new Error('Disk full'); writes.push({ uri: value, bytes: Buffer.from(bytes) }); },
            },
            createFileSystemWatcher: () => ({ ...disposable(), onDidChange: disposable, onDidCreate: disposable, onDidDelete: disposable }),
        },
    };
    const filename = path.resolve('out/DrawmotiveEditorProvider.js');
    const realRequire = createRequire(filename);
    const exported = {};
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports: exported, require: name => name === 'vscode' ? vscode : realRequire(name), console, Error });
    const provider = new exported.DrawmotiveEditorProvider({ extensionUri: uri('/extension'), subscriptions: [] }, { start: async () => ({ url: 'http://127.0.0.1:123/token/' }), allowForwardedOrigin() {} });
    return { provider, panels, writes, reads, commands, errors, uri };
}

test('new drawing writes no placeholder and opens only after successful runtime creation cleanup', async () => {
    const h = harness();
    const creating = h.provider.createDrawing(h.uri('/drawing.draw.png'));
    await tick();
    const panel = h.panels[0];
    const sessionId = panel.sessionId();
    await panel.send({ type: 'ready', sessionId });
    await panel.send({ type: 'creationComplete', sessionId });
    assert.equal(h.writes.length, 0);
    assert.equal(h.reads.length, 0);
    assert.equal(h.commands.length, 0);
    const png = Buffer.from('WASM exported complete PNG');
    await panel.send({ type: 'createFile', requestId: 'create', revision: 'blank', png: png.toString('base64'), sessionId });
    assert.deepEqual(h.writes[0].bytes, png);
    assert.equal(h.commands.length, 0);
    assert.equal(panel.messages.at(-1).type, 'createdSaved');
    await panel.send({ type: 'creationComplete', sessionId });
    await creating;
    assert.equal(h.commands[0][0], 'vscode.openWith');
    assert.equal(h.commands[0][2], 'drawmotive.editor');
    assert.equal(panel.disposed, true);
    assert.deepEqual(Array.from(panel.webview.options.localResourceRoots, value => value.path), ['/extension/dist/webview']);
});

test('closing creation panel cancels queued writes and never opens the editor', async () => {
    const h = harness();
    const creating = h.provider.createDrawing(h.uri('/drawing.draw.png'));
    await tick();
    const panel = h.panels[0];
    const sessionId = panel.sessionId();
    const write = panel.send({ type: 'createFile', requestId: 'create', revision: 'blank', png: Buffer.from('png').toString('base64'), sessionId });
    panel.dispose();
    await Promise.all([creating, write]);
    assert.equal(h.writes.length, 0);
    assert.equal(h.commands.length, 0);
    assert.equal(h.errors.length, 0);
});

test('failed creation persistence cannot authorize an editor open', async () => {
    const h = harness({ writeError: true });
    const creating = h.provider.createDrawing(h.uri('/drawing.draw.png'));
    await tick();
    const panel = h.panels[0];
    const sessionId = panel.sessionId();
    await panel.send({ type: 'createFile', requestId: 'create', revision: 'blank', png: Buffer.from('png').toString('base64'), sessionId });
    assert.equal(panel.messages.at(-1).type, 'saveFailed');
    await panel.send({ type: 'creationComplete', sessionId });
    assert.equal(h.commands.length, 0);
    await panel.send({ type: 'error', error: 'Disk full', sessionId });
    await creating;
    assert.equal(h.commands.length, 0);
    assert.match(h.errors[0], /Disk full/);
    assert.equal(panel.disposed, true);
});
