import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObservableCollection, Size, Visual } from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../../basic/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { ContainerFigure } from '../container-figure.js';
import { diagramSpaceRect } from '../coordinate-space.js';

function mount(items: ObservableCollection<Figure>): Diagram {
    const diagram = new Diagram();
    diagram.ItemsPanel = new ItemsPanelTemplate(() => new Canvas());
    diagram.ItemsSource = items;
    const surface = new Border();
    (surface as unknown as { Child: Visual }).Child = diagram;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    return diagram;
}

test('placeAll re-parents a node into its ParentId container, preserving diagram-space position', () => {
    initTestApp();
    const container = new ContainerFigure();
    container.Id = 'C'; container.Left = 100; container.Top = 100; container.Width = 220; container.Height = 160;
    const child = Figure.fromKind('rectangle', 130, 150, { width: 30, height: 20 });
    child.Id = 'n1'; child.ParentId = 'C';

    const items = new ObservableCollection<Figure>();
    items.Add(container); items.Add(child);
    const diagram = mount(items);

    // Before placement the child sits on the root host at its own Left/Top.
    assert.equal(child.ContainerParent, undefined);

    diagram.ContainerPlacement.placeAll();

    // The child is now a visual descendant of the container's ChildHost...
    assert.equal(child.ContainerParent, container, 'ContainerParent link set');
    assert.equal(child.GetVisualParent(), container.ChildHost, 'child re-parented into ChildHost');
    // ...its stored Left/Top became parent-relative, but diagram-space is unchanged.
    const r = diagramSpaceRect(child);
    assert.equal(r.X, 130); assert.equal(r.Y, 150);
});

test('un-nesting (reparent to undefined) returns the node to root, preserving diagram-space position', () => {
    initTestApp();
    const container = new ContainerFigure();
    container.Id = 'C2'; container.Left = 100; container.Top = 100; container.Width = 220; container.Height = 160;
    const child = Figure.fromKind('rectangle', 130, 150, { width: 30, height: 20 });
    child.Id = 'n2'; child.ParentId = 'C2';
    const items = new ObservableCollection<Figure>();
    items.Add(container); items.Add(child);
    const diagram = mount(items);
    diagram.ContainerPlacement.placeAll();
    assert.equal(child.ContainerParent, container);

    diagram.ContainerPlacement.reparent(child, undefined);
    assert.equal(child.ContainerParent, undefined, 'un-nested');
    const r = diagramSpaceRect(child);
    assert.equal(r.X, 130); assert.equal(r.Y, 150);   // stayed put in diagram space
});

test('deferred attach: a child registered before its container still lands once placeAll sees the container', () => {
    initTestApp();
    // child added to the collection BEFORE the container — record order must not matter.
    const child = Figure.fromKind('rectangle', 130, 150, { width: 30, height: 20 });
    child.Id = 'n3'; child.ParentId = 'C3';
    const container = new ContainerFigure();
    container.Id = 'C3'; container.Left = 100; container.Top = 100; container.Width = 220; container.Height = 160;
    const items = new ObservableCollection<Figure>();
    items.Add(child); items.Add(container);   // child first
    const diagram = mount(items);
    diagram.ContainerPlacement.placeAll();
    assert.equal(child.ContainerParent, container, 'child nested despite appearing before its container');
});
