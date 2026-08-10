import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import {
    Application,
    ObservableCollection,
    Visual,
    type MountableTarget,
    Size,
} from '../../../runtime/index.js';
import { Border, ItemsPanelTemplate, TextBlock, Shape } from '../../../basic/index.js';
import { PaginatedCanvas } from '../../../basic/panels/paginated-canvas.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { ShapeNodeVM } from '../shape-node-vm.js';

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

// Walk the visual subtree depth-first and return every node encountered.
function collectVisuals(root: Visual): Visual[]
{
    const result: Visual[] = [];
    const stack: Visual[] = [root];
    while (stack.length > 0)
    {
        const v = stack.pop()!;
        result.push(v);
        for (const child of v.visualChildren)
        {
            stack.push(child);
        }
    }
    return result;
}

describe('Diagram — ShapeNodeVM DataTemplate rendering (m2)', () => {
    beforeEach(() => {
        initTestApp();
    });

    function build(): { diagram: Diagram; surface: Border }
    {
        const diagram = new Diagram();
        diagram.ItemsPanel = new ItemsPanelTemplate(() => new PaginatedCanvas());
        const surface = new Border();
        surface.SetChild(diagram);
        const target = new FakeTarget();
        target.Content = surface;
        return { diagram, surface };
    }

    function layout(surface: Border): void
    {
        surface.Measure(new Size(800, 600));
        surface.Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
    }

    test('renders ShapeNodeVM via [DataType] DataTemplate into the container', () => {
        const { diagram, surface } = build();
        const vm = ShapeNodeVM.fromKind('rectangle', 30, 20);
        const col = new ObservableCollection<ShapeNodeVM>();
        col.Add(vm);
        diagram.ItemsSource = col;
        layout(surface);

        const container = diagram.Generator.ContainerFromItem(vm);
        assert.ok(container !== undefined, 'ContainerFromItem should return a container');
        assert.ok(container instanceof Figure, 'container should be a Figure');

        // Walk the entire visual subtree of the container Figure.
        const visuals = collectVisuals(container);

        // Direct proof the DataTemplate resolved + rendered: a Shape
        // with defined Geometry must be in the subtree.
        const hasShape = visuals.some(
            v => v instanceof Shape && (v as Shape).Geometry !== undefined,
        );
        assert.ok(hasShape, 'DataTemplate should render a Shape with defined Geometry');

        // And the "can not resolve template" fallback TextBlock must not appear.
        const hasErrorBlock = visuals.some(
            v => v instanceof TextBlock
              && (v as TextBlock).Text.startsWith('can not resolve template'),
        );
        assert.ok(!hasErrorBlock, 'unresolved-template error TextBlock must not be present');
    });
});
