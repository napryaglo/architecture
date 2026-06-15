import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    Model,
    ObservableCollection,
    SetterFactory,
    Style,
    Setter,
    Size,
    Visual,
    DataContextBinding,
    type MountableTarget,
} from '../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../basic/index.js';
import { Diagram } from '../diagram/diagram.js';
import { DiagramNode } from '../diagram/diagram-node.js';
import { SelectionMode } from '../list/list-box.js';

// Demo-shaped VM with X/Y/IsSelected. Mirrors the shape ShapeNodeVM
// publishes in the diagram demo so the test exercises the real
// container/style binding chain.
class TestNodeVM extends Model
{
    public static readonly IdKey         = Model.RegisterProperty<string>(TestNodeVM, 'Id',         '',    MetaData.None);
    public static readonly XKey          = Model.RegisterProperty<number>(TestNodeVM, 'X',          0,     MetaData.None);
    public static readonly YKey          = Model.RegisterProperty<number>(TestNodeVM, 'Y',          0,     MetaData.None);
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(TestNodeVM, 'IsSelected', false, MetaData.None);
    constructor(id: string, x: number, y: number)
    {
        super();
        this.set_property_value(TestNodeVM.IdKey, id);
        this.set_property_value(TestNodeVM.XKey,  x);
        this.set_property_value(TestNodeVM.YKey,  y);
    }
    public get Id(): string         { return this.get_property_value(TestNodeVM.IdKey); }
    public get X():  number         { return this.get_property_value(TestNodeVM.XKey); }
    public set X(v: number)         { this.set_property_value(TestNodeVM.XKey, v); }
    public get Y():  number         { return this.get_property_value(TestNodeVM.YKey); }
    public set Y(v: number)         { this.set_property_value(TestNodeVM.YKey, v); }
}

class FakeTarget implements MountableTarget
{
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

function setup() {
    Application.current = null;
    new Application();
    const items   = new ObservableCollection<TestNodeVM>();
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel    = new ItemsPanelTemplate(() => new Canvas());
    const style = new Style(DiagramNode, [
        new Setter(DiagramNode, 'X', new SetterFactory((t: Visual) => DataContextBinding(t, 'X'))),
        new Setter(DiagramNode, 'Y', new SetterFactory((t: Visual) => DataContextBinding(t, 'Y'))),
    ], undefined, [], []);
    diagram.ItemContainerStyle = style;
    diagram.ItemsSource = items;
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = diagram;
    const target = new FakeTarget();
    target.Content = surface;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as any);
    return { diagram, surface, items };
}

function cont(diagram: Diagram, item: unknown): DiagramNode {
    const gen = (diagram as unknown as { _generator: { ContainerFromItem(item: unknown): Visual | undefined } })._generator;
    const c = gen.ContainerFromItem(item);
    assert.ok(c instanceof DiagramNode, 'container should be DiagramNode');
    return c;
}

describe('CollectionView incremental forwarding (no Filter/Sort/Group)', () => {
    beforeEach(() => {
        Application.current = null;
        new Application();
    });

    test('Add preserves existing containers — same identity across N adds', () => {
        const { diagram, items } = setup();
        const a = new TestNodeVM('a', 100, 100);
        items.Add(a);
        const cA0 = cont(diagram, a);

        for (let i = 0; i < 10; i++)
        {
            items.Add(new TestNodeVM('x' + i, 0, 0));
            const cAi = cont(diagram, a);
            assert.strictEqual(cAi, cA0, `existing container should be preserved after Add #${i}`);
        }
    });

    test('Add preserves user-written X/Y on existing containers across N adds', () => {
        const { diagram, items } = setup();
        const seeded: TestNodeVM[] = [];
        const targets: { x: number; y: number }[] = [];
        for (let i = 0; i < 5; i++)
        {
            const vm = new TestNodeVM('s' + i, 100, 100);
            seeded.push(vm);
            items.Add(vm);
            const t = { x: 200 + i * 50, y: 100 + i * 30 };
            targets.push(t);
            const c = cont(diagram, vm);
            c.X = t.x; c.Y = t.y;
        }
        for (let i = 0; i < 5; i++)
        {
            items.Add(new TestNodeVM('f' + i, 0, 0));
            for (let j = 0; j < seeded.length; j++)
            {
                const c = cont(diagram, seeded[j]);
                assert.equal(c.X, targets[j].x, `seeded[${j}].X after Add f${i}`);
                assert.equal(c.Y, targets[j].y, `seeded[${j}].Y after Add f${i}`);
                assert.equal(seeded[j].X, targets[j].x, `seeded[${j}].VM.X after Add f${i}`);
                assert.equal(seeded[j].Y, targets[j].y, `seeded[${j}].VM.Y after Add f${i}`);
            }
        }
    });

    test('Remove preserves untouched containers', () => {
        const { diagram, items } = setup();
        const a = new TestNodeVM('a', 100, 100);
        const b = new TestNodeVM('b', 100, 100);
        const c = new TestNodeVM('c', 100, 100);
        items.Add(a); items.Add(b); items.Add(c);
        const cA = cont(diagram, a);
        const cC = cont(diagram, c);
        items.Remove(b);
        assert.strictEqual(cont(diagram, a), cA, 'a container identity preserved after Remove(b)');
        assert.strictEqual(cont(diagram, c), cC, 'c container identity preserved after Remove(b)');
    });

    test('Insert at index preserves existing containers', () => {
        const { diagram, items } = setup();
        const a = new TestNodeVM('a', 100, 100);
        const c = new TestNodeVM('c', 100, 100);
        items.Add(a); items.Add(c);
        const cA = cont(diagram, a);
        const cC = cont(diagram, c);
        const b = new TestNodeVM('b', 100, 100);
        items.Insert(1, b);
        assert.strictEqual(cont(diagram, a), cA, 'a container preserved after Insert(b)');
        assert.strictEqual(cont(diagram, c), cC, 'c container preserved after Insert(b)');
    });
});
