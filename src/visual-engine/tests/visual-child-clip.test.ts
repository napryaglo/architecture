import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Visual, Size, Rect, Color } from '../../runtime/index.js';
import { Pen, SolidColorBrush } from '../index.js';

describe('Visual.ClipChildren / ChildClip', () =>
{
    test('off by default ⇒ ChildClip undefined', () =>
    {
        const v = new (class extends Visual {})();
        v.Measure(new Size(100, 100));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.ChildClip, undefined);
    });

    test('on ⇒ ChildClip is the outline inset by the full pen', () =>
    {
        const v = new (class extends Visual {})();
        v.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#000000')), 10);
        v.ClipChildren = true;
        v.Measure(new Size(100, 100));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.ok(v.ChildClip, 'ChildClip present when on');
        // Base outline is the bounds rect; child clip insets by the full pen (10).
        const bounds = (v.ChildClip as unknown as { GetBounds(): Rect }).GetBounds();
        assert.equal(bounds.X, 10);
        assert.equal(bounds.Y, 10);
        assert.equal(bounds.Width, 80);
        assert.equal(bounds.Height, 80);
    });

    test('toggling ClipChildren off clears the ChildClip it set', () =>
    {
        const v = new (class extends Visual {})();
        v.ClipChildren = true;
        v.Measure(new Size(100, 100));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.ok(v.ChildClip);
        v.ClipChildren = false;
        v.Measure(new Size(100, 100));
        v.Arrange(new Rect(0, 0, 100, 100));
        assert.equal(v.ChildClip, undefined);
    });
});
