import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import {
    Application,
    ModifierKeys,
    ObservableCollection,
    Visual,
    type MountableTarget,
    Size,
} from '../../../runtime/index.js';
import { Border, ItemsPanelTemplate, TextBlock } from '../../../basic/index.js';
import { PaginatedCanvas } from '../../../basic/panels/paginated-canvas.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void { /* noop */ }
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

class TestNodeVM extends NodeViewModel {}

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

describe('Diagram — NodeViewModel container content + position binding (m1)', () => {
    beforeEach(() => {
        initTestApp();
        // Register a DataTemplate for TestNodeVM so the Diagram can resolve it
        // from the application resource dictionary (implicit DataType lookup).
        Application.current!.Resources.Set(
            TestNodeVM,
            new DataTemplate((_d) => {
                const b = new Border();
                b.SetChild(new TextBlock('vm'));
                return b;
            }, TestNodeVM),
        );
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

    test('renders the DataTemplate into the container', () => {
        const { diagram, surface } = build();
        const vm = new TestNodeVM();
        const col = new ObservableCollection<TestNodeVM>();
        col.Add(vm);
        diagram.ItemsSource = col;
        layout(surface);

        const container = diagram.Generator.ContainerFromItem(vm);
        assert.ok(container !== undefined, 'ContainerFromItem should return a container');
        assert.ok(container instanceof Figure, 'container should be a Figure');

        // Walk the entire visual subtree of the container Figure.
        const visuals = collectVisuals(container);

        // The DataTemplate produces a Border as its root — it should appear
        // somewhere in the Figure's visual subtree (not as the Figure itself).
        const hasBorder = visuals.some(v => v instanceof Border && v !== container);
        assert.ok(hasBorder, 'DataTemplate Border should be present in the Figure subtree');

        // The "can not resolve template" fallback TextBlock must not appear.
        const hasErrorBlock = visuals.some(
            v => v instanceof TextBlock
              && (v as TextBlock).Text.startsWith('can not resolve template'),
        );
        assert.ok(!hasErrorBlock, 'unresolved-template error TextBlock must not be present');
    });

    test('position two-way bind: VM→container and container→VM', () => {
        const { diagram, surface } = build();
        const vm = new TestNodeVM();
        vm.Left = 120;
        vm.Top  = 80;

        const col = new ObservableCollection<TestNodeVM>();
        col.Add(vm);
        diagram.ItemsSource = col;
        layout(surface);

        const container = diagram.Generator.ContainerFromItem(vm) as Figure;
        assert.ok(container instanceof Figure, 'container must be a Figure');

        // VM → container (forward direction): bindings must have propagated.
        assert.equal(container.Left, 120, 'Figure.Left should reflect vm.Left after layout');
        assert.equal(container.Top,  80,  'Figure.Top should reflect vm.Top after layout');

        // container → VM (reverse direction, simulates a drag commit).
        container.Left = 60;
        assert.equal(vm.Left, 60, 'vm.Left should update when Figure.Left is set (two-way)');
        container.Top = 30;
        assert.equal(vm.Top, 30, 'vm.Top should update when Figure.Top is set (two-way)');
    });

    test('selection surfaces the VM, not the container Figure', () => {
        const { diagram, surface } = build();
        const vm = new TestNodeVM();

        const col = new ObservableCollection<TestNodeVM>();
        col.Add(vm);
        diagram.ItemsSource = col;
        layout(surface);

        const container = diagram.Generator.ContainerFromItem(vm) as Figure;
        assert.ok(container instanceof Figure, 'container must be a Figure');

        diagram.HandleContainerClick(container, ModifierKeys.None);
        assert.equal(diagram.SelectedItem, vm, 'SelectedItem should be the VM, not the Figure container');
    });
});
