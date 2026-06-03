import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Panel, Size, Visual, type DrawingContext } from '../../runtime/index.js';
import { DataTemplate, ItemsControl } from '../index.js';

class Leaf extends Visual
{
    constructor(public readonly source: unknown) { super(); }
    protected override MeasureOverride(_a: Size): Size { return new Size(10, 10); }
    protected override RenderOverride(_dc: DrawingContext): void { }
}

class TestPanel extends Panel { }

function makeIC(items: readonly string[]): ItemsControl
{
    const ic = new ItemsControl();
    ic.ItemsPanel   = () => new TestPanel();
    ic.ItemTemplate = new DataTemplate(data => new Leaf(data));
    ic.Items        = items;
    return ic;
}

describe('ItemContainerGenerator', () => {
    test('exposed via ItemsControl.Generator and populated after ItemsControl materializes', () => {
        const ic = makeIC(['a', 'b', 'c']);
        assert.equal(ic.Generator.Count, 3);
        assert.equal(ic.Generator.IsRealized('a'), true);
        assert.equal(ic.Generator.IsRealized('b'), true);
        assert.equal(ic.Generator.IsRealized('c'), true);
        assert.equal(ic.Generator.IsRealized('zzz'), false);
    });

    test('ContainerFromItem returns the same Visual that ItemsControl exposes as a logical child', () => {
        const ic = makeIC(['a', 'b']);
        const containerA = ic.Generator.ContainerFromItem('a');
        assert.ok(containerA instanceof Leaf);
        assert.equal(containerA, ic.logicalChildren[0]);
    });

    test('ItemFromContainer is the inverse of ContainerFromItem', () => {
        const ic = makeIC(['a', 'b']);
        const c = ic.Generator.ContainerFromItem('a')!;
        assert.equal(ic.Generator.ItemFromContainer(c), 'a');
    });

    test('Realize on the same item is idempotent — returns the cached container', () => {
        const ic = makeIC(['a']);
        const first = ic.Generator.ContainerFromItem('a')!;
        const again = ic.Generator.Realize('a');
        assert.equal(first, again);
    });

    test('Recycle drops the mapping; subsequent Realize creates a fresh container', () => {
        const ic = makeIC(['a']);
        const first = ic.Generator.ContainerFromItem('a')!;
        ic.Generator.Recycle(first);
        assert.equal(ic.Generator.IsRealized('a'), false);

        const fresh = ic.Generator.Realize('a');
        assert.notEqual(fresh, first);
    });

    test('Clear empties the mappings', () => {
        const ic = makeIC(['a', 'b', 'c']);
        assert.equal(ic.Generator.Count, 3);
        ic.Generator.Clear();
        assert.equal(ic.Generator.Count, 0);
    });

    test('Realize throws when no template resolves for the item', () => {
        const ic = new ItemsControl();
        // No ItemTemplate, no ItemTemplateSelector, no override.
        // The error now surfaces the multiple resolution options
        // because Realize delegates through GetContainerForItemOverride.
        assert.throws(() => ic.Generator.Realize('a'), /DataTemplate resolved/);
    });

    test('replacing ItemTemplate clears the generator; old containers go away on next rebuild', () => {
        const ic = makeIC(['a', 'b']);
        const oldContainer = ic.Generator.ContainerFromItem('a');
        ic.ItemTemplate = new DataTemplate(data => new Leaf(`wrapped:${data}`));
        // After the new template, the generator should hold new containers.
        const newContainer = ic.Generator.ContainerFromItem('a');
        assert.ok(newContainer instanceof Leaf);
        assert.notEqual(newContainer, oldContainer);
    });

    test('replacing Items clears the generator before re-populating', () => {
        const ic = makeIC(['a', 'b']);
        assert.equal(ic.Generator.IsRealized('a'), true);
        ic.Items = ['x', 'y'];
        assert.equal(ic.Generator.IsRealized('a'), false);
        assert.equal(ic.Generator.IsRealized('x'), true);
    });
});
