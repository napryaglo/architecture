import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application } from '../index.js';
import { Border } from '../../basic/border.js';
import {
    Brush,
    Color,
    GradientStop,
    LinearGradientBrush,
    Pen,
    RectangleGeometry,
    RotateTransform,
    SolidColorBrush,
    TransformGroup,
    TranslateTransform,
} from '../../visual-engine/index.js';
import { Rect } from '../index.js';

// §5.2 — WPF Freezable parity: owner/Changed notification, nested-Freezable
// bubbling, Freeze immutability, and deep Clone. Exercised through the
// concrete value-Models that now descend from Freezable (Brush / Pen /
// Geometry / Transform) plus the generic Visual owner wiring.

const RED  = new Color(255, 0, 0);
const BLUE = new Color(0, 0, 255);

// Counts InvalidateVisual so the Visual-integration tests can observe that a
// shared Freezable mutation repaints every holder.
class CountingBorder extends Border
{
    public invalidateVisualCount = 0;
    public override InvalidateVisual(): void
    {
        this.invalidateVisualCount++;
        super.InvalidateVisual();
    }
}

describe('Freezable — owner / Changed notification', () => {
    test('mutating a Freezable fires a registered owner', () => {
        const brush = new SolidColorBrush(RED);
        let fired = 0;
        brush.RegisterOwner(() => { fired++; });
        brush.Color = BLUE;
        assert.equal(fired, 1, 'a Color change notifies the owner');
    });

    test('multiple owners are ALL notified (the shared-instance fix)', () => {
        // The bug this replaces: a single-consumer invalidator clobbered the
        // first owner when a value-Model was shared. Now every owner fires.
        const t = new RotateTransform();
        let a = 0, b = 0;
        t.RegisterOwner(() => { a++; });
        t.RegisterOwner(() => { b++; });
        t.Angle = 90;
        assert.equal(a, 1, 'first owner fired');
        assert.equal(b, 1, 'second owner fired too');
    });

    test('UnregisterOwner stops further notifications', () => {
        const brush = new SolidColorBrush(RED);
        let fired = 0;
        const cb = (): void => { fired++; };
        brush.RegisterOwner(cb);
        brush.Color = BLUE;
        brush.UnregisterOwner(cb);
        brush.Color = RED;
        assert.equal(fired, 1, 'no notification after unregister');
    });
});

describe('Freezable — nested-Freezable bubbling', () => {
    test('a change to Pen.Brush bubbles to Pen owners', () => {
        const pen = new Pen();
        const brush = new SolidColorBrush(RED);
        pen.Brush = brush;
        let fired = 0;
        pen.RegisterOwner(() => { fired++; });
        (pen.Brush as SolidColorBrush).Color = BLUE;
        assert.ok(fired > 0, 'Pen.Brush.Color change reaches Pen owners');
    });

    test('a change to Brush.Transform bubbles to Brush owners', () => {
        const brush = new SolidColorBrush(RED);
        const t = new RotateTransform();
        brush.Transform = t;
        let fired = 0;
        brush.RegisterOwner(() => { fired++; });
        t.Angle = 30;
        assert.ok(fired > 0, 'Brush.Transform.Angle change reaches Brush owners');
    });

    test('swapping a nested Freezable stops the old one bubbling', () => {
        const pen = new Pen();
        const first = new SolidColorBrush(RED);
        pen.Brush = first;
        const second = new SolidColorBrush(BLUE);
        pen.Brush = second;         // swap out `first`
        let fired = 0;
        pen.RegisterOwner(() => { fired++; });
        first.Color = BLUE;         // detached — must NOT bubble
        assert.equal(fired, 0, 'the replaced nested brush no longer bubbles');
        second.Color = RED;         // current — must bubble
        assert.ok(fired > 0, 'the current nested brush bubbles');
    });

    test('TransformGroup bubbles a nested child inner change', () => {
        const g = new TransformGroup();
        const r = new RotateTransform();
        g.Children.Add(r);
        let fired = 0;
        g.RegisterOwner(() => { fired++; });
        r.Angle = 45;
        assert.ok(fired > 0, 'a child Angle change reaches the group owners');
    });
});

describe('Freezable — Freeze / immutability', () => {
    test('IsFrozen flips and CanFreeze is true for simple value-Models', () => {
        const brush = new SolidColorBrush(RED);
        assert.equal(brush.IsFrozen, false);
        assert.equal(brush.CanFreeze, true);
        brush.Freeze();
        assert.equal(brush.IsFrozen, true);
    });

    test('writing a frozen Freezable throws', () => {
        const brush = new SolidColorBrush(RED);
        brush.Freeze();
        assert.throws(() => { brush.Color = BLUE; }, /frozen/i);
    });

    test('Freeze is recursive — nested Freezables freeze too', () => {
        const pen = new Pen();
        pen.Brush = new SolidColorBrush(RED);
        pen.Freeze();
        assert.equal(pen.IsFrozen, true);
        assert.equal((pen.Brush as SolidColorBrush).IsFrozen, true,
            'the nested Brush froze with the Pen');
        assert.throws(() => { (pen.Brush as SolidColorBrush).Color = BLUE; }, /frozen/i);
    });

    test('a frozen Freezable no longer notifies (owners dropped)', () => {
        const brush = new SolidColorBrush(RED);
        let fired = 0;
        brush.RegisterOwner(() => { fired++; });
        brush.Freeze();
        // RegisterOwner after freeze is a no-op; the pre-freeze owner was
        // dropped. Nothing can change it anyway.
        assert.throws(() => { brush.Color = BLUE; });
        assert.equal(fired, 0, 'no notification from a frozen instance');
    });

    test('TransformGroup Freeze reaches its (non-DP) children', () => {
        const g = new TransformGroup();
        const r = new RotateTransform();
        g.Children.Add(r);
        g.Freeze();
        assert.equal(g.IsFrozen, true);
        assert.equal(r.IsFrozen, true, 'the group child froze');
    });
});

describe('Freezable — Clone', () => {
    test('Clone deep-copies and is independent + unfrozen', () => {
        const brush = new SolidColorBrush(RED);
        brush.Opacity = 0.5;
        const copy = brush.Clone();
        assert.notEqual(copy, brush, 'a new instance');
        assert.equal(copy.IsFrozen, false, 'clones are unfrozen');
        assert.ok(copy.Color.Equals(RED), 'Color copied');
        assert.equal(copy.Opacity, 0.5, 'Opacity copied');
        copy.Color = BLUE;
        assert.ok(brush.Color.Equals(RED), 'mutating the clone does not touch the original');
    });

    test('Clone deep-copies nested Freezables (not shared by reference)', () => {
        const pen = new Pen();
        pen.Brush = new SolidColorBrush(RED);
        pen.Thickness = 3;
        const copy = pen.Clone();
        assert.notEqual(copy.Brush, pen.Brush, 'nested Brush is a distinct clone');
        assert.ok((copy.Brush as SolidColorBrush).Color.Equals(RED), 'nested Brush value copied');
        assert.equal(copy.Thickness, 3);
        (copy.Brush as SolidColorBrush).Color = BLUE;
        assert.ok((pen.Brush as SolidColorBrush).Color.Equals(RED),
            'mutating the clone\'s nested Brush does not touch the original');
    });

    test('Clone of a frozen instance is a mutable copy', () => {
        const brush = new SolidColorBrush(RED);
        brush.Freeze();
        const copy = brush.Clone();
        assert.equal(copy.IsFrozen, false);
        copy.Color = BLUE;   // must not throw
        assert.ok(copy.Color.Equals(BLUE));
    });

    test('immutable value elements (GradientStops) are copied array-wise', () => {
        const stops = [new GradientStop(RED, 0), new GradientStop(BLUE, 1)];
        const g = new LinearGradientBrush(stops);
        const copy = g.Clone();
        assert.notEqual(copy.GradientStops, g.GradientStops, 'a new array');
        assert.equal(copy.GradientStops.length, 2);
        assert.ok(copy.GradientStops[0]!.Color.Equals(RED));
    });

    test('TransformGroup Clone deep-copies its children', () => {
        const g = new TransformGroup();
        g.Children.Add(new TranslateTransform(5, 0));
        g.Children.Add(new RotateTransform(45));
        const copy = g.Clone();
        assert.equal(copy.Children.Count, 2, 'children cloned');
        assert.notEqual(copy.Children.Get(0), g.Children.Get(0), 'child is a distinct clone');
        // Composed matrix is equivalent.
        assert.ok(copy.Matrix.Equals(g.Matrix), 'clone composes the same matrix');
    });

    test('GetAsFrozen returns a frozen copy; frozen input returns itself', () => {
        const brush = new SolidColorBrush(RED);
        const frozen = brush.GetAsFrozen();
        assert.notEqual(frozen, brush, 'unfrozen input → frozen clone');
        assert.equal(frozen.IsFrozen, true);
        assert.equal(brush.IsFrozen, false, 'original stays mutable');
        assert.equal(frozen.GetAsFrozen(), frozen, 'already-frozen returns itself');
    });

    test('CloneCurrentValue matches Clone for value-Models', () => {
        const geo = new RectangleGeometry(new Rect(0, 0, 10, 20), 2, 2);
        const copy = geo.CloneCurrentValue();
        assert.notEqual(copy, geo);
        assert.ok(copy.Rect.Equals(new Rect(0, 0, 10, 20)));
        assert.equal(copy.RadiusX, 2);
    });
});

describe('Freezable — Visual integration (shared-brush repaint)', () => {
    beforeEach(() => { Application.current = null; });

    test('mutating a shared Brush repaints EVERY holding Visual', () => {
        const brush = new SolidColorBrush(RED);
        const b1 = new CountingBorder();
        const b2 = new CountingBorder();
        b1.Background = brush;
        b2.Background = brush;
        b1.invalidateVisualCount = 0;
        b2.invalidateVisualCount = 0;
        brush.Color = BLUE;
        assert.ok(b1.invalidateVisualCount > 0, 'first holder repainted');
        assert.ok(b2.invalidateVisualCount > 0, 'second holder repainted (shared brush)');
    });

    test('clearing the DP unregisters that Visual as an owner', () => {
        const brush = new SolidColorBrush(RED);
        const b1 = new CountingBorder();
        const b2 = new CountingBorder();
        b1.Background = brush;
        b2.Background = brush;
        b1.Background = undefined;   // unregister b1
        b1.invalidateVisualCount = 0;
        b2.invalidateVisualCount = 0;
        brush.Color = BLUE;
        assert.equal(b1.invalidateVisualCount, 0, 'detached holder is not repainted');
        assert.ok(b2.invalidateVisualCount > 0, 'still-attached holder is repainted');
    });

    test('a nested Brush.Transform change repaints the holding Visual', () => {
        const brush = new SolidColorBrush(RED);
        const t = new TranslateTransform();
        brush.Transform = t;
        const b = new CountingBorder();
        b.Background = brush;
        b.invalidateVisualCount = 0;
        t.X = 5;
        assert.ok(b.invalidateVisualCount > 0,
            'Background.Transform.X change bubbles through the brush to the Visual');
    });
});
