import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Size, Element, type DrawingContext } from '../../../../runtime/index.js';
import { DataTemplate, VirtualizingStackPanel } from '../../../index.js';
import { ItemsControl } from '@pragmatic-tech-ai/mural/framework';

// Fixed-height leaf so the viewport→index math is the uniform 20px estimate.
class Leaf extends Element
{
    constructor(public readonly source: unknown) { super(); }
    protected override MeasureOverride(_a: Size): Size { return new Size(10, 20); }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

// Regression for the project-explorer scroll freeze: a virtualizing
// ItemsControl whose Items are fully reset (a recycled TreeViewItem rebound to
// a different node) ran rebuildContainers → generator.Clear() but left the
// VirtualizingStackPanel's `realized` map untouched. The stale entries then
// desynced from the cleared generator: the panel kept the old containers
// (rows shown twice), and a later measure pass served a
// generator-registered-but-never-attached container into `realized`, which the
// next recycle sweep handed to DetachContainer → DetachLogical with a logical
// parent of undefined → "Cannot detach an Element that is not a logical child
// of this." Repeated every layout pass = the freeze.
describe('VirtualizingStackPanel — Items reset does not desync the realized map', () =>
{
    function makeIC(items: readonly unknown[]): { ic: ItemsControl; panel: VirtualizingStackPanel }
    {
        const panel = new VirtualizingStackPanel();
        panel.Viewport = new Rect(0, 0, 100, 60);   // ~3 rows @ 20px
        const ic = new ItemsControl();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate((d) => new Leaf(d));
        ic.Items        = items;
        return { ic, panel };
    }

    test('reset Items then scroll down / up / down without throwing', () =>
    {
        const { ic, panel } = makeIC(Array.from({ length: 20 }, (_, i) => `a${i}`));
        ic.Measure(new Size(100, 60));                     // realize [0..2] (a-items)
        assert.ok(panel.RealizedIndices.length > 0, 'initial realization');

        // Full reset — new collection instance → rebuildContainers → generator.Clear.
        ic.Items = Array.from({ length: 20 }, (_, i) => `b${i}`);

        // The down / up / down dance that (pre-fix) minted a zombie realized entry
        // and then double-detached it.
        ic.Measure(new Size(100, 60));                                              // top   [0..2]
        panel.Viewport = new Rect(0, 80, 100, 60); ic.Measure(new Size(100, 60));   // down  [4..6]
        panel.Viewport = new Rect(0,  0, 100, 60); ic.Measure(new Size(100, 60));   // up    [0..2]
        assert.doesNotThrow(() =>
        {
            panel.Viewport = new Rect(0, 80, 100, 60); ic.Measure(new Size(100, 60)); // down → recycle
        }, 'recycle after an Items reset must not throw "not a logical child"');
    });

    test('after reset, every realized container is logically owned by the control (no zombies)', () =>
    {
        const { ic, panel } = makeIC(Array.from({ length: 20 }, (_, i) => `a${i}`));
        ic.Measure(new Size(100, 60));

        ic.Items = Array.from({ length: 20 }, (_, i) => `b${i}`);
        ic.Measure(new Size(100, 60));

        for (const idx of panel.RealizedIndices)
        {
            const c = ic.Generator.ContainerFromIndex(idx)!;
            assert.equal(c.GetLogicalParent(), ic, `realized container at ${idx} must be owned by the control`);
            assert.equal(ic.Generator.ItemFromContainer(c), `b${idx}`, `realized container at ${idx} must map to the NEW item, not a stale one`);
        }
    });
});
