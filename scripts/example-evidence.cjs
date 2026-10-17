const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Bind the editable document and overview to the source validated by rendering.
 * Capture must reject stale artifacts before opening the isolated workspace. */
function verifyExample(record, { source, drawing, preview }) {
    assert.ok(record.editor, 'Render evidence must identify the locked Editor');
    assert.equal(record.sourceSha256, hash(source), 'Rendered example source is stale');
    assert.equal(record.drawingSha256, hash(drawing), 'Rendered editable PNG is stale');
    assert.equal(record.previewSha256, hash(preview), 'Rendered overview PNG is stale');
    return record;
}

module.exports = { hash, verifyExample };
