import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Color,
    Panel,
    Size,
    Thickness,
    Element,
    Visual,
    type DrawingContext,
} from '../../runtime/index.js';
import { SolidColorBrush } from '../../visual-engine/index.js';
import {
    Border,
    ControlTemplate,
    DataTemplate,
    ItemsPresenter,
} from '../index.js';
import { ItemsControl } from '@visualisation-sub/mural/framework';

class Leaf extends Element
{
    constructor(public readonly source: unknown) { super(); }
    protected override MeasureOverride(_a: Size): Size { return new Size(10, 10); }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

class TestPanel extends Panel { }

function visualParentOf(v: Visual | undefined): Visual | undefined
{
    if (v === undefined) return undefined;
    return (v as unknown as { visualParent: Visual | undefined }).visualParent;
}

describe('ItemsPresenter', () => {
    test('without a Template, ItemsControl hosts the items panel directly (unchanged legacy behavior)', () => {
        const ic = new ItemsControl();
        const panel = new TestPanel();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate(d => new Leaf(d));
        ic.Items        = ['a', 'b'];

        // Visual parent of panel is the ItemsControl.
        assert.equal(visualParentOf(panel), ic);
        // visualChildren returns [panel] directly.
        assert.deepEqual(ic.visualChildren, [panel]);
    });

    test('applying a Template with an ItemsPresenter slots the items panel into the presenter', () => {
        // Template = Border > ItemsPresenter. Panel ends up as a
        // visual child of the presenter, not of the ItemsControl.
        const template = new ControlTemplate(_tp => {
            const border = new Border();
            border.Background = new SolidColorBrush(Color.White);
            border.BorderBrush = new SolidColorBrush(Color.Black);
            border.BorderThickness = new Thickness(2);
            const presenter = new ItemsPresenter();
            border.SetChild(presenter);
            return border;
        });

        const ic = new ItemsControl();
        const panel = new TestPanel();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate(d => new Leaf(d));
        ic.Items        = ['a', 'b'];
        ic.Template     = template;

        // Template root (Border) is the ItemsControl's direct visual child.
        const templateRoot = ic.visualChildren[0];
        assert.ok(templateRoot instanceof Border);
        // Panel sits visually inside the ItemsPresenter inside the Border.
        const presenter = (templateRoot as Border).child as ItemsPresenter;
        assert.ok(presenter instanceof ItemsPresenter);
        assert.equal(visualParentOf(panel), presenter);
        // Logical children (containers) still belong to the ItemsControl
        // — the two-tree divergence holds.
        assert.equal(ic.logicalChildren.length, 2);
    });

    test('re-templating preserves the items panel instance and its containers', () => {
        const ic = new ItemsControl();
        const panel = new TestPanel();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate(d => new Leaf(d));
        ic.Items        = ['a', 'b'];

        const containerA_before = ic.Generator.ContainerFromItem('a');

        // First template
        ic.Template = new ControlTemplate(_tp => {
            const b = new Border();
            b.SetChild(new ItemsPresenter());
            return b;
        });
        // Panel is now inside presenter1
        const presenter1 = (ic.visualChildren[0] as Border).child;
        assert.equal(visualParentOf(panel), presenter1);

        // Second template — fresh tree
        ic.Template = new ControlTemplate(_tp => {
            const b = new Border();
            b.SetChild(new ItemsPresenter());
            return b;
        });
        const presenter2 = (ic.visualChildren[0] as Border).child;
        assert.notEqual(presenter1, presenter2);
        // Panel moved to the new presenter — SAME instance.
        assert.equal(visualParentOf(panel), presenter2);
        // Containers survived (still in generator's cache).
        assert.equal(ic.Generator.ContainerFromItem('a'), containerA_before);
    });

    test('Template = undefined restores direct panel hosting (no surrounding chrome)', () => {
        const ic = new ItemsControl();
        const panel = new TestPanel();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate(d => new Leaf(d));
        ic.Items        = ['a'];
        ic.Template = new ControlTemplate(_tp => {
            const b = new Border();
            b.SetChild(new ItemsPresenter());
            return b;
        });
        // Panel is in presenter; ItemsControl's visual child is the Border.
        assert.ok(ic.visualChildren[0] instanceof Border);

        ic.Template = undefined;
        // Panel is back as ItemsControl's direct visual child.
        assert.deepEqual(ic.visualChildren, [panel]);
        assert.equal(visualParentOf(panel), ic);
    });

    test('Layout flows through the template root, items panel measures + arranges normally', () => {
        // Border with Padding(5) wrapping ItemsPresenter wrapping a
        // panel that produces fixed-size containers. ItemsControl's
        // MeasureOverride delegates to the template root (the Border).
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            b.Padding = new Thickness(5);
            b.SetChild(new ItemsPresenter());
            return b;
        });
        const ic = new ItemsControl();
        const panel = new TestPanel();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate(d => new Leaf(d));
        ic.Items        = ['a', 'b', 'c'];
        ic.Template     = template;

        ic.Measure(new Size(100, 100));
        // Border's Padding (5 on each side) reserves 10x10 around the
        // presenter. Panel measures within 90x90 and reports something.
        // Just confirm the measure pass propagated without error.
        assert.ok(ic.DesiredSize.Width  >= 10);
        assert.ok(ic.DesiredSize.Height >= 10);
    });

    test('a template with no ItemsPresenter falls back to attaching the panel directly under the ItemsControl', () => {
        // Edge case — template doesn't contain a presenter. The panel
        // is orphaned at apply time; ItemsControl re-hosts it directly
        // so rendering still works.
        const template = new ControlTemplate(_tp => new Border());  // no presenter
        const ic = new ItemsControl();
        const panel = new TestPanel();
        ic.ItemsPanel   = () => panel;
        ic.ItemTemplate = new DataTemplate(d => new Leaf(d));
        ic.Items        = ['a'];
        ic.Template     = template;
        // Panel ends up as ItemsControl's visual child even though the
        // template root is also a child. Both are present.
        // (Border template root is the "official" visualChildren[0];
        // panel is the fallback alongside it.)
        assert.equal(visualParentOf(panel), ic);
    });
});
