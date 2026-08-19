import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Application, AlignmentAxis, EdgeKind, Rect, Size, Visual, ObservableCollection, snapRectToGuides } from '../../../../runtime/index.js';
import { Border, ItemsPanelTemplate } from '../../../../basic/index.js';
import { PaginatedCanvas } from '../../../../basic/panels/paginated-canvas.js';
import { initTestApp } from '../../../../basic/tests/test-app.js';
import { Diagram } from '../../diagram.js';
import { Figure } from '../../figure.js';
import { attachPersistentGuides } from '../persistent-guides-behavior.js';

describe('persistent-guides behavior', () => {
    test('attach installs a composing PositionSnap and detach restores it', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        const prior = (r: Rect): Rect => r;
        d.PositionSnap = prior;
        const detach = attachPersistentGuides(d);
        assert.notEqual(d.PositionSnap, prior, 'snap composed');
        detach();
        assert.equal(d.PositionSnap, prior, 'snap restored');
    });

    test('node drop within tolerance of a guide forms glue (pure kernel)', () => {
        Application.current = null; new Application();
        const d = new Diagram();
        d.Guides = [{ axis: AlignmentAxis.X, position: 200, glued: [] }];
        const res = snapRectToGuides(new Rect(197, 50, 40, 40), d.Guides, 5);
        assert.deepEqual(res.x, { edge: EdgeKind.Min, guide: 0 });
        assert.equal(res.snapped.X, 200);
    });
});

// Drive the tunnel (preview) pointer virtuals directly with real Figure items,
// like the alignment-guides drag-integration test, to exercise onDown -> onUp.
describe('persistent-guides behavior — glue integration', () => {
    function setup(): { diagram: Diagram; a: Figure } {
        initTestApp();
        const a = new Figure(); a.Id = 'na'; a.Left = 197; a.Top = 100; a.Width = 80; a.Height = 60;
        const b = new Figure(); b.Id = 'nb'; b.Left = 400; b.Top = 300; b.Width = 80; b.Height = 60;
        const coll = new ObservableCollection<Figure>();
        coll.Add(a); coll.Add(b);
        const diagram = new Diagram();
        diagram.ItemsPanel = new ItemsPanelTemplate(() => new PaginatedCanvas());
        diagram.ItemsSource = coll;
        attachPersistentGuides(diagram);
        diagram.Guides = [{ axis: AlignmentAxis.X, position: 200, glued: [] }];
        const surface = new Border();
        surface.SetChild(diagram);
        (surface as Visual).Measure(new Size(800, 600));
        (surface as Visual).Arrange({ X: 0, Y: 0, Width: 800, Height: 600 } as never);
        return { diagram, a };
    }

    function preview(diagram: Diagram, kind: 'PointerDown' | 'PointerUp', source: Figure): void {
        const args = { Kind: kind, Source: source, Visual: source, Handled: false, HostX: 0, HostY: 0 };
        const seam = diagram as unknown as {
            OnPreviewPointerDown(a: unknown): void;
            OnPreviewPointerUp(a: unknown): void;
        };
        if (kind === 'PointerDown') seam.OnPreviewPointerDown(args);
        else seam.OnPreviewPointerUp(args);
    }

    test('dragging a node whose edge lands on a guide glues it on drop', () => {
        const { diagram, a } = setup();
        // a.Left = 197: its left edge is within tolerance of the x-guide at 200.
        preview(diagram, 'PointerDown', a);
        preview(diagram, 'PointerUp', a);
        const glued = diagram.Guides[0]!.glued;
        assert.equal(glued.length, 1, 'one node glued');
        assert.equal(glued[0]!.nodeId, 'na');
        assert.equal(glued[0]!.edge, EdgeKind.Min);
    });

    test('dropping the node far from the guide leaves it un-glued', () => {
        const { diagram, a } = setup();
        preview(diagram, 'PointerDown', a);
        a.Left = 50;                 // dragged well away from the guide at 200
        preview(diagram, 'PointerUp', a);
        assert.equal(diagram.Guides[0]!.glued.length, 0, 'no glue formed');
    });
});
