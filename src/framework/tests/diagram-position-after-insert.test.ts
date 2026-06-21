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
    type DrawingContext,
    type MountableTarget,
} from '../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../basic/index.js';
import { Diagram } from '../diagram/diagram.js';
import { Figure } from '../diagram/figure.js';
import { SelectionMode } from '../list/list-box.js';

// Minimal node VM — mirrors the diagram demo's ShapeNodeVM shape with
// X / Y / IsSelected DPs.
class TestNodeVM extends Model
{
    public static readonly IdKey   = Model.RegisterProperty<string>(TestNodeVM, 'Id',   '',    MetaData.None);
    public static readonly XKey    = Model.RegisterProperty<number>(TestNodeVM, 'X',    0,     MetaData.None);
    public static readonly YKey    = Model.RegisterProperty<number>(TestNodeVM, 'Y',    0,     MetaData.None);
    public static readonly SizeKey = Model.RegisterProperty<number>(TestNodeVM, 'Size', 80,    MetaData.None);
    constructor(id: string, x: number, y: number)
    {
        super();
        this.set_property_value(TestNodeVM.IdKey, id);
        this.set_property_value(TestNodeVM.XKey, x);
        this.set_property_value(TestNodeVM.YKey, y);
    }
    public get X(): number  { return this.get_property_value(TestNodeVM.XKey); }
    public set X(v: number) { this.set_property_value(TestNodeVM.XKey, v); }
    public get Y(): number  { return this.get_property_value(TestNodeVM.YKey); }
    public set Y(v: number) { this.set_property_value(TestNodeVM.YKey, v); }
}

class FakeTarget implements MountableTarget
{
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

describe('Diagram — existing container X/Y persistence after a new item is inserted', () => {
    beforeEach(() => {
        Application.current = null;
        new Application();
    });

    test('moving Figure.X (TwoWay binding) survives a subsequent ObservableCollection.Add', () => {
        const items = new ObservableCollection<TestNodeVM>();
        const a = new TestNodeVM('a', 100, 100);
        items.Add(a);

        const diagram = new Diagram();
        diagram.SelectionMode = SelectionMode.Extended;
        diagram.ItemsPanel    = new ItemsPanelTemplate(() => new Canvas());

        // ItemContainerStyle wires the X / Y bindings the same way the
        // demo's FigureStyle does.
        const style = new Style(Figure, [
            new Setter(Figure, 'X', new SetterFactory((t: Visual) => DataContextBinding(t, 'X'))),
            new Setter(Figure, 'Y', new SetterFactory((t: Visual) => DataContextBinding(t, 'Y'))),
        ], undefined, [], []);
        diagram.ItemContainerStyle = style;

        diagram.ItemsSource = items;

        // Mount in a Border so layout has somewhere to flow into.
        const surface = new Border();
        (surface as unknown as { Child: Visual }).Child = diagram;
        const target = new FakeTarget();
        target.Content = surface;
        (surface as Visual).Measure(new Size(800, 600));
        (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as any);

        // Find the realized Figure for `a`.
        const containerA = (diagram as unknown as { _generator: { ContainerFromItem(item: unknown): Visual | undefined } })
            ._generator.ContainerFromItem(a) as Figure | undefined;
        assert.ok(containerA instanceof Figure, 'A container should have realized for item a');

        // Simulate a drag: write a new X / Y onto the container.
        containerA.X = 300;
        containerA.Y = 220;

        // TwoWay binding should have pushed the values to the VM.
        assert.equal(a.X, 300, 'container.X push should have updated VM.X via TwoWay binding');
        assert.equal(a.Y, 220, 'container.Y push should have updated VM.Y via TwoWay binding');

        // Now insert a new item — same as a toolbox drop.
        const b = new TestNodeVM('b', 50, 50);
        items.Add(b);

        // The previously-moved container MUST stay at (300, 220).
        assert.equal(containerA.X, 300, 'container A.X must not snap back after a sibling is inserted');
        assert.equal(containerA.Y, 220, 'container A.Y must not snap back after a sibling is inserted');
        assert.equal(a.X, 300, 'VM A.X must not be reset by the insert');
        assert.equal(a.Y, 220, 'VM A.Y must not be reset by the insert');
    });
});
