import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Panel, Size, Element, Visual, type DrawingContext } from '../../runtime/index.js';
import { DataTemplate } from '../index.js';
import { ItemsControl } from '@pragmatic-lab/mural/framework';

class Leaf extends Element
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

// Each item-container is a ContentPresenter wrapping the template
// output. `inner` peels that wrap so tests can assert against the
// template's actual Visual (e.g. `inner(c) instanceof Leaf`). Falls
// through when the container isn't a wrapper (subclass overrides
// might return raw template output).
function inner(container: Visual | undefined): Visual | undefined
{
    return container === undefined
        ? undefined
        : (container.visualChildren[0] ?? container);
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
        // Container is the per-item ContentPresenter wrapping the
        // template output. The presenter is the logical child of the
        // ItemsControl; the template's Leaf lives inside it.
        assert.ok(inner(containerA) instanceof Leaf);
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

    test('Realize falls back to stringifying the item when no template resolves', () => {
        const ic = new ItemsControl();
        // No ItemTemplate, no ItemTemplateSelector, no override.
        // GetContainerForItemOverride still builds a ContentPresenter
        // — the presenter's primitive-fallback path renders the data
        // as a TextBlock(String(item)). WPF parity with default
        // ContentPresenter rendering.
        const c = ic.Generator.Realize('hello');
        const text = inner(c);
        // TextBlock is the fallback; its constructor accepted "hello".
        assert.ok(text !== undefined);
        assert.equal((text as unknown as { Text?: string }).Text, 'hello');
    });

    test('replacing ItemTemplate clears the generator; old containers go away on next rebuild', () => {
        const ic = makeIC(['a', 'b']);
        const oldContainer = ic.Generator.ContainerFromItem('a');
        ic.ItemTemplate = new DataTemplate(data => new Leaf(`wrapped:${data}`));
        // After the new template, the generator should hold new containers.
        const newContainer = ic.Generator.ContainerFromItem('a');
        assert.ok(inner(newContainer) instanceof Leaf);
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
