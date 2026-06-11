import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../Basic/tests/test-app.js';

import { Application, NoModifiers, PointerButton, Panel, Rect, Size, Visual, type PointerEventInit } from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';;
import { HeadlessTarget } from '../../visual-engine/index.js';
import { Border } from '../../Basic/border.js';
import { Dock, DockPanel } from '../../Basic/dock-panel.js';
import { Drawer, DrawerVariant } from '../drawer.js';
import { TextBlock } from '../../Basic/text-block.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
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

class Root extends Panel { }

describe('Drawer — Permanent variant', () => {
    beforeEach(() => { initTestApp(); });

    test('always reports DrawerSize on anchor axis regardless of IsOpen', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Permanent;
        d.Anchor     = Dock.Left;
        d.DrawerSize = 200;
        d.RailSize   = 50;
        d.IsOpen     = false;        // ignored

        d.Measure(new Size(800, 600));
        assert.equal(d.DesiredSize.Width, 200, 'Permanent ignores IsOpen and IsRailSize');
    });

    test('participates in DockPanel flow at DrawerSize', () => {
        const drawer = new Drawer();
        drawer.Variant    = DrawerVariant.Permanent;
        drawer.Anchor     = Dock.Left;
        drawer.DrawerSize = 100;

        const body = new Border();   // fill (last child of DockPanel)

        const host = new DockPanel();
        DockPanel.SetDock(drawer, Dock.Left);
        host.AddChild(drawer);
        host.AddChild(body);

        host.Measure(new Size(400, 300));
        host.Arrange(new Rect(0, 0, 400, 300));

        // Drawer takes the left 100; body fills the remaining 300.
        assert.equal(drawer.ArrangedRect.X, 0);
        assert.equal(drawer.ArrangedRect.Width, 100);
        assert.equal(body.ArrangedRect.X, 100);
        assert.equal(body.ArrangedRect.Width, 300);
    });
});

describe('Drawer — Persistent variant', () => {
    beforeEach(() => { initTestApp(); });

    test('open / closed sizes swap DrawerSize ↔ RailSize on anchor axis', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Persistent;
        d.Anchor     = Dock.Left;
        d.DrawerSize = 240;
        d.RailSize   = 56;
        d.IsOpen     = false;

        d.Measure(new Size(800, 600));
        assert.equal(d.DesiredSize.Width, 56, 'closed → RailSize');

        d.IsOpen = true;
        d.Measure(new Size(800, 600));
        assert.equal(d.DesiredSize.Width, 240, 'open → DrawerSize');
    });

    test('RailSize=0 collapses fully to zero width when closed', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Persistent;
        d.Anchor     = Dock.Left;
        d.DrawerSize = 200;
        // RailSize defaults to 0.
        d.IsOpen     = false;

        d.Measure(new Size(400, 300));
        assert.equal(d.DesiredSize.Width, 0);
    });

    test('toggling IsOpen re-flows a DockPanel host', () => {
        const drawer = new Drawer();
        drawer.Variant    = DrawerVariant.Persistent;
        drawer.Anchor     = Dock.Left;
        drawer.DrawerSize = 200;
        drawer.RailSize   = 60;

        const body = new Border();
        const host = new DockPanel();
        DockPanel.SetDock(drawer, Dock.Left);
        host.AddChild(drawer);
        host.AddChild(body);

        host.Measure(new Size(500, 300));
        host.Arrange(new Rect(0, 0, 500, 300));
        assert.equal(drawer.ArrangedRect.Width, 60);
        assert.equal(body.ArrangedRect.X, 60);

        drawer.IsOpen = true;
        host.InvalidateMeasure();
        host.Measure(new Size(500, 300));
        host.Arrange(new Rect(0, 0, 500, 300));
        assert.equal(drawer.ArrangedRect.Width, 200);
        assert.equal(body.ArrangedRect.X, 200);
    });

    test('right-anchored drawer reports size on width axis too', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Persistent;
        d.Anchor     = Dock.Right;
        d.DrawerSize = 180;
        d.IsOpen     = true;

        d.Measure(new Size(800, 600));
        assert.equal(d.DesiredSize.Width, 180);
    });

    test('top-anchored drawer reports size on height axis', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Persistent;
        d.Anchor     = Dock.Top;
        d.DrawerSize = 64;
        d.IsOpen     = true;

        d.Measure(new Size(800, 600));
        assert.equal(d.DesiredSize.Height, 64);
    });

    test('logical Content has Drawer as its logical parent (DataContext flow)', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Persistent;
        const body = new TextBlock('Hello');
        d.Content = body;

        // logicalChildren on Drawer exposes the body.
        assert.deepEqual(d.logicalChildren, [body]);
    });
});

describe('Drawer — Temporary variant', () => {
    beforeEach(() => { initTestApp(); });

    function mount(d: Drawer): HeadlessTarget {
        const root = new Root();
        root.AddChild(d);
        const target = new HeadlessTarget(400, 300);
        target.Content = root;
        target.Flush();
        return target;
    }

    test('reports zero size in host flow regardless of IsOpen', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Temporary;
        d.DrawerSize = 280;
        d.IsOpen     = true;

        d.Measure(new Size(800, 600));
        assert.equal(d.DesiredSize.Width, 0);
        assert.equal(d.DesiredSize.Height, 0);
    });

    test('opening mounts scrim + pane onto PresentationTarget.OverlayRoot', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Temporary;
        d.Anchor     = Dock.Left;
        d.DrawerSize = 200;
        const target = mount(d);

        // No overlay until something attaches.
        assert.equal(target.OverlayRoot, undefined);

        d.IsOpen = true;
        target.Flush();
        const overlay = target.OverlayRoot!;
        assert.notEqual(overlay, undefined, 'overlay layer materialised');
        // One overlay host with [scrim, pane].
        const host = overlay.visualChildren[0]!;
        assert.equal(host.visualChildren.length, 2);

        d.IsOpen = false;
        target.Flush();
        assert.equal(target.OverlayRoot!.visualChildren.length, 0,
            'closing detaches the host');
    });

    test('scrim click closes the drawer AND fires the Closed event', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Temporary;
        const target = mount(d);
        d.IsOpen = true;
        target.Flush();

        let closedFired = 0;
        d.AddClosedListener(() => { closedFired++; });

        // First child of the overlay host is the scrim.
        const scrim = target.OverlayRoot!.visualChildren[0]!.visualChildren[0]!;
        const im = new InputManager();
        im.InjectPointerDown(scrim, pointer());
        im.InjectPointerUp  (scrim, pointer());

        assert.equal(d.IsOpen, false, 'scrim click closes');
        assert.equal(closedFired, 1, 'Closed fired once');
    });

    test('programmatic IsOpen=false does NOT fire Closed', () => {
        const d = new Drawer();
        d.Variant = DrawerVariant.Temporary;
        const target = mount(d);
        d.IsOpen = true;
        target.Flush();

        let closedFired = 0;
        d.AddClosedListener(() => { closedFired++; });

        d.IsOpen = false;       // consumer-initiated dismissal
        assert.equal(closedFired, 0, 'no Closed for programmatic close');
    });

    test('pane is positioned at the anchor edge with DrawerSize on its axis', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Temporary;
        d.Anchor     = Dock.Right;
        d.DrawerSize = 240;
        const target = mount(d);
        d.IsOpen = true;
        target.Flush();

        const overlayHost = target.OverlayRoot!.visualChildren[0]!;
        const pane = overlayHost.visualChildren[1] as Visual;
        // Right-anchored on a 400-wide surface: x = 400 - 240 = 160.
        assert.equal(pane.ArrangedRect.X,     160);
        assert.equal(pane.ArrangedRect.Width, 240);
        assert.equal(pane.ArrangedRect.Height, 300);
    });

    test('changing Anchor while open repositions the pane on next flush', () => {
        const d = new Drawer();
        d.Variant    = DrawerVariant.Temporary;
        d.Anchor     = Dock.Left;
        d.DrawerSize = 200;
        const target = mount(d);
        d.IsOpen = true;
        target.Flush();

        let pane = target.OverlayRoot!.visualChildren[0]!.visualChildren[1]!;
        assert.equal(pane.ArrangedRect.X, 0);

        d.Anchor = Dock.Right;
        target.Flush();
        pane = target.OverlayRoot!.visualChildren[0]!.visualChildren[1]!;
        assert.equal(pane.ArrangedRect.X, 400 - 200);
    });

    test('removed-from-tree while open detaches the overlay from the old target', () => {
        const d = new Drawer();
        d.Variant = DrawerVariant.Temporary;
        const target = mount(d);
        d.IsOpen = true;
        target.Flush();
        assert.equal(target.OverlayRoot!.visualChildren.length, 1);

        // Unmount: remove the Drawer from its host root.
        const root = target.Content as Root;
        root.RemoveChild(d);
        target.Flush();
        assert.equal(target.OverlayRoot!.visualChildren.length, 0,
            'overlay subtree must not linger after the source Drawer is removed');
    });
});

describe('Drawer — Variant is read-once at structural setup', () => {
    beforeEach(() => { initTestApp(); });

    test('changing Variant after the first measure has no structural effect', () => {
        const d = new Drawer();
        d.Variant = DrawerVariant.Persistent;
        d.Measure(new Size(400, 300));
        assert.equal(d.visualChildren.length, 1, 'Persistent locks pane in flow');

        // Try to flip — locked, ignored.
        d.Variant = DrawerVariant.Temporary;
        d.Measure(new Size(400, 300));
        assert.equal(d.visualChildren.length, 1, 'still in flow');
    });
});
