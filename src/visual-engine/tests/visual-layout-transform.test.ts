import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Application, Size, Rect } from '../../runtime/index.js';
import { Border } from '../../basic/border.js';
import { ScaleTransform } from '../index.js';

describe('Visual.LayoutTransform DP', () => {
    beforeEach(() => { Application.current = null; });

    test('defaults to undefined and round-trips a value', () => {
        const b = new Border();
        assert.equal(b.LayoutTransform, undefined);
        const t = new ScaleTransform(2, 2);
        b.LayoutTransform = t;
        assert.equal(b.LayoutTransform, t);
    });

    test('changing an inner transform DP invalidates the owner measure', () => {
        const host = new Border();
        const child = new Border();
        child.Width = 100; child.Height = 50;
        host.SetChild(child);
        const t = new ScaleTransform(2, 2);
        host.LayoutTransform = t;
        host.Measure(new Size(1000, 1000));
        host.Arrange(new Rect(0, 0, 1000, 1000));
        assert.equal(host.IsMeasureValid, true);
        t.ScaleX = 3;   // inner change must dirty the owner
        assert.equal(host.IsMeasureValid, false);
    });
});
