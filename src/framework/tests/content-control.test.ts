import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Color, MetaData, Model, Rect, Size, Thickness, Visual, type DrawingContext } from '../../runtime/index.js';
import { SolidColorBrush } from '../../visual-engine/index.js';
import { Border, ContentPresenter, ControlTemplate, TemplateBinding } from '../../basic/index.js';
import { ContentControl } from '@visualisation-sub/mural/framework';

// Test-side accessors for Visual's protected parent / templatedParent
// getters. Production API keeps them encapsulated.
function visualParentOf(v: Visual | undefined): Visual | undefined
{
    if (v === undefined) return undefined;
    return (v as unknown as { visualParent: Visual | undefined }).visualParent;
}
function logicalParentOf(v: Visual | undefined): Visual | undefined
{
    if (v === undefined) return undefined;
    return (v as unknown as { logicalParent: Visual | undefined }).logicalParent;
}

// A minimal leaf Visual used as Content — just a fixed-size box so
// Measure / Arrange assertions are predictable. Property registration
// covers the inheritance flow test below.
class Leaf extends Visual
{
    static {
        // Inheritable property — proves walk_inherited rides logical, not visual.
        Model.RegisterProperty(Leaf, 'Tint', 'default', MetaData.Inherits);
    }

    constructor(private box: Size = new Size(10, 10)) { super(); }

    public get Tint(): string { return this._get_property_value_by_name('Tint'); }
    public set Tint(value: string) { this._set_property_value_by_name('Tint', value); }

    protected override MeasureOverride(_a: Size): Size { return this.box; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

// Helper to construct a template that wraps Content in a Border with
// a ContentPresenter inside. Mimics the WPF "Button with a Border
// surround" template shape.
function borderTemplate(): ControlTemplate
{
    return new ControlTemplate(_templatedParent => {
        const border = new Border();
        const presenter = new ContentPresenter();
        border.SetChild(presenter);
        return border;
    });
}

describe('ContentControl + ControlTemplate', () => {
    test('without a Template, the control has no visual children even if Content is set', () => {
        const cc = new ContentControl();
        cc.Content = new Leaf();
        assert.equal(cc.visualChildren.length, 0);
        // Content is still in the logical tree.
        assert.equal(cc.logicalChildren.length, 1);
    });

    test('applying a Template installs the template root as the visual child', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        assert.equal(cc.visualChildren.length, 1);
        assert.ok(cc.visualChildren[0] instanceof Border);
    });

    test('the trees diverge for slotted Content', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();

        const leaf = new Leaf();
        cc.Content = leaf;

        // Logical parent walk: leaf → ContentControl (directly).
        assert.equal(logicalParentOf(leaf), cc);

        // Visual parent walk: leaf → ContentPresenter → Border → ContentControl.
        const visualP1 = visualParentOf(leaf);
        assert.ok(visualP1 instanceof ContentPresenter);
        const visualP2 = visualParentOf(visualP1);
        assert.ok(visualP2 instanceof Border);
        const visualP3 = visualParentOf(visualP2);
        assert.equal(visualP3, cc);

        // The trees are genuinely different instances at the immediate parent.
        assert.notEqual(logicalParentOf(leaf), visualParentOf(leaf));
    });

    test('property value inheritance flows through the logical tree (skipping the template)', () => {
        // The payoff: inheritance behaves as if the template weren't there.
        // Setting Tint on the ContentControl reaches the Leaf via Leaf's
        // logical parent — even though visually the Leaf is two levels
        // deep inside the template.
        const cc = new ContentControl();
        Model.RegisterProperty(ContentControl, 'Tint', 'default', MetaData.Inherits);
        cc.Template = borderTemplate();

        const leaf = new Leaf();
        cc.Content = leaf;

        cc._set_property_value_by_name(Leaf, 'Tint', 'crimson');
        assert.equal(leaf.Tint, 'crimson');
    });

    test('template-internal Visuals have templatedParent set to the control', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        const border = cc.visualChildren[0] as Border;
        assert.equal(border.templatedParent, cc);
        const presenter = border.child as ContentPresenter;
        assert.equal(presenter.templatedParent, cc);
    });

    test('consumer-supplied Content does NOT have templatedParent set', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        const leaf = new Leaf();
        cc.Content = leaf;
        // markTemplated runs over the template subtree at Apply time —
        // BEFORE the leaf is slotted — so the leaf never gets stamped.
        assert.equal(leaf.templatedParent, undefined);
    });

    test('re-templating preserves the Content as the same instance', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        const leaf = new Leaf();
        cc.Content = leaf;
        assert.equal(logicalParentOf(leaf), cc);

        // Swap in a fresh template. Logical tree shouldn't change.
        cc.Template = borderTemplate();
        assert.equal(cc.Content, leaf);                  // same instance
        assert.equal(logicalParentOf(leaf), cc);         // still logical child of cc
        // Visual parent is the NEW presenter (different instance).
        assert.ok(visualParentOf(leaf) instanceof ContentPresenter);
    });

    test('clearing Template detaches the visual tree but keeps Content logically attached', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        const leaf = new Leaf();
        cc.Content = leaf;

        cc.Template = undefined;
        assert.equal(cc.visualChildren.length, 0);
        assert.equal(cc.Content, leaf);
        assert.equal(logicalParentOf(leaf), cc);
        // Content has no visual home now.
        assert.equal(visualParentOf(leaf), undefined);
    });

    test('Measure / Arrange delegate to the template root', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        cc.Content = new Leaf(new Size(40, 20));

        cc.Measure(new Size(100, 100));
        assert.equal(cc.DesiredSize.Width,  40);
        assert.equal(cc.DesiredSize.Height, 20);

        cc.Arrange(new Rect(0, 0, 40, 20));
        // Template root (Border) got the full slot.
        const border = cc.visualChildren[0]!;
        assert.equal(border.ArrangedRect.Width,  40);
        assert.equal(border.ArrangedRect.Height, 20);
    });

    test('replacing Content swaps the presenter slot to the new instance', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        const a = new Leaf();
        const b = new Leaf();
        cc.Content = a;
        const presenter = visualParentOf(a) as ContentPresenter;
        assert.equal(presenter.visualChildren[0], a);

        cc.Content = b;
        assert.equal(presenter.visualChildren[0], b);
        // Old content has no visual or logical parent now.
        assert.equal(visualParentOf(a),  undefined);
        assert.equal(logicalParentOf(a), undefined);
    });

    // ----------------------------------------------------------------
    // Template-internal inheritance
    // ----------------------------------------------------------------

    test('template internals inherit from the templated control via templatedParent fallback', () => {
        // A template that contains a Leaf as a static template-internal
        // element (not via ContentPresenter). It has no logical parent
        // — its inheritance must walk through templatedParent to reach
        // the ContentControl where Tint is set.
        const template = new ControlTemplate(_tp => new Leaf());
        const cc = new ContentControl();
        cc._set_property_value_by_name(Leaf, 'Tint', 'royalblue');
        cc.Template = template;

        const inner = cc.visualChildren[0] as Leaf;
        // refresh_inheritance_subtree was called by rebuildTemplate after
        // attach, so the value is already pulled in.
        assert.equal(inner.Tint, 'royalblue');
    });

    test('changing a value on the templated control AFTER template is applied propagates to template internals', () => {
        const template = new ControlTemplate(_tp => new Leaf());
        const cc = new ContentControl();
        cc.Template = template;

        const inner = cc.visualChildren[0] as Leaf;
        assert.equal(inner.Tint, 'default');  // no value set yet

        cc._set_property_value_by_name(Leaf, 'Tint', 'crimson');
        assert.equal(inner.Tint, 'crimson');
    });

    test('template internals nested under template root also inherit', () => {
        // Border > Leaf via SetChild — the Leaf has logicalParent = Border,
        // Border has logicalParent = undefined but templatedParent = cc.
        // Inheritance walk: Leaf → Border (logical) → cc (templated).
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            const leaf = new Leaf();
            b.SetChild(leaf);
            return b;
        });
        const cc = new ContentControl();
        cc.Template = template;
        cc._set_property_value_by_name(Leaf, 'Tint', 'amber');

        const border = cc.visualChildren[0] as Border;
        const nestedLeaf = border.child as Leaf;
        assert.equal(nestedLeaf.Tint, 'amber');
    });

    // ----------------------------------------------------------------
    // TemplateBinding
    // ----------------------------------------------------------------

    // ----------------------------------------------------------------
    // Namescopes — per-template named-element scoping
    // ----------------------------------------------------------------

    test('GetTemplateChild resolves a named template part', () => {
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            b.Name = 'PART_Background';
            b.SetChild(new ContentPresenter());
            return b;
        });
        const cc = new ContentControl();
        cc.Template = template;

        const part = cc.GetTemplateChild('PART_Background');
        assert.ok(part instanceof Border);
        assert.equal(part, cc.visualChildren[0]);
    });

    test('FindName from a template-internal Visual walks to the template root namescope', () => {
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            b.Name = 'PART_Outer';
            const presenter = new ContentPresenter();
            presenter.Name = 'PART_Inner';
            b.SetChild(presenter);
            return b;
        });
        const cc = new ContentControl();
        cc.Template = template;

        const inner = cc.GetTemplateChild('PART_Inner');
        assert.ok(inner instanceof ContentPresenter);
        // Calling FindName from the inner visual itself resolves in the
        // same scope (walking up logical ancestors).
        assert.equal(inner.FindName('PART_Outer'), cc.visualChildren[0]);
        assert.equal(inner.FindName('PART_Inner'), inner);
    });

    test('the same Name in two different template instances resolves to different Visuals', () => {
        // Per-instance NameScope means PART_Background in template A
        // and template B are independent. Two controls each get their
        // own Border, each registered under PART_Background in their
        // own scope.
        const tpl = () => new ControlTemplate(_tp => {
            const b = new Border();
            b.Name = 'PART_Background';
            b.SetChild(new ContentPresenter());
            return b;
        });
        const cc1 = new ContentControl();
        cc1.Template = tpl();
        const cc2 = new ContentControl();
        cc2.Template = tpl();

        const a = cc1.GetTemplateChild('PART_Background');
        const b = cc2.GetTemplateChild('PART_Background');
        assert.notEqual(a, b);
        assert.equal(a, cc1.visualChildren[0]);
        assert.equal(b, cc2.visualChildren[0]);
    });

    test('FindName returns undefined for a name not registered in any enclosing scope', () => {
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            b.Name = 'PART_A';
            return b;
        });
        const cc = new ContentControl();
        cc.Template = template;
        assert.equal(cc.GetTemplateChild('PART_B'), undefined);
    });

    test('consumer-supplied Content does NOT see template-internal names', () => {
        // The slotted Content has logicalParent = ContentControl, not
        // the template root, so its FindName walk skips the template's
        // NameScope entirely.
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            b.Name = 'PART_Background';
            b.SetChild(new ContentPresenter());
            return b;
        });
        const cc = new ContentControl();
        cc.Template = template;
        const slotted = new Leaf();
        cc.Content = slotted;

        assert.equal(slotted.FindName('PART_Background'), undefined);
    });

    test('duplicate Name in the same template throws at Apply time', () => {
        const template = new ControlTemplate(_tp => {
            const b = new Border();
            b.Name = 'DUP';
            const presenter = new ContentPresenter();
            presenter.Name = 'DUP';
            b.SetChild(presenter);
            return b;
        });
        const cc = new ContentControl();
        assert.throws(() => { cc.Template = template; }, /already registered/);
    });

    test('TemplateBinding wires a template-internal property to the templated control', () => {
        // A template whose Border.Background is bound to the templated
        // control's own (Background) — defined on ContentControl below.
        Model.RegisterProperty(ContentControl, 'Background', undefined, MetaData.Render);

        const template = new ControlTemplate(tp => {
            const b = new Border();
            b._set_property_value_by_name('Background', TemplateBinding(tp, 'Background'));
            b.BorderThickness = new Thickness(1);
            return b;
        });

        const cc = new ContentControl();
        cc.Template = template;

        const blue = new SolidColorBrush(Color.Blue);
        cc._set_property_value_by_name('Background', blue);

        const border = cc.visualChildren[0] as Border;
        assert.equal(border.Background, blue);

        // Changing the source pushes the new value to the bound target.
        const red = new SolidColorBrush(Color.Red);
        cc._set_property_value_by_name('Background', red);
        assert.equal(border.Background, red);
    });

    // ----------------------------------------------------------------
    // Resources — Visual.Resources + FindResource walking logical tree
    // ----------------------------------------------------------------

    test('TryFindResource resolves a key set on an ancestor', () => {
        const cc = new ContentControl();
        cc.Resources.Set('Accent', 'royalblue');
        cc.Template = borderTemplate();
        const leaf = new Leaf();
        cc.Content = leaf;
        assert.equal(leaf.TryFindResource('Accent'), 'royalblue');
    });

    test('a closer ancestor shadows a farther one (same key, different value)', () => {
        const outer = new ContentControl();
        outer.Resources.Set('Accent', 'outer-blue');
        outer.Template = borderTemplate();

        const inner = new ContentControl();
        inner.Resources.Set('Accent', 'inner-red');
        inner.Template = borderTemplate();
        outer.Content = inner;

        const leaf = new Leaf();
        inner.Content = leaf;

        // Closest wins — inner's Accent shadows outer's.
        assert.equal(leaf.TryFindResource('Accent'), 'inner-red');
    });

    test('template-internal Visuals see resources defined on the templated control', () => {
        // Same templatedParent fallback as inheritance — a template-
        // internal Border can resolve a resource set on the
        // ContentControl it was generated for.
        const template = new ControlTemplate(_tp => new Border());
        const cc = new ContentControl();
        cc.Resources.Set('Tone', 'sage');
        cc.Template = template;

        const innerBorder = cc.visualChildren[0]!;
        assert.equal(innerBorder.TryFindResource('Tone'), 'sage');
    });

    test('TryFindResource returns undefined when no ancestor has the key', () => {
        const cc = new ContentControl();
        cc.Template = borderTemplate();
        const leaf = new Leaf();
        cc.Content = leaf;
        assert.equal(leaf.TryFindResource('Missing'), undefined);
    });

    test('FindResource throws when the key is not present anywhere up the chain', () => {
        const cc = new ContentControl();
        const leaf = new Leaf();
        cc.Template = borderTemplate();
        cc.Content = leaf;
        assert.throws(() => leaf.FindResource('Missing'), /not found in any logical ancestor/);
    });

    test('Resources accessor does NOT allocate on read-only walks', () => {
        // Touching a Visual's resources via FindResource on an empty
        // tree shouldn't allocate dicts at each step. We can't observe
        // allocations directly, but we can confirm that reading
        // TryFindResource doesn't materialize a dict that subsequent
        // Has() calls would find.
        const a = new Leaf();
        const b = new Leaf();
        a._add_property_changed_listener_by_name('Tint', () => {});  // keep `a` referenced
        b._add_property_changed_listener_by_name('Tint', () => {});
        // TryFindResource walks past `a` (which has no logical parent),
        // returns undefined. No allocation should have happened.
        assert.equal(a.TryFindResource('K'), undefined);
        // Now allocate explicitly via Resources getter, confirm it's
        // a fresh empty dict.
        assert.equal(a.Resources.Size, 0);
    });
});
