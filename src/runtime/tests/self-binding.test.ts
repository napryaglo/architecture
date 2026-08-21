import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MuralBase, MetaData, Panel, Element, SelfBinding, type DrawingContext } from '../index.js';
import { TextBlock } from '../../basic/index.js';
import { Brush, SolidColorBrush } from '../../visual-engine/drawing/brush.js';
import { Color } from '../../visual-engine/primitives.js';

// SelfBinding binds a property to the TARGET element's OWN property. The
// headline case: a leaf paints from an inherited attached property
// (TextBlock.Foreground) that cascades by key to any Element — so the
// leaf re-tints live when an ancestor flips the inherited ink.

class TestPanel extends Panel { }

// Leaf with a Brush DP we point at SelfBinding and then read back.
class Probe extends Element
{
    public static readonly TintKey = MuralBase.RegisterProperty<Brush | undefined>(
        Probe, 'Tint', undefined, MetaData.None);
    public get Tint(): Brush | undefined { return this.get_property_value(Probe.TintKey); }
    public set Tint(v: Brush | undefined) { this.set_property_value(Probe.TintKey, v); }

    protected override RenderOverride(_dc: DrawingContext): void { /* no paint */ }
}

describe('SelfBinding', () => {

    test('reads the target\'s own inherited attached property', () => {
        const root  = new TestPanel();
        const probe = new Probe();
        const ink   = new SolidColorBrush(Color.Red);

        root.set_property_value(TextBlock.ForegroundKey, ink);
        root.AddChild(probe);   // TextBlock.Foreground inherits onto probe

        probe.set_property_value(Probe.TintKey, SelfBinding(probe, TextBlock, 'Foreground'));
        assert.equal(probe.Tint, ink, 'Tint resolves to the inherited foreground');
    });

    test('resolves once the value arrives on attach (binding set while detached)', () => {
        const root  = new TestPanel();
        const probe = new Probe();
        const ink   = new SolidColorBrush(Color.Red);
        root.set_property_value(TextBlock.ForegroundKey, ink);

        // Bind BEFORE attach — mirrors the compiler emitting the binding
        // during element construction, before the tree is assembled.
        probe.set_property_value(Probe.TintKey, SelfBinding(probe, TextBlock, 'Foreground'));
        assert.equal(probe.Tint, undefined, 'detached: nothing inherited yet');

        root.AddChild(probe);
        assert.equal(probe.Tint, ink, 'inheritance cascade on attach pushes through');
    });

    test('re-tints when the inherited value flips (reactive)', () => {
        const root  = new TestPanel();
        const probe = new Probe();
        const ink1  = new SolidColorBrush(Color.Red);
        const ink2  = new SolidColorBrush(Color.FromHex('#00ff00'));

        root.set_property_value(TextBlock.ForegroundKey, ink1);
        root.AddChild(probe);
        probe.set_property_value(Probe.TintKey, SelfBinding(probe, TextBlock, 'Foreground'));
        assert.equal(probe.Tint, ink1);

        // The headline behaviour: flipping the ancestor's ink re-tints the leaf.
        root.set_property_value(TextBlock.ForegroundKey, ink2);
        assert.equal(probe.Tint, ink2, 'leaf tracks the inherited-value change');
    });
});
