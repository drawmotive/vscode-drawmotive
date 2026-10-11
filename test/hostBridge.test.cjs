const assert = require('node:assert/strict');
const { test } = require('node:test');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function host(options = {}) {
    const { startEditorSession } = await import('../webview/editor-session.mjs');
    const messages = [];
    const replacements = [];
    const actionStates = [];
    const calls = [];
    const status = {};
    let config;
    let subscriber;
    let disposed = 0;
    let state = { revision: 'empty', health: 'healthy', editingEnabled: true, busy: false, canUndo: false, canRedo: false };
    const emit = changes => { state = { ...state, ...changes }; subscriber?.(state); };
    const editor = {
        onStateChanged: listener => { subscriber = listener; listener(state); return () => { subscriber = undefined; }; },
        getState: async () => state,
        setActionState: async (id, value) => actionStates.push({ id, ...value }),
        setEditingEnabled: async enabled => { calls.push(['editing', enabled]); emit({ editingEnabled: enabled }); },
        replacePngDocument: async png => {
            calls.push(['replace', png]);
            if (options.replaceTimeout && png === 'delayed') {
                const error = new Error('Operation result unknown');
                error.code = 'RequestTimeoutUnknown';
                error.completion = options.replaceTimeout().then(() => { replacements.push(png); emit({ revision: `loaded-${replacements.length}` }); return { result: null }; });
                throw error;
            }
            if (png === 'invalid') throw new Error('Invalid embedded document');
            replacements.push(png);
            emit({ revision: `loaded-${replacements.length}` });
        },
        fitViewport: async () => { calls.push(['fit']); },
        exportSnapshot: async exportOptions => {
            calls.push(['export', exportOptions]);
            if (options.exportError) throw new Error('Export failed');
            return { revision: state.revision, png: { base64: `PNG-${state.revision}` } };
        },
        dispose: async () => { disposed++; },
    };
    const session = startEditorSession({
        createEditor: async value => { config = value; if (options.startupError) throw new Error('Startup failed'); return editor; },
        vscode: { postMessage: message => messages.push(message) }, container: {}, status,
        assetBaseUrl: 'http://127.0.0.1:123/token/', sessionId: 'session', mode: options.mode,
    });
    if (options.mode !== 'create') await session.ready.catch(() => {});
    await tick();
    const receive = async message => { session.receive({ sessionId: 'session', ...message }); await tick(); };
    return { session, receive, messages, replacements, calls, status, actionStates, config, emit, disposed: () => disposed, state: () => state };
}

async function loadedHost(t, options) {
    const result = await host(options);
    t.after(() => result.session.dispose());
    await result.receive({ type: 'load', png: 'initial' });
    return result;
}

test('direct SDK host declares product Save, imports complete PNG, and fits without changing baseline', async t => {
    const h = await loadedHost(t);
    assert.deepEqual(h.config.modules, { analytics: false, authentication: false, remoteSync: false });
    assert.equal(h.config.assetBaseUrl, 'http://127.0.0.1:123/token/');
    assert.equal(h.config.ui.actions[0].id, 'host.save');
    assert.deepEqual(h.replacements, ['initial']);
    assert.equal(h.status.textContent, 'Ready');
    assert.equal(h.actionStates.at(-1).enabled, true);
    assert.deepEqual(h.calls.slice(-4), [['editing', false], ['replace', 'initial'], ['fit'], ['editing', true]]);
});

test('Save awaits the exact acknowledgment and keeps edits after its snapshot dirty', async t => {
    const h = await loadedHost(t);
    h.emit({ revision: 'edited' });
    const saving = h.config.ui.actions[0].onInvoke({ signal: new AbortController().signal });
    let completed = false;
    saving.then(() => { completed = true; });
    await tick();
    const request = h.messages.find(message => message.type === 'save');
    assert.equal(request.png, 'PNG-edited');
    assert.equal(request.revision, 'edited');
    assert.deepEqual(h.calls.find(call => call[0] === 'export')[1], { formats: ['png'], png: { embedDocument: true } });
    assert.equal(h.state().editingEnabled, true);
    await h.receive({ type: 'saved', requestId: 'other', revision: request.revision });
    await h.receive({ type: 'saved', requestId: request.requestId, revision: 'other' });
    assert.equal(completed, false);
    h.emit({ revision: 'later-edit' });
    await h.receive({ type: 'saved', requestId: request.requestId, revision: request.revision });
    await saving;
    assert.equal(h.status.textContent, 'Unsaved changes');
    assert.equal(h.actionStates.at(-1).enabled, true);
    assert.equal(h.replacements.length, 1);
});

test('successful save establishes its source, while a disk revert is a real replacement', async t => {
    const h = await loadedHost(t);
    h.emit({ revision: 'edited' });
    const saving = h.config.ui.actions[0].onInvoke();
    await tick();
    const request = h.messages.find(message => message.type === 'save');
    await h.receive({ type: 'saved', requestId: request.requestId, revision: request.revision });
    await saving;
    assert.equal(h.status.textContent, 'Saved');
    await h.receive({ type: 'external', png: request.png });
    assert.deepEqual(h.replacements, ['initial']);
    await h.receive({ type: 'external', png: 'initial' });
    assert.deepEqual(h.replacements, ['initial', 'initial']);
    assert.equal(h.status.textContent, 'Ready');
});

test('save failure preserves dirty data and permits a new save request', async t => {
    const h = await loadedHost(t);
    h.emit({ revision: 'edited' });
    const saving = h.config.ui.actions[0].onInvoke();
    const rejected = assert.rejects(saving, /Disk full/);
    await tick();
    const request = h.messages.find(message => message.type === 'save');
    await h.receive({ type: 'saveFailed', requestId: request.requestId, revision: request.revision, error: 'Disk full' });
    await rejected;
    assert.equal(h.status.textContent, 'Disk full');
    assert.equal(h.actionStates.at(-1).enabled, true);
    assert.equal(h.state().revision, 'edited');
    const retry = h.config.ui.actions[0].onInvoke();
    await tick();
    const next = h.messages.filter(message => message.type === 'save').at(-1);
    assert.notEqual(next.requestId, request.requestId);
    await h.receive({ type: 'saved', requestId: next.requestId, revision: next.revision });
    await retry;
    assert.equal(h.status.textContent, 'Saved');
});

test('external replacement freezes dirty edits until a correlated reload decision', async t => {
    const h = await loadedHost(t);
    h.emit({ revision: 'unsaved' });
    await h.receive({ type: 'external', png: 'external' });
    const request = h.messages.find(message => message.type === 'confirmReload');
    assert.ok(request);
    assert.equal(h.state().editingEnabled, false);
    assert.deepEqual(h.replacements, ['initial']);
    await h.receive({ type: 'reloadDecision', requestId: 'wrong', reload: true });
    assert.deepEqual(h.replacements, ['initial']);
    await h.receive({ type: 'reloadDecision', requestId: request.requestId, reload: false });
    assert.deepEqual(h.replacements, ['initial']);
    assert.equal(h.state().revision, 'unsaved');
    assert.equal(h.state().editingEnabled, true);
    await h.receive({ type: 'external', png: 'external-next' });
    const next = h.messages.filter(message => message.type === 'confirmReload').at(-1);
    await h.receive({ type: 'reloadDecision', requestId: next.requestId, reload: true });
    assert.deepEqual(h.replacements, ['initial', 'external-next']);
    assert.equal(h.state().editingEnabled, true);
    assert.equal(h.status.textContent, 'Ready');
});

test('invalid external PNG retains the same instance, document and editing gate', async t => {
    const h = await loadedHost(t);
    const revision = h.state().revision;
    await h.receive({ type: 'external', png: 'invalid' });
    assert.equal(h.state().revision, revision);
    assert.equal(h.state().editingEnabled, true);
    assert.deepEqual(h.replacements, ['initial']);
    assert.equal(h.disposed(), 0);
    assert.match(h.status.textContent, /Invalid embedded document/);
    await h.receive({ type: 'external', png: 'valid-next' });
    assert.deepEqual(h.replacements, ['initial', 'valid-next']);
});

test('external updates arriving during save wait for write acknowledgment', async t => {
    const h = await loadedHost(t);
    h.emit({ revision: 'edited' });
    const saving = h.config.ui.actions[0].onInvoke();
    await tick();
    const request = h.messages.find(message => message.type === 'save');
    await h.receive({ type: 'external', png: 'external' });
    assert.deepEqual(h.replacements, ['initial']);
    await h.receive({ type: 'saved', requestId: request.requestId, revision: request.revision });
    await saving;
    await tick();
    assert.deepEqual(h.replacements, ['initial', 'external']);
});

test('timed out replacement waits for its late result before restoring editing and baseline', async t => {
    let finish;
    const h = await loadedHost(t, { replaceTimeout: () => new Promise(resolve => { finish = resolve; }) });
    await h.receive({ type: 'external', png: 'delayed' });
    assert.equal(h.state().editingEnabled, false);
    assert.deepEqual(h.replacements, ['initial']);
    assert.equal(h.status.textContent, 'Loading diagram…');
    finish();
    await tick();
    assert.deepEqual(h.replacements, ['initial', 'delayed']);
    assert.equal(h.state().editingEnabled, true);
    assert.equal(h.status.textContent, 'Ready');
});

test('foreign sessions cannot load or acknowledge saves', async t => {
    const h = await loadedHost(t);
    await h.receive({ type: 'external', sessionId: 'foreign', png: 'foreign' });
    assert.deepEqual(h.replacements, ['initial']);
    const saving = h.config.ui.actions[0].onInvoke();
    await tick();
    const request = h.messages.find(message => message.type === 'save');
    await h.receive({ type: 'saved', sessionId: 'foreign', requestId: request.requestId, revision: request.revision });
    assert.equal(h.status.textContent, 'Saving…');
    await h.receive({ type: 'saved', requestId: request.requestId, revision: request.revision });
    await saving;
});

test('creation exports blank runtime PNG, waits for write, then disposes before completion', async t => {
    const h = await host({ mode: 'create' });
    t.after(() => h.session.dispose());
    assert.equal(h.messages.some(message => message.type === 'ready'), false);
    assert.deepEqual(h.replacements, []);
    assert.deepEqual(h.config.ui.actions, []);
    const request = h.messages.find(message => message.type === 'createFile');
    assert.ok(request);
    assert.equal(request.png, 'PNG-empty');
    assert.equal(h.disposed(), 0);
    assert.equal(h.messages.some(message => message.type === 'creationComplete'), false);
    await h.receive({ type: 'createdSaved', requestId: request.requestId, revision: request.revision });
    await h.session.ready;
    assert.equal(h.disposed(), 1);
    assert.equal(h.messages.at(-1).type, 'creationComplete');
});

test('failed or cancelled creation cannot complete or write placeholder data', async t => {
    const failed = await host({ mode: 'create', startupError: true });
    t.after(() => failed.session.dispose());
    await assert.rejects(failed.session.ready, /Startup failed/);
    assert.deepEqual(failed.messages.map(message => message.type), ['error']);
    const cancelled = await host({ mode: 'create' });
    const request = cancelled.messages.find(message => message.type === 'createFile');
    const rejection = assert.rejects(cancelled.session.ready, /Editor closed/);
    await cancelled.session.dispose();
    await cancelled.receive({ type: 'createdSaved', requestId: request.requestId, revision: request.revision });
    await rejection;
    assert.equal(cancelled.messages.some(message => message.type === 'creationComplete'), false);
});
