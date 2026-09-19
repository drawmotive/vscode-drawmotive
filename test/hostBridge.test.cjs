const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function bridge(failDocument) {
    const listeners = {};
    const messages = [];
    const imports = [];
    let disposals = 0;
    const parent = { postMessage: message => messages.push(message) };
    const editor = { exportDocument: async () => ({ raw: 'saved', png: 'png' }), dispose: async () => { disposals++; } };
    const context = {
        parent, window: {}, URL, URLSearchParams,
        location: { hash: '#channel=channel&parentOrigin=vscode-webview%3A%2F%2Fhost', href: 'http://127.0.0.1:123/token/host.html' },
        document: { getElementById: () => ({}) },
        initializeEditor: async options => { imports.push(options); if (options.document === failDocument) throw new Error('Invalid document'); return editor; },
        addEventListener: (name, handler) => { listeners[name] = handler; },
    };
    vm.runInNewContext(readFileSync('webview/host.js', 'utf8').split(String.fromCharCode(10)).slice(1).join(String.fromCharCode(10)), context);
    const send = async (message, overrides = {}) => {
        listeners.message({ source: parent, origin: 'vscode-webview://host', data: { ...message, channel: 'channel' }, ...overrides });
        await new Promise(resolve => setImmediate(resolve));
    };
    return { send, imports, messages, disposals: () => disposals };
}

test('public SDK bridge opens, exports, ignores saved-file echoes, and reloads external edits', async () => {
    const host = bridge();
    assert.equal(host.messages[0].type, 'ready');
    await host.send({ type: 'init', data: { diagramData: 'initial' } });
    assert.equal(host.imports[0].document, 'initial');
    assert.equal(host.imports[0].assetBaseUrl, 'http://127.0.0.1:123/token/');
    await host.send({ type: 'save' });
    assert.equal(host.messages.at(-1).data.raw, 'saved');
    await host.send({ type: 'init', data: { diagramData: 'saved' } });
    assert.equal(host.imports.length, 1);
    await host.send({ type: 'init', data: { diagramData: 'external' } });
    assert.equal(host.imports[1].document, 'external');
    assert.equal(host.disposals(), 1);
});

test('foreign windows, origins, and channels cannot import or export documents', async () => {
    const host = bridge();
    const init = { type: 'init', data: { diagramData: 'untrusted' } };
    await host.send(init, { source: {} });
    await host.send(init, { origin: 'http://foreign.example' });
    await host.send(init, { data: { ...init, channel: 'wrong' } });
    assert.equal(host.imports.length, 0);
    assert.equal(host.messages.length, 1);
});

test('restoring a valid document after a failed replacement recreates the editor', async () => {
    const host = bridge('invalid');
    await host.send({ type: 'init', data: { diagramData: 'valid' } });
    await host.send({ type: 'init', data: { diagramData: 'invalid' } });
    assert.equal(host.messages.at(-1).type, 'error');
    await host.send({ type: 'init', data: { diagramData: 'valid' } });
    assert.equal(host.imports.length, 3);
    assert.equal(host.messages.at(-1).type, 'loaded');
});
