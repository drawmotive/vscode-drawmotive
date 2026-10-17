const assert = require('node:assert/strict');
const test = require('node:test');
const { hash, verifyExample } = require('../scripts/example-evidence.cjs');

test('capture requires source, editable document and overview from one verified render', () => {
    const artifacts = { source: Buffer.from('A -> B'), drawing: Buffer.from('editable'), preview: Buffer.from('plain') };
    const record = { editor: 'test-runtime', sourceSha256: hash(artifacts.source), drawingSha256: hash(artifacts.drawing), previewSha256: hash(artifacts.preview) };
    assert.equal(verifyExample(record, artifacts), record);
    for (const key of Object.keys(artifacts)) {
        assert.throws(() => verifyExample(record, { ...artifacts, [key]: Buffer.from('stale') }), /stale/);
    }
    assert.throws(() => verifyExample({ ...record, editor: '' }, artifacts), /locked Editor/);
});
