import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicResource, MetaData, Model, Panel, ResourceDictionary, Size, Visual, type DrawingContext } from '../index.js';

// Tiny Visual with one MetaData.None property used as a DynamicResource
// target. Plain Visual doesn't expose anything settable, so we wrap.
class TargetLeaf extends Visual
{
    static {
        Model.RegisterProperty(TargetLeaf, 'Brush', undefined, MetaData.None);
    }
    public get Brush(): unknown { return this.get_property_value('Brush'); }
    public set Brush(v: unknown) { this.set_property_value('Brush', v); }
    protected override MeasureOverride(_a: Size): Size { return Size.Zero; }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

describe('ResourceDictionary — local entries + Resolve / CanResolve', () => {
    test('Resolve returns a locally-set entry', () => {
        const d = new ResourceDictionary();
        d.Set('K', 42);
        assert.equal(d.Resolve('K'), 42);
        assert.equal(d.CanResolve('K'), true);
    });

    test('Resolve / CanResolve return undefined / false for missing keys', () => {
        const d = new ResourceDictionary();
        assert.equal(d.Resolve('K'), undefined);
        assert.equal(d.CanResolve('K'), false);
    });

    test('Delete removes the entry; Clear empties everything', () => {
        const d = new ResourceDictionary();
        d.Set('A', 1);
        d.Set('B', 2);
        assert.equal(d.Delete('A'), true);
        assert.equal(d.CanResolve('A'), false);
        assert.equal(d.CanResolve('B'), true);
        d.Clear();
        assert.equal(d.CanResolve('B'), false);
        assert.equal(d.Size, 0);
    });
});

describe('ResourceDictionary — MergedDictionaries', () => {
    test('merged dictionary values become visible through the outer dict', () => {
        const inner = new ResourceDictionary();
        inner.Set('Accent', 'blue');
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(inner);
        assert.equal(outer.Resolve('Accent'), 'blue');
        assert.equal(outer.CanResolve('Accent'), true);
    });

    test('local entries shadow merged entries with the same key', () => {
        const inner = new ResourceDictionary();
        inner.Set('Accent', 'blue');
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(inner);
        outer.Set('Accent', 'red');
        assert.equal(outer.Resolve('Accent'), 'red');
    });

    test('last-merged dictionary wins on conflict (WPF semantics)', () => {
        const a = new ResourceDictionary();
        a.Set('Accent', 'from-A');
        const b = new ResourceDictionary();
        b.Set('Accent', 'from-B');
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(a);
        outer.AddMergedDictionary(b);
        assert.equal(outer.Resolve('Accent'), 'from-B');
    });

    test('RemoveMergedDictionary detaches and stops resolution through it', () => {
        const inner = new ResourceDictionary();
        inner.Set('K', 1);
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(inner);
        assert.equal(outer.Resolve('K'), 1);

        assert.equal(outer.RemoveMergedDictionary(inner), true);
        assert.equal(outer.Resolve('K'), undefined);
        assert.equal(outer.MergedDictionaries.length, 0);
    });

    test('nested merges resolve transitively', () => {
        const grandchild = new ResourceDictionary();
        grandchild.Set('Deep', 'value');
        const child = new ResourceDictionary();
        child.AddMergedDictionary(grandchild);
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(child);
        assert.equal(outer.Resolve('Deep'), 'value');
    });

    test('cycles are rejected (direct self-merge AND transitive)', () => {
        const d = new ResourceDictionary();
        assert.throws(() => d.AddMergedDictionary(d), /cannot merge.*into itself/);

        const a = new ResourceDictionary();
        const b = new ResourceDictionary();
        a.AddMergedDictionary(b);
        // b → a would create a → b → a cycle.
        assert.throws(() => b.AddMergedDictionary(a), /create a cycle/);
    });
});

describe('ResourceDictionary — Subscribe / change notifications', () => {
    test('Set fires the listener', () => {
        const d = new ResourceDictionary();
        let count = 0;
        d.Subscribe(() => { count++; });
        d.Set('K', 1);
        assert.equal(count, 1);
        d.Set('K', 2);
        assert.equal(count, 2);
    });

    test('Delete fires only when something was removed', () => {
        const d = new ResourceDictionary();
        d.Set('K', 1);
        let count = 0;
        d.Subscribe(() => { count++; });
        assert.equal(d.Delete('Missing'), false);
        assert.equal(count, 0);
        assert.equal(d.Delete('K'), true);
        assert.equal(count, 1);
    });

    test('Clear fires once when non-empty; no-ops when already empty', () => {
        const d = new ResourceDictionary();
        let count = 0;
        d.Subscribe(() => { count++; });
        d.Clear();
        assert.equal(count, 0);
        d.Set('K', 1);
        d.Clear();
        assert.equal(count, 2);  // Set + Clear
    });

    test('AddMergedDictionary / RemoveMergedDictionary fire the listener', () => {
        const inner = new ResourceDictionary();
        const outer = new ResourceDictionary();
        let count = 0;
        outer.Subscribe(() => { count++; });
        outer.AddMergedDictionary(inner);
        assert.equal(count, 1);
        outer.RemoveMergedDictionary(inner);
        assert.equal(count, 2);
    });

    test('mutating a merged dictionary forwards a notification to the outer dict', () => {
        const inner = new ResourceDictionary();
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(inner);
        let count = 0;
        outer.Subscribe(() => { count++; });
        // Reset to ignore the AddMergedDictionary fire.
        count = 0;
        inner.Set('K', 1);
        assert.equal(count, 1);
        inner.Delete('K');
        assert.equal(count, 2);
    });

    test('unsubscribe stops further notifications', () => {
        const d = new ResourceDictionary();
        let count = 0;
        const unsub = d.Subscribe(() => { count++; });
        d.Set('A', 1);
        unsub();
        d.Set('B', 2);
        assert.equal(count, 1);
    });

    test('RemoveMergedDictionary detaches the inner dict\'s forwarded notifications', () => {
        const inner = new ResourceDictionary();
        const outer = new ResourceDictionary();
        outer.AddMergedDictionary(inner);
        let count = 0;
        outer.Subscribe(() => { count++; });
        count = 0;  // ignore the AddMergedDictionary fire
        outer.RemoveMergedDictionary(inner);
        count = 0;  // and the RemoveMergedDictionary fire
        inner.Set('Z', 9);
        assert.equal(count, 0);
    });
});

describe('Visual.TryFindResource resolves through MergedDictionaries', () => {
    test('values from a merged dictionary on an ancestor are visible to descendants', () => {
        // The Visual ancestor walk finds a dictionary that CanResolve
        // the key, then Resolve returns the merged value.
        class TestPanel extends Panel { }
        const inner = new ResourceDictionary();
        inner.Set('Theme', 'dark');

        const root = new TestPanel();
        root.Resources.AddMergedDictionary(inner);

        const leaf = new TargetLeaf();
        root.AddChild(leaf);

        assert.equal(leaf.TryFindResource('Theme'), 'dark');
    });
});

describe('DynamicResource', () => {
    test('initial resolution returns the current value from the ancestor chain', () => {
        class TestPanel extends Panel { }
        const root = new TestPanel();
        root.Resources.Set('Brush', 'gold');
        const leaf = new TargetLeaf();
        root.AddChild(leaf);

        leaf.set_property_value('Brush', DynamicResource(leaf, 'Brush'));
        assert.equal(leaf.Brush, 'gold');
    });

    test('updating the resource propagates to the bound target', () => {
        class TestPanel extends Panel { }
        const root = new TestPanel();
        root.Resources.Set('Brush', 'gold');
        const leaf = new TargetLeaf();
        root.AddChild(leaf);

        leaf.set_property_value('Brush', DynamicResource(leaf, 'Brush'));
        assert.equal(leaf.Brush, 'gold');

        root.Resources.Set('Brush', 'silver');
        assert.equal(leaf.Brush, 'silver');
    });

    test('updates through a MergedDictionary propagate', () => {
        class TestPanel extends Panel { }
        const theme = new ResourceDictionary();
        theme.Set('Brush', 'theme-blue');
        const root = new TestPanel();
        root.Resources.AddMergedDictionary(theme);
        const leaf = new TargetLeaf();
        root.AddChild(leaf);

        leaf.set_property_value('Brush', DynamicResource(leaf, 'Brush'));
        assert.equal(leaf.Brush, 'theme-blue');

        theme.Set('Brush', 'theme-red');
        assert.equal(leaf.Brush, 'theme-red');
    });

    test('adding a merging dictionary at runtime re-resolves through it', () => {
        // Tests the change-notification forwarding path: the outer
        // dict's listeners fire on AddMergedDictionary, the
        // DynamicResource re-resolves, and the binding picks up the
        // newly-visible value.
        class TestPanel extends Panel { }
        const root = new TestPanel();
        // root.Resources has nothing yet — DynamicResource still
        // subscribes to it (since the dict exists, even if empty).
        root.Resources;
        const leaf = new TargetLeaf();
        root.AddChild(leaf);

        leaf.set_property_value('Brush', DynamicResource(leaf, 'Brush'));
        assert.equal(leaf.Brush, undefined);

        const theme = new ResourceDictionary();
        theme.Set('Brush', 'merged-in');
        root.Resources.AddMergedDictionary(theme);
        assert.equal(leaf.Brush, 'merged-in');
    });

    test('replacing the DynamicResource with a local value disposes subscriptions', () => {
        class TestPanel extends Panel { }
        const root = new TestPanel();
        root.Resources.Set('Brush', 'one');
        const leaf = new TargetLeaf();
        root.AddChild(leaf);

        leaf.set_property_value('Brush', DynamicResource(leaf, 'Brush'));
        leaf.set_property_value('Brush', 'manual');
        assert.equal(leaf.Brush, 'manual');

        // After replacement, the old subscription is disposed —
        // mutating the dict no longer updates the target.
        root.Resources.Set('Brush', 'two');
        assert.equal(leaf.Brush, 'manual');
    });

    test('a closer ancestor shadows a farther one and DynamicResource picks the close value', () => {
        class TestPanel extends Panel { }
        const outer = new TestPanel();
        outer.Resources.Set('Brush', 'outer');
        const inner = new TestPanel();
        inner.Resources.Set('Brush', 'inner');
        outer.AddChild(inner);
        const leaf = new TargetLeaf();
        inner.AddChild(leaf);

        leaf.set_property_value('Brush', DynamicResource(leaf, 'Brush'));
        assert.equal(leaf.Brush, 'inner');
    });
});

describe('ResourceDictionary — Root marker (x:root)', () => {
    test('Root is undefined on a fresh dictionary', () => {
        const d = new ResourceDictionary();
        assert.equal(d.Root, undefined);
    });

    test('setting Root then reading it returns the same Visual', () => {
        const d = new ResourceDictionary();
        const v = new TargetLeaf();
        d.Root = v;
        assert.equal(d.Root, v);
    });

    test('re-assigning the same Visual is idempotent', () => {
        const d = new ResourceDictionary();
        const v = new TargetLeaf();
        d.Root = v;
        assert.doesNotThrow(() => { d.Root = v; });
        assert.equal(d.Root, v);
    });

    test('assigning a different Visual over an existing Root throws', () => {
        const d = new ResourceDictionary();
        const a = new TargetLeaf();
        const b = new TargetLeaf();
        d.Root = a;
        assert.throws(() => { d.Root = b; }, /only one x:root per dictionary/);
        // Original root remains.
        assert.equal(d.Root, a);
    });

    test('assigning undefined clears Root and re-assignment is then allowed', () => {
        const d = new ResourceDictionary();
        const a = new TargetLeaf();
        const b = new TargetLeaf();
        d.Root = a;
        d.Root = undefined;
        assert.equal(d.Root, undefined);
        d.Root = b;
        assert.equal(d.Root, b);
    });
});
