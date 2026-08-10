import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { DiagramDocument } from '../diagram-document.js';
import { ShapeNodeVM } from '../shape-node-vm.js';

beforeEach(() => { initTestApp(); });

test('AddNode adds a pre-built ShapeNodeVM to the Nodes collection', () => {
    const doc = new DiagramDocument();
    const vm = ShapeNodeVM.fromKind('rectangle', 10, 20, { width: 40, height: 30 });

    // AddNode should add the VM to the Nodes collection
    doc.AddNode(vm);

    assert.equal(doc.Nodes.Count, 1);
    assert.equal(doc.Nodes.Get(0), vm);
    assert.equal(vm.Left, 10);
    assert.equal(vm.Top, 20);
});
