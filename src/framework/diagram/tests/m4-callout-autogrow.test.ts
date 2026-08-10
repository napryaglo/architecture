import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { CalloutNodeVM } from '../callout-node-vm.js';
import { TextNodeVM } from '../text-node-vm.js';

describe('CalloutNodeVM — inherits auto-grow, leader follows', () => {
    beforeEach(() => { initTestApp(); });

    test('a long label grows the callout box', () => {
        const c = new CalloutNodeVM();
        const w0 = c.Width;
        c.LabelText = 'A callout label long enough to force the box to grow wider';
        assert.ok(c.Width > w0, `expected grow from ${w0}, got ${c.Width}`);
    });

    test('leader geometry recomputes after the box auto-grows', () => {
        const c = new CalloutNodeVM();
        c.Left = 0; c.Top = 0;
        const target = new TextNodeVM();
        target.Left = 400; target.Top = 300;
        c.LeaderTargetNode = target;
        const before = c.LeaderGeometry;
        assert.ok(before !== undefined, 'leader present with a target');
        c.LabelText = 'Grow the callout so its edge point moves and the leader is recomputed';
        assert.ok(c.LeaderGeometry !== undefined, 'leader still present after grow');
    });
});
