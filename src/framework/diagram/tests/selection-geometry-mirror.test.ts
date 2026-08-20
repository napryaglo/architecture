import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, ObservableCollection, Size, ModifierKeys, Visual } from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../../basic/index.js';
import { SelectionMode } from '../../list/list-box.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';

function mount(): { diagram: Diagram; a: Figure; b: Figure } {
    Application.current = null; new Application();
    const a = Figure.fromKind('rectangle', 10, 20, { width: 100, height: 50 }); a.Id = 'a';
    const b = Figure.fromKind('rectangle', 200, 60, { width: 80, height: 40 }); b.Id = 'b';
    const coll = new ObservableCollection<Figure>(); coll.Add(a); coll.Add(b);
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel = new ItemsPanelTemplate(() => new Canvas());
    diagram.ItemsSource = coll;
    const surface = new Border(); (surface as unknown as { Child: Visual }).Child = diagram;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return { diagram, a, b };
}

function select(diagram: Diagram, fig: Figure, mods: ModifierKeys = ModifierKeys.None): void {
    const container = diagram.Generator.ContainerFromItem(fig);
    if (container === undefined) throw new Error('no container');
    diagram.HandleContainerClick(container, mods);
}

describe('SelectionGeometryMirror', () => {
    test('single selection mirrors the shape geometry; HasSelectedShape true', () => {
        const { diagram, a } = mount();
        select(diagram, a);
        assert.equal(diagram.HasSelectedShape, true);
        assert.equal(diagram.SelectedShapeLeft, 10);
        assert.equal(diagram.SelectedShapeWidth, 100);
        assert.equal(diagram.SelectedShapeBaseWidth, 100);
    });
    test('writing a SelectedShape DP updates the shape', () => {
        const { diagram, a } = mount();
        select(diagram, a);
        diagram.SelectedShapeWidth = 160;
        assert.equal(a.Width, 160);
        diagram.SelectedShapeRotation = 30;
        assert.equal(a.Rotation, 30);
    });
    test('dragging the shape re-seeds the DP (live tracking)', () => {
        const { diagram, a } = mount();
        select(diagram, a);
        a.Left = 77;
        assert.equal(diagram.SelectedShapeLeft, 77);
    });
    test('multi selection => HasSelectedShape false, writes ignored', () => {
        const { diagram, a, b } = mount();
        select(diagram, a);
        select(diagram, b, ModifierKeys.Control);
        assert.equal(diagram.SelectedItems.length, 2);
        assert.equal(diagram.HasSelectedShape, false);
        diagram.SelectedShapeWidth = 999;
        assert.equal(a.Width, 100);
    });
});
