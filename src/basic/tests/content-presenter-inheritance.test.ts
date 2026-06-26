import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Panel, Element, type DrawingContext } from '../../runtime/index.js';
import { ContentPresenter } from '../templates/content-presenter.js';
import { TextBlock } from '../text-block.js';
import { SolidColorBrush } from '../../visual-engine/drawing/brush.js';
import { Color } from '../../visual-engine/primitives.js';

// The two-tree bridge: a value set on a host element inside a (mock)
// ControlTemplate reaches slotted content through the VISUAL tree —
// content hangs off the ContentPresenter visually but off the control
// logically. walk_inherited's visual fallback does the read;
// ContentPresenter forwards cascades for reactivity. DataContext is
// excluded from the visual path (authored-context invariant).

class TestPanel extends Panel { }
class Probe extends Element
{
    protected override RenderOverride(_dc: DrawingContext): void { /* no paint */ }
}

describe('ContentPresenter inheritance bridge', () => {

    test('slotted content inherits a host\'s TextBlock.Foreground via the visual tree', () => {
        const host    = new TestPanel();       // stands in for PART_Border
        const present = new ContentPresenter();
        const probe   = new Probe();            // the slotted content (no logical parent)
        const ink     = new SolidColorBrush(Color.Red);

        host.set_property_value(TextBlock.ForegroundKey, ink);
        host.AddChild(present);                 // present is host's visual + logical child
        present.SetContent(probe);              // probe is present's VISUAL child only

        assert.equal(probe.GetLogicalParent(), undefined, 'content has no logical parent here');
        assert.equal(probe.get_property_value(TextBlock.ForegroundKey), ink,
            'content resolves the host foreground through the visual fallback');
    });

    test('reactive: flipping the host foreground re-inks the content', () => {
        const host    = new TestPanel();
        const present = new ContentPresenter();
        const probe   = new Probe();
        const ink1    = new SolidColorBrush(Color.Red);
        const ink2    = new SolidColorBrush(Color.FromHex('#00ff00'));

        host.set_property_value(TextBlock.ForegroundKey, ink1);
        host.AddChild(present);
        present.SetContent(probe);
        assert.equal(probe.get_property_value(TextBlock.ForegroundKey), ink1);

        host.set_property_value(TextBlock.ForegroundKey, ink2);
        assert.equal(probe.get_property_value(TextBlock.ForegroundKey), ink2,
            'cascade forwards through the presenter to the slotted content');
    });

    test('DataContext is NOT pulled from the visual host (stays authored/logical)', () => {
        const host    = new TestPanel();
        const present = new ContentPresenter();
        const probe   = new Probe();

        host.DataContext = { who: 'host' };
        host.AddChild(present);
        present.SetContent(probe);

        // Probe has no logical parent, so its DataContext must remain
        // undefined — the visual host's DataContext must not leak in.
        assert.equal(probe.DataContext, undefined,
            'DataContext follows the logical/authored chain only');
    });
});
