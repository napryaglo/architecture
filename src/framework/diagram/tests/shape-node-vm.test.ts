import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShapeNodeVM } from '../shape-node-vm.js';

test('fromKind builds source + scaled geometry and rescales on size change', () => {
    const vm = ShapeNodeVM.fromKind('rectangle', 10, 20, { width: 40, height: 30 });
    assert.equal(vm.Kind, 'rectangle');
    assert.equal(vm.Left, 10);
    assert.equal(vm.Top, 20);
    assert.ok(vm.Geometry !== undefined, 'geometry built');
    assert.ok(vm._getSource() !== undefined, 'unit-1 source cached');
    const before = vm.Geometry;
    vm.Width = 80;
    assert.notEqual(vm.Geometry, before, 'geometry rescaled on width change');
});

test('satisfies CombinableShape (Geometry/Left/Top present)', () => {
    const vm = ShapeNodeVM.fromKind('ellipse', 5, 6);
    assert.equal(typeof vm.Left, 'number');
    assert.equal(typeof vm.Top, 'number');
    assert.ok('Geometry' in vm);
});
