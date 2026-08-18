import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Visual, Size, Rect, Color } from '../../runtime/index.js';
import { Pen, SolidColorBrush } from '../index.js';
import type { DrawingContext } from '../drawing-context.js';

describe('Visual.Stroke', () =>
{
    test('Stroke DP round-trips through the property system', () =>
    {
        const v = new (class extends Visual {})();
        const pen = new Pen(new SolidColorBrush(Color.FromHex('#f0f')), 2);
        v.Stroke = pen;
        assert.equal(v.Stroke, pen);
        // Backed by a real DP, not an ad-hoc field.
        assert.equal(v.get_property_value(Visual.StrokeKey), pen);
    });
});

interface DrawCall { brush: unknown; pen: unknown; geom: unknown }

// Render the Visual into a stub DrawingContext that records DrawGeometry calls.
function drawn(v: Visual): DrawCall[]
{
    const calls: DrawCall[] = [];
    const dc = {
        DrawGeometry: (brush: unknown, pen: unknown, geom: unknown) => calls.push({ brush, pen, geom }),
        DrawRectangle: () => {}, DrawText: () => {},
        PushTransform: () => {}, PushClip: () => {}, PushOpacity: () => {}, Pop: () => {},
    } as unknown as DrawingContext;
    v.Render(dc);
    return calls;
}

describe('Visual base shape paint', () =>
{
    test('a Visual with Fill paints its shape geometry once', () =>
    {
        const v = new (class extends Visual {})();
        const fill = new SolidColorBrush(Color.FromHex('#00ff00'));
        v.Fill = fill;
        v.Measure(new Size(100, 60));
        v.Arrange(new Rect(0, 0, 100, 60));
        const calls = drawn(v);
        assert.equal(calls.length, 1, 'one DrawGeometry for the shape');
        assert.equal(calls[0].brush, fill);
    });

    test('a Visual with neither Fill nor Stroke paints nothing', () =>
    {
        const v = new (class extends Visual {})();
        v.Measure(new Size(100, 60));
        v.Arrange(new Rect(0, 0, 100, 60));
        assert.equal(drawn(v).length, 0);
    });

    test('the painted geometry is inset by half the stroke thickness', () =>
    {
        const v = new (class extends Visual {})();
        v.Fill = new SolidColorBrush(Color.FromHex('#00ff00'));
        v.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#ff00ff')), 10);
        v.Measure(new Size(100, 60));
        v.Arrange(new Rect(0, 0, 100, 60));
        const calls = drawn(v);
        assert.equal(calls.length, 1);
        // Outline is the 100x60 bounds; painted rect is inset by t/2 = 5 on each edge.
        const bounds = (calls[0].geom as { GetBounds(): Rect }).GetBounds();
        assert.equal(bounds.X, 5);
        assert.equal(bounds.Y, 5);
        assert.equal(bounds.Width, 90);
        assert.equal(bounds.Height, 50);
    });
});
