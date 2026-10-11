const assert = require('node:assert/strict');
const { test } = require('node:test');
const { drawingPath } = require('../out/drawingPath');

test('file dialog paths have exactly one compound document suffix', () => {
    for (const [input, expected] of [
        ['/workspace/diagram.draw.png', '/workspace/diagram.draw.png'],
        ['/workspace/diagram.png', '/workspace/diagram.draw.png'],
        ['/workspace/diagram', '/workspace/diagram.draw.png'],
        ['/workspace/diagrampng', '/workspace/diagrampng.draw.png'],
        ['/workspace/diagram.DRAW.PNG', '/workspace/diagram.DRAW.PNG'],
        ['/workspace/folder.png/diagram.png', '/workspace/folder.png/diagram.draw.png'],
    ]) assert.equal(drawingPath(input), expected);
});
