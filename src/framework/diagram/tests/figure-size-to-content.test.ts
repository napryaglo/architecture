// Content-node sizing: a NodeViewModel with SizeToContent=true is hosted in a
// Figure container that measures its rendered content and writes Width/Height
// back through the two-way bind — so the selection adorner (which tracks the
// VM's Width/Height) covers the whole tile, not a fixed box. A hand-resize sets
// UserSized, which pins the size and stops the auto-fit. Geometric nodes
// (SizeToContent=false) are unaffected.

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

    test('a SizeToContent node fits its Width/Height to the content', () => {
        const vm = new TileVM();
        vm.SizeToContent = true;
        const { container } = place(vm);
        assert.ok(container instanceof Figure);
        assert.ok(Math.abs(vm.Width  - TILE_W) < 1, `vm.Width should fit content (${vm.Width})`);
        assert.ok(Math.abs(vm.Height - TILE_H) < 1, `vm.Height should fit content (${vm.Height})`);
    });

    test('a geometric node (SizeToContent=false) keeps its explicit size', () => {
        const vm = new TileVM();
        vm.Width = 40;
        vm.Height = 40;   // SizeToContent stays false
        const { } = place(vm);
        assert.equal(vm.Width, 40, 'width unchanged');
        assert.equal(vm.Height, 40, 'height unchanged');
    });

    test('UserSized pins the size — auto-fit stops', () => {
        const vm = new TileVM();
        vm.SizeToContent = true;
        vm.UserSized = true;   // as if the user hand-resized
        vm.Width = 55;
        vm.Height = 55;
        const { } = place(vm);
        assert.equal(vm.Width, 55, 'user size kept');
        assert.equal(vm.Height, 55, 'user size kept');
    });
});
