const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EditorFileSession } = require('../out/EditorFileSession');
const tick = () => new Promise(resolve => setImmediate(resolve));
const bytes = value => Buffer.from(value);

function fileSession(options = {}) {
    let content = bytes('complete initial PNG');
    const messages = [];
    const writes = [];
    let reads = 0;
    const session = new EditorFileSession('session', options.mode ?? 'edit', {
        read: async () => { reads++; return content; },
        write: async value => {
            writes.push(Buffer.from(value));
            if (options.write) await options.write(value);
            content = Buffer.from(value);
        },
    }, async message => { messages.push(message); });
    const send = message => session.receive({ sessionId: 'session', ...message });
    return { session, send, messages, writes, reads: () => reads, setFile: value => { content = bytes(value); } };
}

test('file transport reads and writes full binary bytes without PNG decoding', async () => {
    const f = fileSession();
    await f.send({ type: 'ready' });
    assert.equal(f.messages[0].png, bytes('complete initial PNG').toString('base64'));
    const complete = Buffer.from([137, 80, 78, 71, 0, 255, 128, 1]);
    await f.send({ type: 'save', requestId: 'request', revision: 'opaque-revision', png: complete.toString('base64') });
    assert.deepEqual(f.writes, [complete]);
    assert.deepEqual(f.messages.at(-1), { type: 'saved', requestId: 'request', revision: 'opaque-revision', sessionId: 'session' });
    await f.session.fileChanged();
    assert.equal(f.messages.length, 2);
    f.setFile('external');
    await f.session.fileChanged();
    assert.equal(f.messages.at(-1).type, 'external');
    assert.equal(f.messages.at(-1).png, bytes('external').toString('base64'));
    f.setFile('complete initial PNG');
    await f.session.fileChanged();
    assert.equal(f.messages.at(-1).png, bytes('complete initial PNG').toString('base64'));
});

test('save acknowledgment and watcher read occur only after successful file write', async () => {
    let finish;
    const f = fileSession({ write: () => new Promise(resolve => { finish = resolve; }) });
    await f.send({ type: 'ready' });
    const save = f.send({ type: 'save', requestId: 'request', revision: 'revision', png: bytes('saved').toString('base64') });
    await tick();
    const changed = f.session.fileChanged();
    assert.equal(f.messages.length, 1);
    assert.equal(f.reads(), 1);
    finish();
    await Promise.all([save, changed]);
    assert.equal(f.messages.at(-1).type, 'saved');
    assert.equal(f.messages.length, 2);
    assert.equal(f.reads(), 2);
});

test('failed persistence reports the exact snapshot and does not suppress later external data', async () => {
    const f = fileSession({ write: async () => { throw new Error('Disk full'); } });
    await f.send({ type: 'save', requestId: 'request', revision: 'revision', png: bytes('attempted').toString('base64') });
    assert.equal(f.messages[0].type, 'saveFailed');
    assert.equal(f.messages[0].requestId, 'request');
    assert.equal(f.messages[0].revision, 'revision');
    f.setFile('attempted');
    await f.session.fileChanged();
    assert.equal(f.messages.at(-1).type, 'external');
});

test('foreign sessions, malformed transport, and reused request IDs cannot write', async () => {
    const f = fileSession();
    const message = { type: 'save', requestId: 'request', revision: 'revision', png: bytes('complete').toString('base64') };
    await f.send({ ...message, sessionId: 'foreign' });
    await f.send({ ...message, png: '%%%'});
    await f.send(message);
    await f.send({ ...message, png: bytes('replacement').toString('base64') });
    await f.send({ ...message, revision: 'other' });
    assert.deepEqual(f.writes, [bytes('complete')]);
    assert.equal(f.messages[0].type, 'saveFailed');
});

test('creation skips nonexistent target reads and accepts only exported PNG creation', async () => {
    const f = fileSession({ mode: 'create' });
    await f.send({ type: 'ready' });
    await f.session.fileChanged();
    await f.send({ type: 'save', requestId: 'wrong', revision: 'blank', png: bytes('png').toString('base64') });
    assert.equal(f.reads(), 0);
    assert.equal(f.writes.length, 0);
    await f.send({ type: 'createFile', requestId: 'create', revision: 'blank', png: bytes('blank PNG with document').toString('base64') });
    assert.deepEqual(f.writes, [bytes('blank PNG with document')]);
    assert.equal(f.messages.at(-1).type, 'createdSaved');
});

test('closing a session prevents pending file writes and late acknowledgments', async () => {
    const f = fileSession();
    const save = f.send({ type: 'save', requestId: 'request', revision: 'revision', png: bytes('png').toString('base64') });
    f.session.dispose();
    await save;
    assert.equal(f.writes.length, 0);
    assert.equal(f.messages.length, 0);
});
