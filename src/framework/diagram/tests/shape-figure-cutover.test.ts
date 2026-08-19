import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Point, Size, type Geometry } from '../../../visual-engine/index.js';
import { Figure } from '../figure.js';
import { DiagramDocument } from '../diagram-document.js';
import { serializerFor, serializerByType } from '../node-serialization.js';
import '../node-serializers-default.js';   // side-effect: registers serializers

test('CreateNode produces a self-painting Figure shape node', () => {
    const doc = new DiagramDocument();
    const node = doc.CreateNode('diamond', 10, 20);
    assert.ok(node instanceof Figure, 'CreateNode returns a Figure');
    assert.equal(node!.Kind, 'diamond');
    assert.ok(node!._getSource() !== undefined, 'has a silhouette source');
    assert.ok(doc.Nodes.IndexOf(node!) >= 0, 'added to Nodes');
});

test('a created diamond confines picking to its silhouette', () => {
    const doc = new DiagramDocument();
    const f = doc.CreateNode('diamond', 0, 0)!;
    f.Width = 80; f.Height = 60;
    const seams = f as unknown as { buildClipGeometry(s: Size): Geometry };
    const g = seams.buildClipGeometry(new Size(80, 60));
    assert.ok(g.Contains(new Point(40, 30)), 'interior inside');
    assert.ok(!g.Contains(new Point(2, 2)), 'bbox corner outside the diamond');
});

test('the shape serializer round-trips a Figure', () => {
    const doc = new DiagramDocument();
    const f = doc.CreateNode('ellipse', 5, 6)!;
    f.Width = 50; f.Height = 30;
    const s = serializerFor(f);
    assert.ok(s !== undefined && s.type === 'shape', 'shape serializer matches a Figure');
    const data = s!.serialize(f);
    assert.equal(data.kind, 'ellipse');
    const back = s!.deserialize(data, { id: 'n9', left: 5, top: 6, w: 50, h: 30 });
    assert.ok(back instanceof Figure);
    assert.equal((back as Figure).Kind, 'ellipse');
    assert.equal(back.Id, 'n9');
});

test('back-compat: an old shape record (kind + d) loads into a Figure', () => {
    const s = serializerByType('shape')!;
    const back = s.deserialize({ kind: 'triangle', d: '' }, { id: 'n1', left: 0, top: 0, w: 40, h: 40 });
    assert.ok(back instanceof Figure);
    assert.equal((back as Figure).Kind, 'triangle');
});
