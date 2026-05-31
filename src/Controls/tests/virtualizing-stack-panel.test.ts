import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ObservableCollection,
    Panel,
    Rect,
    Size,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import {
    DataTemplate,
    ItemsControl,
    VirtualizingStackPanel,
} from '../index.js';

class Leaf extends Visual
{
    constructor(public readonly source: unknown) { super(); }
    protected override MeasureOverride(_a: Size): Size { return new Size(10, 10); }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

function makeVirtualizingIC(
    items: readonly unknown[] | ObservableCollection<any>,
    panelOpts?: { viewport?: Rect, itemHeight?: number },
): { ic: ItemsControl, panel: VirtualizingStackPanel }
{
    const panel = new VirtualizingStackPanel();
    if (panelOpts?.viewport   !== undefined) panel.Viewport   = panelOpts.viewport;
    if (panelOpts?.itemHeight !== undefined) panel.ItemHeight = panelOpts.itemHeight;
    const ic = new ItemsControl();
    ic.ItemsPanel   = () => panel;
    ic.ItemTemplate = new DataTemplate(data => new Leaf(data));
    ic.Items        = items;
    return { ic, panel };
}

describe('VirtualizingStackPanel — realization based on Viewport', () => {
    test('realizes only items whose vertical band intersects the Viewport', () => {
        // 20 items, ItemHeight = 20 → extent 0..400. Viewport (0, 30, 100, 60)
        // covers y = 30..90, which is items 1, 2, 3, 4 (bands 20..40, 40..60, 60..80, 80..100).
        const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 30, 100, 60),
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 400));
        assert.deepEqual(panel.RealizedIndices, [1, 2, 3, 4]);
        // The realized containers are logical children of the
        // ItemsControl (not the panel).
        assert.equal(ic.logicalChildren.length, 4);
    });

    test('changing Viewport recycles out-of-range items and realizes new ones', () => {
        const items = Array.from({ length: 20 }, (_, i) => `item-${i}`);
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 40),  // items 0, 1
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 400));
        assert.deepEqual(panel.RealizedIndices, [0, 1]);
        const container0_first = ic.Generator.ContainerFromItem('item-0');

        // Move the viewport to a non-overlapping range. The old
        // containers get recycled; new ones come in.
        panel.Viewport = new Rect(0, 100, 100, 40);  // items 5, 6
        ic.Measure(new Size(100, 400));
        assert.deepEqual(panel.RealizedIndices, [5, 6]);
        assert.equal(ic.Generator.IsRealized('item-0'), false);
        assert.equal(ic.Generator.IsRealized('item-5'), true);
        // Generator returns a fresh container if we re-realize item-0,
        // confirming the old one was recycled (not just hidden).
        const container0_second = ic.Generator.Realize('item-0');
        assert.notEqual(container0_first, container0_second);
        // Cleanup the test-only realization so subsequent assertions
        // aren't surprised.
        ic.Generator.Recycle(container0_second);
    });

    test('partial-overlap viewport realizes existing containers without churn', () => {
        // Viewport moves so it still overlaps 2 items but adds a new one.
        // Items 0..3 are realized; new viewport overlaps 1..4. Items 1,2,3
        // stay (same container instances), item 0 recycled, item 4 added.
        const items = Array.from({ length: 10 }, (_, i) => `item-${i}`);
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 80),  // items 0, 1, 2, 3
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 200));
        const c1 = ic.Generator.ContainerFromItem('item-1');
        const c2 = ic.Generator.ContainerFromItem('item-2');
        const c3 = ic.Generator.ContainerFromItem('item-3');

        panel.Viewport = new Rect(0, 20, 100, 80);  // items 1, 2, 3, 4
        ic.Measure(new Size(100, 200));
        assert.deepEqual(panel.RealizedIndices, [1, 2, 3, 4]);
        assert.equal(ic.Generator.ContainerFromItem('item-1'), c1);
        assert.equal(ic.Generator.ContainerFromItem('item-2'), c2);
        assert.equal(ic.Generator.ContainerFromItem('item-3'), c3);
        assert.equal(ic.Generator.IsRealized('item-0'), false);
        assert.equal(ic.Generator.IsRealized('item-4'), true);
    });

    test('Arrange positions each realized container at index * ItemHeight', () => {
        const items = ['a', 'b', 'c', 'd'];
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 80),
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 80));
        ic.Arrange(new Rect(0, 0, 100, 80));
        for (const i of panel.RealizedIndices)
        {
            const c = ic.Generator.ContainerFromItem(items[i])!;
            assert.equal(c.ArrangedRect.Y, i * 20);
        }
    });

    test('Panel extent (DesiredSize.Height) reflects ALL items, not just realized ones', () => {
        // The panel must report its full extent so a host scrollviewer
        // (when it lands) knows how much to scroll over.
        const items = Array.from({ length: 100 }, (_, i) => i);
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 40),  // realize 2 items
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 2000));
        assert.equal(panel.DesiredSize.Height, 100 * 20);
        assert.equal(panel.RealizedIndices.length, 2);
    });

    test('ObservableCollection mutation invalidates the panel and re-realizes', () => {
        const items = new ObservableCollection<string>(['a', 'b', 'c', 'd']);
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 40),  // items 0, 1
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 80));
        assert.deepEqual(panel.RealizedIndices, [0, 1]);

        // Insert at the front — the items shift; the viewport now shows
        // the new items. After re-measure, indices 0 and 1 are realized
        // again (they represent the new front items now).
        items.Insert(0, 'X');
        ic.Measure(new Size(100, 100));
        assert.deepEqual(panel.RealizedIndices, [0, 1]);
        // The realized containers correspond to the new front items.
        const c0 = ic.Generator.ContainerFromItem('X');
        const c1 = ic.Generator.ContainerFromItem('a');
        assert.ok(c0 instanceof Leaf);
        assert.ok(c1 instanceof Leaf);
    });

    test('removing all items via Clear recycles everything', () => {
        const items = new ObservableCollection<string>(['a', 'b', 'c']);
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 60),
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 60));
        assert.equal(panel.RealizedIndices.length, 3);
        items.Clear();
        ic.Measure(new Size(100, 60));
        assert.equal(panel.RealizedIndices.length, 0);
        assert.equal(ic.Generator.Count, 0);
    });

    test('swapping ItemsPanel from virtualizing to plain panel tears down realized containers cleanly', () => {
        const items = ['a', 'b', 'c'];
        const { ic, panel } = makeVirtualizingIC(items, {
            viewport: new Rect(0, 0, 100, 40),  // 2 realized
            itemHeight: 20,
        });
        ic.Measure(new Size(100, 60));
        assert.equal(panel.RealizedIndices.length, 2);
        assert.equal(ic.logicalChildren.length, 2);

        // Switch to a non-virtualizing panel — virtualizing one tears
        // down its realizations; ItemsControl builds all containers
        // for the new panel.
        class TestPanel extends Panel { }
        ic.ItemsPanel = () => new TestPanel();
        assert.equal(ic.logicalChildren.length, 3);  // all items now
    });
});
