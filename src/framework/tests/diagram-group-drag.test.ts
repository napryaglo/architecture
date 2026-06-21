import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    MetaData,
    Model,
    NoModifiers,
    ObservableCollection,
    PointerButton,
    SetterFactory,
    Style,
    Setter,
    Size,
    Visual,
    DataContextBinding,
    type MountableTarget,
} from '../../runtime/index.js';
import type { PointerEventInit } from '../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../basic/index.js';
import { Diagram } from '../diagram/diagram.js';
import { Figure } from '../diagram/figure.js';
import { InputManager } from '../index.js';
import { SelectionMode } from '../list/list-box.js';

class NodeVM extends Model
{
    public static readonly IdKey = Model.RegisterProperty<string>(NodeVM, 'Id', '', MetaData.None);
    public static readonly XKey  = Model.RegisterProperty<number>(NodeVM, 'X',  0,  MetaData.None);
    public static readonly YKey  = Model.RegisterProperty<number>(NodeVM, 'Y',  0,  MetaData.None);
    constructor(id: string, x: number, y: number) {
        super();
        this.set_property_value(NodeVM.IdKey, id);
        this.set_property_value(NodeVM.XKey,  x);
        this.set_property_value(NodeVM.YKey,  y);
    }
    public get Id(): string  { return this.get_property_value(NodeVM.IdKey); }
    public get X():  number  { return this.get_property_value(NodeVM.XKey); }
    public set X(v: number)  { this.set_property_value(NodeVM.XKey, v); }
    public get Y():  number  { return this.get_property_value(NodeVM.YKey); }
    public set Y(v: number)  { this.set_property_value(NodeVM.YKey, v); }
}

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

function pointerInit(overrides: Partial<PointerEventInit> = {}): PointerEventInit {
    return {
        HostX:       0,
        HostY:       0,
        Button:      PointerButton.Primary,
        Buttons:     1,
        Modifiers:   NoModifiers,
        PointerId:   0,
        Pressure:    0,
        PointerType: 'mouse',
        ...overrides,
    };
}

function setup() {
    Application.current = null;
    new Application();
    const items   = new ObservableCollection<NodeVM>();
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel    = new ItemsPanelTemplate(() => new Canvas());
    const style = new Style(Figure, [
        new Setter(Figure, 'X', new SetterFactory((t: Visual) => DataContextBinding(t, 'X'))),
        new Setter(Figure, 'Y', new SetterFactory((t: Visual) => DataContextBinding(t, 'Y'))),
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

function cont(diagram: Diagram, item: unknown): Figure {
    const gen = (diagram as unknown as { _generator: { ContainerFromItem(item: unknown): Visual | undefined } })._generator;
    const c = gen.ContainerFromItem(item);
    assert.ok(c instanceof Figure, 'container should be Figure');
    return c;
}

describe('Diagram — group drag', () => {
    beforeEach(() => {
        Application.current = null;
        new Application();
    });

    test('dragging a selected shape moves every other selected shape by the same delta', () => {
        const { diagram, items } = setup();
        const a = new NodeVM('a', 100, 100);
        const b = new NodeVM('b', 300, 200);
        const c = new NodeVM('c', 500, 350);
        items.Add(a); items.Add(b); items.Add(c);

        const cA = cont(diagram, a);
        const cB = cont(diagram, b);
        const cC = cont(diagram, c);

        // Extended selection: all three are part of the active selection.
        diagram.SelectedItem = a;
        diagram.HandleContainerClick(cB, { Control: true, Shift: false, Alt: false, Meta: false });
        diagram.HandleContainerClick(cC, { Control: true, Shift: false, Alt: false, Meta: false });
        assert.equal(diagram.SelectedItems.length, 3, 'three items selected');

        // Press on A at (150, 150) — inside A's hit area (A is at 100,100).
        const im = new InputManager();
        im.InjectPointerDown(cA, pointerInit({ HostX: 150, HostY: 150 }));

        // Move past the click threshold then to (250, 220). Cumulative
        // delta on A from (100,100) → (200,170).
        im.InjectPointerMove(cA, pointerInit({ HostX: 200, HostY: 200 }));
        im.InjectPointerMove(cA, pointerInit({ HostX: 250, HostY: 220 }));

        // A's container.X = 250 - 50 (grabOffsetX = 150-100) = 200. Y similarly.
        assert.equal(cA.X, 200, 'A.X after drag');
        assert.equal(cA.Y, 170, 'A.Y after drag');
        // B / C shifted by the same vector: (+100, +70).
        assert.equal(cB.X, 400, 'B.X after group drag');
        assert.equal(cB.Y, 270, 'B.Y after group drag');
        assert.equal(cC.X, 600, 'C.X after group drag');
        assert.equal(cC.Y, 420, 'C.Y after group drag');

        // VMs mirror.
        assert.equal(a.X, 200); assert.equal(a.Y, 170);
        assert.equal(b.X, 400); assert.equal(b.Y, 270);
        assert.equal(c.X, 600); assert.equal(c.Y, 420);

        im.InjectPointerUp(cA, pointerInit({ HostX: 250, HostY: 220 }));
    });

    test('dragging an unselected shape leaves the existing selection in place', () => {
        const { diagram, items } = setup();
        const a = new NodeVM('a', 100, 100);
        const b = new NodeVM('b', 300, 200);
        const c = new NodeVM('c', 500, 350);
        items.Add(a); items.Add(b); items.Add(c);

        const cA = cont(diagram, a);
        const cB = cont(diagram, b);
        const cC = cont(diagram, c);

        // Select only A + B. C is NOT in the selection.
        diagram.SelectedItem = a;
        diagram.HandleContainerClick(cB, { Control: true, Shift: false, Alt: false, Meta: false });

        // Press on C — unselected — and drag.
        const im = new InputManager();
        im.InjectPointerDown(cC, pointerInit({ HostX: 550, HostY: 400 }));
        im.InjectPointerMove(cC, pointerInit({ HostX: 600, HostY: 450 }));
        im.InjectPointerMove(cC, pointerInit({ HostX: 700, HostY: 500 }));

        // C followed the cursor.
        assert.equal(cC.X, 650, 'C.X after solo drag (700 - 50 grab)');
        assert.equal(cC.Y, 450, 'C.Y after solo drag (500 - 50 grab)');
        // A and B untouched — selection's identity was different.
        assert.equal(cA.X, 100); assert.equal(cA.Y, 100);
        assert.equal(cB.X, 300); assert.equal(cB.Y, 200);

        im.InjectPointerUp(cC, pointerInit({ HostX: 700, HostY: 500 }));
    });

    test('partner snapshot is press-time stable — mid-drag selection mutations do not change the partner set', () => {
        const { diagram, items } = setup();
        const a = new NodeVM('a', 100, 100);
        const b = new NodeVM('b', 300, 200);
        const c = new NodeVM('c', 500, 350);
        items.Add(a); items.Add(b); items.Add(c);

        const cA = cont(diagram, a);
        const cB = cont(diagram, b);
        const cC = cont(diagram, c);

        // Select A + B (C not selected at press time).
        diagram.SelectedItem = a;
        diagram.HandleContainerClick(cB, { Control: true, Shift: false, Alt: false, Meta: false });

        const im = new InputManager();
        im.InjectPointerDown(cA, pointerInit({ HostX: 150, HostY: 150 }));
        im.InjectPointerMove(cA, pointerInit({ HostX: 200, HostY: 200 }));

        // Mid-drag selection mutation — toggle C in. Partner set was
        // already snapshotted at press time, so C must NOT move with
        // the rest of the drag.
        diagram.HandleContainerClick(cC, { Control: true, Shift: false, Alt: false, Meta: false });

        im.InjectPointerMove(cA, pointerInit({ HostX: 250, HostY: 220 }));

        assert.equal(cA.X, 200, 'A.X after drag');
        assert.equal(cB.X, 400, 'B.X after drag (partner from press time)');
        assert.equal(cC.X, 500, 'C.X unchanged — added to selection mid-drag, not a partner');

        im.InjectPointerUp(cA, pointerInit({ HostX: 250, HostY: 220 }));
    });
});
