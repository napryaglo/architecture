import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application } from '../../../runtime/index.js';
import { Figure } from '../figure.js';
import '../node-serializers-default.js';                 // side-effect: registers 'shape'
import { serializerByType, type NodeBaseRecord } from '../node-serialization.js';

function shapeSerializer() {
    const s = serializerByType('shape');
    assert.ok(s, 'shape serializer registered');
    return s!;
}

describe('shape serialize rotation + base size', () => {
    test('round-trips rotation and base size', () => {
        Application.current = null; new Application();
        const f = Figure.fromKind('rectangle', 5, 6, { width: 120, height: 60 });
        f.Rotation = 45; f.Width = 240;   // scaled 2x from base 120
        const data = shapeSerializer().serialize(f);
        assert.equal(data.rotation, 45);
        assert.equal(data.baseWidth, 120);
        assert.equal(data.baseHeight, 60);
        const base: NodeBaseRecord = { id: 'n1', left: 5, top: 6, w: 240, h: 60 };
        const back = shapeSerializer().deserialize(data, base) as Figure;
        assert.equal(back.Rotation, 45);
        assert.equal(back.BaseWidth, 120);
        assert.equal(back.BaseHeight, 60);
    });
    test('legacy record (no rotation/base) loads as rotation 0, base = size', () => {
        Application.current = null; new Application();
        const base: NodeBaseRecord = { id: 'n2', left: 0, top: 0, w: 80, h: 40 };
        const back = shapeSerializer().deserialize({ kind: 'rectangle' }, base) as Figure;
        assert.equal(back.Rotation, 0);
        assert.equal(back.BaseWidth, 80);
        assert.equal(back.BaseHeight, 40);
    });
});
