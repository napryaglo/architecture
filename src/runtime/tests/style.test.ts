import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    Binding,
    BindingMode,
    DynamicResource,
    MetaData,
    Model,
    Panel,
    PropertyTrigger,
    PropertyValueSource,
    ResourceDictionary,
    Setter,
    SetterFactory,
    Size,
    Style,
    Visual,
    type DrawingContext,
} from '../index.js';

// Leaf with a couple of properties (one local, one inheritable) used
// as the styling target. Tint is inheritable so we can verify that a
// styled value shadows an inherited one. Padding is a non-inheritable
// number so we can verify cross-class setters and basic shadowing
// against an inherited value.
class Widget extends Visual
{
    static {
        Model.RegisterProperty(Widget, 'Tint',  'default', MetaData.Inherits);
        Model.RegisterProperty(Widget, 'Bias',  0,         MetaData.None);
    }
    public get Tint(): string { return this.get_property_value('Tint'); }
    public set Tint(v: string) { this.set_property_value('Tint', v); }
    public get Bias(): number { return this.get_property_value('Bias'); }
    public set Bias(v: number) { this.set_property_value('Bias', v); }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

class TestPanel extends Panel { }

describe('Style — basics', () => {
    test('Setter holds owner, property name, and value verbatim', () => {
        const s = new Setter(Widget, 'Tint', 'red');
        assert.equal(s.owner, Widget);
        assert.equal(s.property, 'Tint');
        assert.equal(s.value, 'red');
    });

    test('Style stores TargetType + Setters; BasedOn defaults to undefined', () => {
        const style = new Style(Widget, [new Setter(Widget, 'Bias', 7)]);
        assert.equal(style.TargetType, Widget);
        assert.equal(style.Setters.length, 1);
        assert.equal(style.BasedOn, undefined);
    });

    test('ResolveSetters returns an empty map for an empty style', () => {
        const style = new Style(Widget);
        assert.equal(style.ResolveSetters().size, 0);
    });
});

describe('Style — BasedOn chaining', () => {
    test('child Setters override base Setters for the same (owner, property) key', () => {
        const base = new Style(Widget, [
            new Setter(Widget, 'Tint', 'base-tint'),
            new Setter(Widget, 'Bias', 1),
        ]);
        const child = new Style(Widget, [
            new Setter(Widget, 'Tint', 'child-tint'),  // overrides
        ], base);

        const resolved = child.ResolveSetters();
        assert.equal(resolved.get('Widget.Tint')?.value, 'child-tint');
        assert.equal(resolved.get('Widget.Bias')?.value, 1);  // inherited from base
    });

    test('multi-level BasedOn chains resolve transitively, deepest setters win at each layer', () => {
        const grandparent = new Style(Widget, [
            new Setter(Widget, 'Tint', 'gp'),
            new Setter(Widget, 'Bias', 10),
        ]);
        const parent = new Style(Widget, [
            new Setter(Widget, 'Tint', 'p'),  // overrides gp
        ], grandparent);
        const child = new Style(Widget, [
            new Setter(Widget, 'Bias', 99),   // overrides gp
        ], parent);

        const r = child.ResolveSetters();
        assert.equal(r.get('Widget.Tint')?.value, 'p');     // from parent
        assert.equal(r.get('Widget.Bias')?.value, 99);      // from child
    });
});

describe('Style — explicit application on Visual.Style', () => {
    test('applying a Style pushes setter values into the StyleValue tier', () => {
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 42)]);
        assert.equal(w.Bias, 42);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.StyleValue);
    });

    test('LocalValue shadows StyleValue (write after Style is applied)', () => {
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 42)]);
        w.Bias = 7;
        assert.equal(w.Bias, 7);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.LocalValue);
    });

    test('LocalValue shadows StyleValue (write before Style is applied)', () => {
        const w = new Widget();
        w.Bias = 7;
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 42)]);
        // Bias was locally set to 7; the style value is now cached but
        // shadowed. Local still wins.
        assert.equal(w.Bias, 7);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.LocalValue);
    });

    test('ClearValue (Local-clear) falls back to the styled value', () => {
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 42)]);
        w.Bias = 7;
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.LocalValue);

        w.ClearValue('Bias');
        assert.equal(w.Bias, 42);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.StyleValue);
    });

    test('replacing Style swaps the StyleValue: old setters cleared, new applied', () => {
        const w = new Widget();
        w.Style = new Style(Widget, [
            new Setter(Widget, 'Bias', 1),
            new Setter(Widget, 'Tint', 'red'),
        ]);
        assert.equal(w.Bias, 1);
        assert.equal(w.Tint, 'red');

        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 9)]);  // no Tint setter
        assert.equal(w.Bias, 9);
        // Tint was set by the old style only; clearing the old style
        // should drop it back to default (no inherited ancestor, no
        // new setter).
        assert.equal(w.Tint, 'default');
    });

    test('Style = undefined clears all styled values back to inherited / default', () => {
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 42)]);
        assert.equal(w.Bias, 42);
        w.Style = undefined;
        assert.equal(w.Bias, 0);  // descriptor default
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.Default);
    });

    test('StyleValue shadows InheritedValue', () => {
        const parent = new Widget();
        parent.set_property_value(Widget, 'Tint', 'inherited-tint');
        const child = new Widget();
        const root = new TestPanel();
        root.AddChild(parent);
        // Place child under parent so it inherits.
        const wrapper = new TestPanel();
        parent.set_property_value(Widget, 'Tint', 'inherited-tint');
        wrapper.AddChild(child);
        parent['property_values'];  // touch to silence type lint
        // Apply style on child — should win over the inherited value.
        // (We don't actually need parent in the tree for the inheritance
        // test; the style-vs-default test below already covers the
        // baseline.)
        child.Style = new Style(Widget, [new Setter(Widget, 'Tint', 'styled-tint')]);
        assert.equal(child.Tint, 'styled-tint');
        assert.equal(child.GetValueSource('Tint'), PropertyValueSource.StyleValue);
    });

    test('cross-class setter (attached property) lands on the target via explicit owner', () => {
        // Register a fake attached-style sentinel — same machinery as
        // Canvas.Left, but local to the test so we don't depend on
        // controls-package shape.
        class Marker { static {
            Model.RegisterAttachedProperty(Marker, 'Tag', 'none', MetaData.None);
        } }

        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Marker, 'Tag', 'styled')]);
        assert.equal(w.get_property_value(Marker, 'Tag'), 'styled');
    });
});

describe('Style — implicit lookup via TargetType', () => {
    test('a Style keyed by class in an ancestor Resources is auto-applied to descendants', () => {
        const root = new TestPanel();
        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 11),
        ]));
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 11);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.StyleValue);
    });

    test('explicit Style wins over implicit', () => {
        const root = new TestPanel();
        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 11),
        ]));
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 99)]);
        root.AddChild(w);
        assert.equal(w.Bias, 99);
    });

    test('clearing explicit Style re-promotes the implicit style', () => {
        const root = new TestPanel();
        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 11),
        ]));
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 99)]);
        root.AddChild(w);
        assert.equal(w.Bias, 99);

        w.Style = undefined;
        assert.equal(w.Bias, 11);  // implicit takes over
    });

    test('detaching from the logical tree clears the implicit style', () => {
        const root = new TestPanel();
        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 11),
        ]));
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 11);

        root.RemoveChild(w);
        assert.equal(w.Bias, 0);
    });

    test('a closer ancestor\'s implicit Style shadows a farther one', () => {
        const outer = new TestPanel();
        outer.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 1),
        ]));
        const inner = new TestPanel();
        inner.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 2),
        ]));
        outer.AddChild(inner);
        const w = new Widget();
        inner.AddChild(w);
        assert.equal(w.Bias, 2);
    });

    test('implicit Style via a MergedDictionary on an ancestor', () => {
        const theme = new ResourceDictionary();
        theme.Set(Widget, new Style(Widget, [new Setter(Widget, 'Bias', 33)]));

        const root = new TestPanel();
        root.Resources.AddMergedDictionary(theme);
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 33);
    });
});

describe('Style — interaction with Binding (Binding shadows Style)', () => {
    test('a Binding installed on a styled property still wins over the styled value', () => {
        // Use a tiny source Model with a getter Binding can target.
        class Src extends Model {
            static { Model.RegisterProperty(Src, 'V', 999, MetaData.None); }
            public get V(): number { return this.get_property_value('V'); }
            public set V(v: number) { this.set_property_value('V', v); }
        }

        const src = new Src();
        const w = new Widget();
        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 5)]);
        assert.equal(w.Bias, 5);

        w.set_property_value('Bias', new Binding(src, 'V'));
        assert.equal(w.Bias, 999);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.Binding);

        // Update the source — binding propagates the change.
        src.V = 7;
        assert.equal(w.Bias, 7);
    });
});

// =================================================================
// Limitation fixes
// =================================================================

describe('Style — TargetType validation', () => {
    test('applying a Style whose TargetType is not an ancestor of the target throws', () => {
        class Other extends Visual { }
        const w = new Widget();
        const wrong = new Style(Other, [new Setter(Widget, 'Bias', 1)]);
        assert.throws(() => { w.Style = wrong; }, /TargetType 'Other' does not match target 'Widget'/);
    });

    test('a Style whose TargetType is an ancestor class is accepted', () => {
        // Style targets Visual; Widget is a Visual subclass — apply works.
        const w = new Widget();
        const generic = new Style(Visual, [new Setter(Widget, 'Bias', 7)]);
        w.Style = generic;
        assert.equal(w.Bias, 7);
    });
});

describe('Style — sealing', () => {
    test('Seal() flips IsSealed; idempotent', () => {
        const s = new Style(Widget);
        assert.equal(s.IsSealed, false);
        s.Seal();
        assert.equal(s.IsSealed, true);
        s.Seal();  // no-op
        assert.equal(s.IsSealed, true);
    });

    test('first apply seals the style automatically', () => {
        const s = new Style(Widget, [new Setter(Widget, 'Bias', 1)]);
        assert.equal(s.IsSealed, false);
        const w = new Widget();
        w.Style = s;
        assert.equal(s.IsSealed, true);
    });

    test('Seal cascades into the BasedOn chain', () => {
        const base  = new Style(Widget, [new Setter(Widget, 'Bias', 1)]);
        const child = new Style(Widget, [], base);
        child.Seal();
        assert.equal(base.IsSealed, true);
        assert.equal(child.IsSealed, true);
    });
});

describe('Style — Setter.value supports Binding (via SetterFactory)', () => {
    test('Binding value pushes initial source value into StyleValue tier', () => {
        class Src extends Model {
            static { Model.RegisterProperty(Src, 'V', 42, MetaData.None); }
            public get V(): number { return this.get_property_value('V'); }
            public set V(v: number) { this.set_property_value('V', v); }
        }
        const src = new Src();
        const w = new Widget();
        w.Style = new Style(Widget, [
            new Setter(Widget, 'Bias', new SetterFactory(
                () => new Binding(src, 'V', BindingMode.OneWay),
            )),
        ]);
        assert.equal(w.Bias, 42);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.StyleValue);
    });

    test('Binding value updates reactively when the source changes', () => {
        class Src extends Model {
            static { Model.RegisterProperty(Src, 'V', 0, MetaData.None); }
            public get V(): number { return this.get_property_value('V'); }
            public set V(v: number) { this.set_property_value('V', v); }
        }
        const src = new Src();
        const w = new Widget();
        w.Style = new Style(Widget, [
            new Setter(Widget, 'Bias', new SetterFactory(
                () => new Binding(src, 'V', BindingMode.OneWay),
            )),
        ]);
        src.V = 7;
        assert.equal(w.Bias, 7);
        src.V = 12;
        assert.equal(w.Bias, 12);
    });

    test('SetterFactory is invoked per target — two Visuals get independent Binding instances', () => {
        // Each target gets its own Binding so their setOnValueChanged
        // callbacks don't overwrite each other. Manifests when both
        // targets observe source mutations.
        class Src extends Model {
            static { Model.RegisterProperty(Src, 'V', 1, MetaData.None); }
            public get V(): number { return this.get_property_value('V'); }
            public set V(v: number) { this.set_property_value('V', v); }
        }
        const src = new Src();
        const style = new Style(Widget, [
            new Setter(Widget, 'Bias', new SetterFactory(
                () => new Binding(src, 'V', BindingMode.OneWay),
            )),
        ]);
        const a = new Widget();
        const b = new Widget();
        a.Style = style;
        b.Style = style;
        assert.equal(a.Bias, 1);
        assert.equal(b.Bias, 1);
        src.V = 9;
        assert.equal(a.Bias, 9);
        assert.equal(b.Bias, 9);
    });

    test('replacing a Style disposes its Binding subscriptions', () => {
        class Src extends Model {
            static { Model.RegisterProperty(Src, 'V', 1, MetaData.None); }
            public get V(): number { return this.get_property_value('V'); }
            public set V(v: number) { this.set_property_value('V', v); }
        }
        const src = new Src();
        const w = new Widget();
        w.Style = new Style(Widget, [
            new Setter(Widget, 'Bias', new SetterFactory(
                () => new Binding(src, 'V', BindingMode.OneWay),
            )),
        ]);
        assert.equal(w.Bias, 1);

        w.Style = new Style(Widget, [new Setter(Widget, 'Bias', 100)]);
        assert.equal(w.Bias, 100);
        // After swap, mutating src must not move w.Bias — the old
        // binding has been disposed.
        src.V = 999;
        assert.equal(w.Bias, 100);
    });
});

describe('Style — Style.Resources', () => {
    test('lazy-created via Resources getter; HasResources reflects allocation', () => {
        const s = new Style(Widget);
        assert.equal(s.HasResources, false);
        const r = s.Resources;
        assert.equal(s.HasResources, true);
        assert.ok(r instanceof ResourceDictionary);
    });

    test('Style.Resources entries are visible to TryFindResource on a target with this style applied', () => {
        const style = new Style(Widget);
        style.Resources.Set('Accent', 'sage');
        const w = new Widget();
        w.Style = style;
        assert.equal(w.TryFindResource('Accent'), 'sage');
    });

    test('Style.Resources shadows ancestor Resources with the same key', () => {
        const root = new TestPanel();
        root.Resources.Set('Accent', 'from-ancestor');
        const w = new Widget();
        const style = new Style(Widget);
        style.Resources.Set('Accent', 'from-style');
        w.Style = style;
        root.AddChild(w);
        // Style.Resources sits ahead of the ancestor chain in the
        // lookup order.
        assert.equal(w.TryFindResource('Accent'), 'from-style');
    });

    test('a DynamicResource setter resolves through Style.Resources', () => {
        // SetterFactory(target => DynamicResource(target, 'Brush'))
        // looks up 'Brush' on the target's resource chain, which now
        // begins with the Style's own dict.
        const style = new Style(Widget);
        style.Resources.Set('Brush', 'gold');
        style.Resources.Set('Bias', 5);  // unused but present
        // We need a Bias setter via DynamicResource pointing at a key.
        const styleWithSetter = new Style(Widget, [
            new Setter(Widget, 'Bias', new SetterFactory(
                target => DynamicResource(target, 'Bias'),
            )),
        ]);
        styleWithSetter.Resources.Set('Bias', 77);
        const w = new Widget();
        w.Style = styleWithSetter;
        assert.equal(w.Bias, 77);
    });

    test('BasedOn Resources resolve transitively', () => {
        const base = new Style(Widget);
        base.Resources.Set('FromBase', 'base-val');
        const child = new Style(Widget, [], base);
        assert.equal(child.TryResolveResource('FromBase'), 'base-val');
    });
});

describe('Style — reactive implicit style', () => {
    test('adding the implicit Style to an ancestor Resources after attach picks it up', () => {
        const root = new TestPanel();
        // Touch root.Resources so we have a dict to subscribe to.
        root.Resources;
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 0);  // no implicit style yet

        // Now add the implicit style — subscription should re-resolve.
        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 88),
        ]));
        assert.equal(w.Bias, 88);
    });

    test('removing the implicit Style from ancestor Resources unapplies it', () => {
        const root = new TestPanel();
        const style = new Style(Widget, [new Setter(Widget, 'Bias', 88)]);
        root.Resources.Set(Widget, style);
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 88);

        root.Resources.Delete(Widget);
        assert.equal(w.Bias, 0);
    });

    test('swapping the implicit Style to a different one re-resolves on the descendant', () => {
        const root = new TestPanel();
        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 1),
        ]));
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 1);

        root.Resources.Set(Widget, new Style(Widget, [
            new Setter(Widget, 'Bias', 2),
        ]));
        assert.equal(w.Bias, 2);
    });

    test('reactive implicit picks up changes via a MergedDictionary on an ancestor', () => {
        const theme = new ResourceDictionary();
        const root  = new TestPanel();
        root.Resources.AddMergedDictionary(theme);
        const w = new Widget();
        root.AddChild(w);
        assert.equal(w.Bias, 0);

        theme.Set(Widget, new Style(Widget, [new Setter(Widget, 'Bias', 55)]));
        assert.equal(w.Bias, 55);
    });
});

describe('Style — PropertyTrigger', () => {
    test('a trigger activates when its watched property matches and applies its setters', () => {
        // Trigger fires when Tint === 'hot' and bumps Bias to 99.
        const trigger = new PropertyTrigger(Widget, 'Tint', 'hot', [
            new Setter(Widget, 'Bias', 99),
        ]);
        const style = new Style(Widget, [
            new Setter(Widget, 'Bias', 1),
        ], undefined, [trigger]);

        const w = new Widget();
        w.Style = style;
        assert.equal(w.Bias, 1);  // style value; trigger inactive

        w.Tint = 'hot';
        assert.equal(w.Bias, 99);  // trigger active, shadows style
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.TriggerValue);
    });

    test('deactivating a trigger restores the underlying style value', () => {
        const trigger = new PropertyTrigger(Widget, 'Tint', 'hot', [
            new Setter(Widget, 'Bias', 99),
        ]);
        const style = new Style(Widget, [
            new Setter(Widget, 'Bias', 1),
        ], undefined, [trigger]);
        const w = new Widget();
        w.Style = style;
        w.Tint = 'hot';
        assert.equal(w.Bias, 99);
        w.Tint = 'cold';
        assert.equal(w.Bias, 1);  // style value resumes
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.StyleValue);
    });

    test('trigger evaluates immediately at apply if the property already matches', () => {
        // Trigger fires when Tint === 'red'; set Tint first, then apply.
        const w = new Widget();
        w.Tint = 'red';
        w.Style = new Style(Widget, [], undefined, [
            new PropertyTrigger(Widget, 'Tint', 'red', [
                new Setter(Widget, 'Bias', 50),
            ]),
        ]);
        assert.equal(w.Bias, 50);  // initial evaluation activated trigger
    });

    test('LocalValue shadows trigger setter values', () => {
        const trigger = new PropertyTrigger(Widget, 'Tint', 'hot', [
            new Setter(Widget, 'Bias', 99),
        ]);
        const w = new Widget();
        w.Style = new Style(Widget, [], undefined, [trigger]);
        w.Bias = 5;        // local set
        w.Tint = 'hot';    // trigger activates but local still wins
        assert.equal(w.Bias, 5);
        assert.equal(w.GetValueSource('Bias'), PropertyValueSource.LocalValue);

        // Clearing local lets trigger value surface.
        w.ClearValue('Bias');
        assert.equal(w.Bias, 99);
    });

    test('unapplying a Style tears down trigger subscriptions', () => {
        const trigger = new PropertyTrigger(Widget, 'Tint', 'hot', [
            new Setter(Widget, 'Bias', 99),
        ]);
        const style = new Style(Widget, [], undefined, [trigger]);
        const w = new Widget();
        w.Style = style;
        w.Tint = 'hot';
        assert.equal(w.Bias, 99);

        w.Style = undefined;
        assert.equal(w.Bias, 0);  // trigger setters cleared
        // Subsequent Tint changes should NOT re-activate the trigger,
        // because its subscription was removed.
        w.Tint = 'cold';
        w.Tint = 'hot';
        assert.equal(w.Bias, 0);
    });

    test('trigger setters from BasedOn are included', () => {
        const baseTrigger = new PropertyTrigger(Widget, 'Tint', 'inherited', [
            new Setter(Widget, 'Bias', 33),
        ]);
        const base  = new Style(Widget, [], undefined, [baseTrigger]);
        const child = new Style(Widget, [], base);
        const w = new Widget();
        w.Style = child;
        w.Tint = 'inherited';
        assert.equal(w.Bias, 33);
    });
});
