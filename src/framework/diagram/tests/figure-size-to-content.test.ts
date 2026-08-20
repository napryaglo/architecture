// Content-node sizing: a content VM is hosted in a Figure container that is a
// content tile (bindContainer sets SizeToContent=true) and measures its rendered
// content, fitting its OWN Width/Height to it — the VM carries no geometry. A
// hand-resize sets the container's UserSized latch, which pins the size and stops
// the auto-fit. (Geometric nodes are self-painting shape Figures, not VMs, and
// keep their explicit size — covered by the figure tests.)

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';
import {
    Application, ObservableCollection, Visual, type MountableTarget, Size,
} from '../../../runtime/index.js';
import { Border, ItemsPanelTemplate } from '../../../basic/index.js';
import { PaginatedCanvas } from '../../../basic/panels/paginated-canvas.js';
import { DataTemplate } from '../../../basic/templates/data-template.js';
import { Diagram } from '../diagram.js';
import { Figure } from '../figure.js';
import { NodeViewModel } from '../node-view-model.js';

class FakeTarget implements MountableTarget {
    public Content: Visual | undefined;
    public SetFocus(_v: Visual | undefined): void {}
    public GetFocusedVisual(): Visual | undefined { return undefined; }
}

class TileVM extends NodeViewModel {}

const TILE_W = 130;
const TILE_H = 90;

describe('Figure — SizeToContent', () => {
    beforeEach(() => {
        initTestApp();
        // A tile whose content has a fixed natural size (130×90).
        Application.current!.Resources.Set(
            TileVM,
            new DataTemplate((_d) => {
                const b = new Border();
                b.Width = TILE_W;
                b.Height = TILE_H;
                return b;
            }, TileVM),
        );
    });

    function build(): { diagram: Diagram; surface: Border } {
        const diagram = new Diagram();
        diagram.ItemsPanel = new ItemsPanelTemplate(() => new PaginatedCanvas());
        const surface = new Border();
        surface.SetChild(diagram);
        const target = new FakeTarget();
        target.Content = surface;
        return { diagram, surface };
    }

    function layout(surface: Border): void {
        // A couple of passes so the content-fit write settles.
        for (let i = 0; i < 3; i++) {
            surface.Measure(new Size(800, 600));
            surface.Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
        }
    }

    function place(vm: TileVM): { diagram: Diagram; surface: Border; container: Figure } {
        const { diagram, surface } = build();
        const col = new ObservableCollection<TileVM>();
        col.Add(vm);
        diagram.ItemsSource = col;
        layout(surface);
        const container = diagram.Generator.ContainerFromItem(vm) as Figure;
        return { diagram, surface, container };
    }

    test('a VM container fits its Width/Height to the content', () => {
        const vm = new TileVM();
        const { container } = place(vm);
        assert.ok(container instanceof Figure);
        assert.equal(container.SizeToContent, true, 'a VM container is a content tile');
        assert.ok(Math.abs(container.Width  - TILE_W) < 1, `container.Width should fit content (${container.Width})`);
        assert.ok(Math.abs(container.Height - TILE_H) < 1, `container.Height should fit content (${container.Height})`);
    });

    test('UserSized on the container pins the size — auto-fit stops', () => {
        const vm = new TileVM();
        const { surface, container } = place(vm);
        // Simulate a hand-resize: pin the container to an explicit size.
        container.UserSized = true;
        container.Width  = 55;
        container.Height = 55;
        // Re-layout — the auto-fit must NOT override the pinned size.
        layout(surface);
        assert.equal(container.Width,  55, 'user size kept');
        assert.equal(container.Height, 55, 'user size kept');
    });
});
