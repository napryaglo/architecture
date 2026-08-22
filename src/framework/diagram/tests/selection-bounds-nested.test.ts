// A nested node's Left/Top are container-local, but the selection adorner draws
// in diagram space. SelectionBoundsTracker must report a selected nested node's
// DIAGRAM-space rect, or the handles land in the wrong place on screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObservableCollection, Size, ModifierKeys, Visual } from '../../../runtime/index.js';
import { Border, Canvas, ItemsPanelTemplate } from '../../../basic/index.js';
import { initTestApp } from '../../../basic/tests/test-app.js';
import { SelectionMode } from '../../list/list-box.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { ContainerFigure } from '../container-figure.js';
import { diagramSpaceRect } from '../coordinate-space.js';

test('selecting a nested node reports its diagram-space rect as the selection bbox', () => {
    initTestApp();
    const container = new ContainerFigure();
    container.Id = 'C'; container.Left = 100; container.Top = 100; container.Width = 220; container.Height = 160;
    const child = Figure.fromKind('rectangle', 130, 150, { width: 30, height: 20 });
    child.Id = 'n1'; child.ParentId = 'C';

    const items = new ObservableCollection<Figure>();
    items.Add(container); items.Add(child);
    const diagram = new Diagram();
    diagram.SelectionMode = SelectionMode.Extended;
    diagram.ItemsPanel = new ItemsPanelTemplate(() => new Canvas());
    diagram.ItemsSource = items;
    const surface = new Border(); (surface as unknown as { Child: Visual }).Child = diagram;
    (surface as Visual).Measure(new Size(800, 600));
    (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    diagram.ContainerPlacement.placeAll();
    assert.equal(child.ContainerParent, container, 'child nested');

    diagram.HandleContainerClick(child, ModifierKeys.None);

    const ds = diagramSpaceRect(child);   // (130, 150, 30, 20)
    assert.equal(diagram.SelectionCount,  1);
    assert.equal(diagram.SelectionLeft,   ds.X);
    assert.equal(diagram.SelectionTop,    ds.Y);
    assert.equal(diagram.SelectionWidth,  ds.Width);
    assert.equal(diagram.SelectionHeight, ds.Height);
    assert.equal(diagram.SelectionLeft, 130);
    assert.equal(diagram.SelectionTop,  150);
});
