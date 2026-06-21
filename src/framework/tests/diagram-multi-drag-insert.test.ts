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
import { DiagramNode } from '../diagram/figure.js';
import { SelectionMode } from '../list/list-box.js';

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
        this.set_property_value(TestNodeVM.XKey, x);
        this.set_property_value(TestNodeVM.YKey, y);
    }
    public get Id(): string         { return this.get_property_value(TestNodeVM.IdKey); }
    public get X():  number         { return this.get_property_value(TestNodeVM.XKey); }
    public set X(v: number)         { this.set_property_value(TestNodeVM.XKey, v); }
    public get Y():  number         { return this.get_property_value(TestNodeVM.YKey); }
    public set Y(v: number)         { this.set_property_value(TestNodeVM.YKey, v); }
    public get IsSelected(): boolean  { return this.get_property_value(TestNodeVM.IsSelectedKey); }
    public set IsSelected(v: boolean) { this.set_property_value(TestNodeVM.IsSelectedKey, v); }
}

class FakeTarget implements MountableTarget
{
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

interface InternalGen
{
    ContainerFromItem(item: unknown): Visual | undefined;
}

function makeDiagram(): { diagram: Diagram; surface: Border; items: ObservableCollection<TestNodeVM> } {
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

function relayout(surface: Border): void
{
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as any);
}

function container(diagram: Diagram, item: unknown): DiagramNode
{
    const gen = (diagram as unknown as { _generator: InternalGen })._generator;
    const c   = gen.ContainerFromItem(item);
    assert.ok(c instanceof DiagramNode, 'container should be DiagramNode');
    return c;
}

describe('Diagram — multi-drag + multi-insert position persistence', () => {
    beforeEach(() => {
        Application.current = null;
        new Application();
    });

    test('5 sequential drags + 5 sequential inserts: every move persists', () => {
        const { diagram, surface, items } = makeDiagram();

        // Seed five items at known positions.
        const seeded: TestNodeVM[] = [
            new TestNodeVM('a', 100, 100),
            new TestNodeVM('b', 100, 100),
            new TestNodeVM('c', 100, 100),
            new TestNodeVM('d', 100, 100),
            new TestNodeVM('e', 100, 100),
        ];
        for (const n of seeded) items.Add(n);
        relayout(surface);

        // Drag each one to a unique position.
        const targets = [
            { x: 200, y: 250 },
            { x: 320, y: 110 },
            { x:  80, y: 380 },
            { x: 500, y: 200 },
            { x: 410, y: 340 },
        ];
        for (let i = 0; i < seeded.length; i++)
        {
            const c = container(diagram, seeded[i]);
            c.X = targets[i].x;
            c.Y = targets[i].y;
        }

        // Now simulate the toolbox drop: select a fresh inserted item.
        const fresh: TestNodeVM[] = [];
        for (let i = 0; i < 5; i++)
        {
            const fi = new TestNodeVM('f' + i, 50 + i * 20, 50 + i * 20);
            items.Add(fi);
            // Mirror the canvas-drop-behavior pattern: select the just-dropped node.
            diagram.SelectedItem = fi;
            fresh.push(fi);
            relayout(surface);
        }

        // Every previously-moved container must still be at its target.
        for (let i = 0; i < seeded.length; i++)
        {
            const c = container(diagram, seeded[i]);
            assert.equal(c.X,  targets[i].x, `seeded[${i}].container.X should still be ${targets[i].x} but was ${c.X}`);
            assert.equal(c.Y,  targets[i].y, `seeded[${i}].container.Y should still be ${targets[i].y} but was ${c.Y}`);
            assert.equal(seeded[i].X, targets[i].x, `seeded[${i}].VM.X should still be ${targets[i].x} but was ${seeded[i].X}`);
            assert.equal(seeded[i].Y, targets[i].y, `seeded[${i}].VM.Y should still be ${targets[i].y} but was ${seeded[i].Y}`);
        }
    });

    test('interleaved drag-then-insert-then-drag cycles', () => {
        const { diagram, surface, items } = makeDiagram();

        const a = new TestNodeVM('a', 100, 100);
        items.Add(a);
        relayout(surface);

        // Drag a to (200, 200).
        const cA = container(diagram, a);
        cA.X = 200; cA.Y = 200;
        assert.equal(a.X, 200);
        assert.equal(a.Y, 200);

        // Insert b.
        const b = new TestNodeVM('b', 50, 50);
        items.Add(b);
        diagram.SelectedItem = b;
        relayout(surface);
        // a must not snap back.
        assert.equal(container(diagram, a).X, 200, 'a.X after b insert');
        assert.equal(container(diagram, a).Y, 200, 'a.Y after b insert');

        // Drag b to (300, 300).
        const cB = container(diagram, b);
        cB.X = 300; cB.Y = 300;
        assert.equal(b.X, 300);
        assert.equal(b.Y, 300);

        // Insert c.
        const c = new TestNodeVM('c', 60, 60);
        items.Add(c);
        diagram.SelectedItem = c;
        relayout(surface);
        // a and b must persist.
        assert.equal(container(diagram, a).X, 200, 'a.X after c insert');
        assert.equal(container(diagram, b).X, 300, 'b.X after c insert');

        // Drag c to (400, 400).
        const cC = container(diagram, c);
        cC.X = 400; cC.Y = 400;
        assert.equal(c.X, 400);
        assert.equal(c.Y, 400);

        // Drag a again to (250, 250). Re-fetch container — Refresh
        // discards the prior DiagramNode instance.
        const cA2 = container(diagram, a);
        cA2.X = 250; cA2.Y = 250;
        assert.equal(a.X, 250);
        assert.equal(a.Y, 250);

        // Insert d.
        const d = new TestNodeVM('d', 70, 70);
        items.Add(d);
        diagram.SelectedItem = d;
        relayout(surface);
        assert.equal(container(diagram, a).X, 250, 'a.X after d insert');
        assert.equal(container(diagram, b).X, 300, 'b.X after d insert');
        assert.equal(container(diagram, c).X, 400, 'c.X after d insert');
    });

    test('drag → selection-replace mid-cycle does not snap previously-moved nodes', () => {
        const { diagram, surface, items } = makeDiagram();

        const a = new TestNodeVM('a', 100, 100);
        const b = new TestNodeVM('b', 100, 100);
        const c = new TestNodeVM('c', 100, 100);
        items.Add(a); items.Add(b); items.Add(c);
        relayout(surface);

        const cA = container(diagram, a);
        const cB = container(diagram, b);
        const cC = container(diagram, c);
        cA.X = 200; cA.Y = 200;
        cB.X = 300; cB.Y = 300;
        cC.X = 400; cC.Y = 400;

        // Mimic the drop's selector mutation that the canvas-drop-behavior performs.
        diagram.SelectedItem = a;
        diagram.SelectedItem = b;
        diagram.SelectedItem = c;
        diagram.SelectedItem = undefined;

        assert.equal(cA.X, 200, 'a.X after selection churn');
        assert.equal(cB.X, 300, 'b.X after selection churn');
        assert.equal(cC.X, 400, 'c.X after selection churn');
    });
});
