import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeViewModel } from '../node-view-model.js';

test('NodeViewModel exposes Left/Top/Width/Height DPs with defaults', () => {
    const vm = new NodeViewModel();
    assert.equal(vm.Left, 0);
    assert.equal(vm.Top, 0);
    assert.ok(vm.Width > 0 && vm.Height > 0);
    vm.Left = 40; vm.Top = 25;
    assert.equal(vm.Left, 40);
    assert.equal(vm.Top, 25);
});
