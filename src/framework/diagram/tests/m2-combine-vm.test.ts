import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DiagramDocument } from '../diagram-document.js';
import { ShapeNodeVM } from '../shape-node-vm.js';
import { GeometryCombineMode } from '../commands/combine.js';

// Pure document-mutation tests for CombineSelection emitting ShapeNodeVM.
// No layout / Application needed — these exercise the mutation API only.
describe('CombineSelection emits ShapeNodeVM (M2)', () => {

    test('Union of two rectangles produces one ShapeNodeVM with defined Geometry', () => {
        const doc = new DiagramDocument();
        const a = doc.CreateNode('rectangle',  0, 0)!;
        const b = doc.CreateNode('rectangle', 40, 0)!;
        assert.ok(a instanceof ShapeNodeVM, 'CreateNode should return ShapeNodeVM');
        assert.ok(b instanceof ShapeNodeVM, 'CreateNode should return ShapeNodeVM');
        const before = doc.Nodes.Count;  // 2

        doc.CombineSelection([a, b], GeometryCombineMode.Union);

        assert.equal(doc.Nodes.Count, before - 1,
            `Combine should collapse ${before} nodes to ${before - 1}; got ${doc.Nodes.Count}`);

        const remaining = doc.Nodes.Get(0)!;
        assert.ok(remaining instanceof ShapeNodeVM,
            'Remaining node must be a ShapeNodeVM');
        assert.notEqual(remaining.Geometry, undefined,
            'Combined ShapeNodeVM must have a defined Geometry');

        // Inputs must no longer be in Nodes.
        assert.equal(doc.Nodes.IndexOf(a), -1, 'Input a must be removed from Nodes');
        assert.equal(doc.Nodes.IndexOf(b), -1, 'Input b must be removed from Nodes');
    });

    test('Fewer than two ShapeNodeVM leaves is a no-op', () => {
        const doc = new DiagramDocument();
        const a = doc.CreateNode('rectangle', 0, 0)!;
        const before = doc.Nodes.Count;  // 1

        doc.CombineSelection([a], GeometryCombineMode.Union);

        assert.equal(doc.Nodes.Count, before, 'Single-item combine must leave Nodes unchanged');
    });

    test('Non-ShapeNodeVM items in selection are ignored; ShapeNodeVMs are combined', () => {
        const doc = new DiagramDocument();
        const a = doc.CreateNode('rectangle',  0, 0)!;
        const b = doc.CreateNode('rectangle', 40, 0)!;
        const before = doc.Nodes.Count;  // 2

        // Pass a foreign object alongside the two VMs — should not crash,
        // and should still combine a + b.
        const foreign = { unrelated: true };
        doc.CombineSelection([a, foreign, b], GeometryCombineMode.Union);

        assert.equal(doc.Nodes.Count, before - 1,
            `Foreign items must be skipped; combined ${before} → ${before - 1}`);
        const remaining = doc.Nodes.Get(0)!;
        assert.ok(remaining instanceof ShapeNodeVM, 'Remaining node must be ShapeNodeVM');
    });

    test('Status message reflects combine mode after successful combine', () => {
        const doc = new DiagramDocument();
        const a = doc.CreateNode('rectangle',  0, 0)!;
        const b = doc.CreateNode('rectangle', 40, 0)!;

        doc.CombineSelection([a, b], GeometryCombineMode.Union);

        assert.ok(doc.Status.includes('Union'),
            `Status should mention the combine mode; got: "${doc.Status}"`);
    });

});
