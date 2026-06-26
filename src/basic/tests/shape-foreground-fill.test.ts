// Shape's "unset Fill + unset Stroke → paint with the inherited
// TextBlock.Foreground" fallback. Lets a bare `Shape [Geometry=@icon]`
// follow the surrounding text ink the way an icon glyph should, with no
// explicit Fill binding. An explicit Fill always wins; a stroke-only
// Shape keeps fill="none" rather than acquiring a surprise interior.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Panel, Rect, type DrawingContext } from '../../runtime/index.js';
import { Brush, Pen, SolidColorBrush, RectangleGeometry } from '../../visual-engine/index.js';
import { Color } from '../../visual-engine/primitives.js';
import { Shape } from '../shapes/shape.js';
import { TextBlock } from '../text-block.js';

class TestPanel extends Panel { }

// Captures the Fill brush handed to each DrawGeometry call.
class FillCapture implements DrawingContext
{
    public fills: Array<Brush | undefined> = [];
    DrawGeometry(b: Brush | undefined, _p: Pen | undefined, _g: unknown): void { this.fills.push(b); }
    DrawRectangle(): void { throw new Error('not used'); }
    DrawText():      void { throw new Error('not used'); }
    PushTransform(): void { /* no-op */ }
    PushClip():      void { /* no-op */ }
    Pop():           void { /* no-op */ }
}

function fillOf(s: Shape): Brush | undefined
{
    const dc = new FillCapture();
    s.Render(dc);
    assert.equal(dc.fills.length, 1, 'shape painted exactly one geometry');
    return dc.fills[0];
}

function shapeUnder(host: TestPanel): Shape
{
    const s = new Shape();
    s.Geometry = new RectangleGeometry(new Rect(0, 0, 24, 24));
    host.AddChild(s);   // attaches → inheritance cascades onto the shape
    return s;
}

describe('Shape — inherited TextBlock.Foreground as default fill', () => {

    test('both Fill and Stroke unset → paints with the inherited Foreground', () => {
        const ink  = new SolidColorBrush(Color.Red);
        const host = new TestPanel();
        host.set_property_value(TextBlock.ForegroundKey, ink);

        const s = shapeUnder(host);
        assert.equal(fillOf(s), ink, 'bare shape follows the inherited text ink');
    });

    test('an explicit Fill always wins over the Foreground fallback', () => {
        const ink      = new SolidColorBrush(Color.Red);
        const explicit = new SolidColorBrush(Color.FromHex('#00ff00'));
        const host = new TestPanel();
        host.set_property_value(TextBlock.ForegroundKey, ink);

        const s = shapeUnder(host);
        s.Fill = explicit;
        assert.equal(fillOf(s), explicit, 'explicit Fill is used verbatim');
    });

    test('a stroke-only shape keeps fill="none" (no surprise interior)', () => {
        const ink  = new SolidColorBrush(Color.Red);
        const host = new TestPanel();
        host.set_property_value(TextBlock.ForegroundKey, ink);

        const s = shapeUnder(host);
        s.Stroke = new Pen(new SolidColorBrush(Color.FromHex('#0000ff')), 2);
        assert.equal(fillOf(s), undefined, 'Stroke set → fallback suppressed');
    });

    test('no inherited Foreground in the tree → no fill (renders nothing visible)', () => {
        const host = new TestPanel();   // Foreground never set anywhere above
        const s = shapeUnder(host);
        assert.equal(fillOf(s), undefined, 'nothing to inherit → fill stays undefined');
    });

    test('changing the inherited Foreground re-inks the bare shape', () => {
        const ink1 = new SolidColorBrush(Color.Red);
        const ink2 = new SolidColorBrush(Color.FromHex('#123456'));
        const host = new TestPanel();
        host.set_property_value(TextBlock.ForegroundKey, ink1);

        const s = shapeUnder(host);
        assert.equal(fillOf(s), ink1);

        host.set_property_value(TextBlock.ForegroundKey, ink2);
        assert.equal(fillOf(s), ink2, 'cascade updates the fallback fill');
    });
});
