import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import {
    NoModifiers, PointerButton, Panel, Rect, Size, Visual,
    type PointerEventInit,
} from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { Border } from '../../basic/border.js';
import { Dock, DockPanel } from '../../basic/panels/dock-panel.js';
import { SideSheet, SideSheetVariant } from '../surfaces/side-sheet.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0, Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0, PointerType: 'mouse',
        ...overrides,
    };
}

class Root extends Panel { }

function mount(s: SideSheet): HeadlessTarget
{
    const root = new Root();
    root.AddChild(s);
    const target = new HeadlessTarget(600, 400);
    target.Content = root;
    target.Flush();
    return target;
}

function walk(v: Visual, pred: (n: Visual) => boolean): Visual | undefined
{
    if (pred(v)) return v;
    for (const c of v.visualChildren) { const r = walk(c, pred); if (r) return r; }
    return undefined;
}

describe('SideSheet — defaults', () => {
    beforeEach(() => { initTestApp(); });

    test('Standard variant, Right anchor, closed, 320dp', () => {
        const s = new SideSheet();
        assert.equal(s.Variant, SideSheetVariant.Standard);
        assert.equal(s.Anchor, Dock.Right);
        assert.equal(s.IsOpen, false);
        assert.equal(s.SheetSize, 320);
    });
});

describe('SideSheet — Standard variant (in-flow)', () => {
    beforeEach(() => { initTestApp(); });

    test('closed reports 0 width; open reports SheetSize', () => {
        const s = new SideSheet();
        s.Variant   = SideSheetVariant.Standard;
        s.SheetSize = 280;

        s.Measure(new Size(800, 600));
        assert.equal(s.DesiredSize.Width, 0, 'collapsed when closed');

        s.IsOpen = true;
        s.Measure(new Size(800, 600));
        assert.equal(s.DesiredSize.Width, 280, 'SheetSize wide when open');
    });

    test('docks into a DockPanel and reflows sibling content', () => {
        const s = new SideSheet();
        s.Variant   = SideSheetVariant.Standard;
        s.SheetSize = 200;
        s.IsOpen    = true;
        const body = new Border();

        const host = new DockPanel();
        DockPanel.SetDock(s, Dock.Right);
        host.AddChild(s);
        host.AddChild(body);

        host.Measure(new Size(600, 400));
        host.Arrange(new Rect(0, 0, 600, 400));

        // Sheet takes the right 200; body fills the left 400.
        assert.equal(s.ArrangedRect.Width, 200);
        assert.equal(s.ArrangedRect.X, 400);
        assert.equal(body.ArrangedRect.X, 0);
        assert.equal(body.ArrangedRect.Width, 400);
    });

    test('Content is slotted into the sheet body', () => {
        const s = new SideSheet();
        s.IsOpen = true;
        const body = new Border();
        s.Content = body;
        mount(s);
        s.Measure(new Size(600, 400));
        s.Arrange(new Rect(0, 0, s.DesiredSize.Width, 400));
        assert.ok(walk(s, n => n === body) !== undefined, 'Content appears in the sheet tree');
    });
});

describe('SideSheet — Modal variant (overlay)', () => {
    beforeEach(() => { initTestApp(); });

    test('reports 0 in host flow regardless of IsOpen', () => {
        const s = new SideSheet();
        s.Variant = SideSheetVariant.Modal;
        s.IsOpen  = true;
        s.Measure(new Size(800, 600));
        assert.equal(s.DesiredSize.Width, 0);
        assert.equal(s.DesiredSize.Height, 0);
    });

    test('opening mounts [scrim, sheet] onto the OverlayRoot; closing detaches', () => {
        const s = new SideSheet();
        s.Variant = SideSheetVariant.Modal;
        const target = mount(s);
        assert.equal(target.OverlayRoot, undefined, 'no overlay until open');

        s.IsOpen = true;
        target.Flush();
        const overlay = target.OverlayRoot!;
        assert.notEqual(overlay, undefined, 'overlay layer materialised');
        const host = overlay.visualChildren[0]!;
        assert.equal(host.visualChildren.length, 2, 'scrim + sheet');

        s.IsOpen = false;
        target.Flush();
        assert.equal(target.OverlayRoot!.visualChildren.length, 0, 'closing detaches the host');
    });

    test('scrim click closes the sheet AND fires Closed', () => {
        const s = new SideSheet();
        s.Variant = SideSheetVariant.Modal;
        const target = mount(s);
        s.IsOpen = true;
        target.Flush();

        let closed = 0;
        s.AddClosedListener(() => { closed++; });

        const scrim = target.OverlayRoot!.visualChildren[0]!.visualChildren[0]!;
        const im = new InputManager();
        im.InjectPointerDown(scrim, pointer());
        im.InjectPointerUp(scrim, pointer());

        assert.equal(s.IsOpen, false, 'scrim click closes');
        assert.equal(closed, 1, 'Closed fired once');
    });

    test('programmatic IsOpen=false does NOT fire Closed', () => {
        const s = new SideSheet();
        s.Variant = SideSheetVariant.Modal;
        const target = mount(s);
        s.IsOpen = true;
        target.Flush();

        let closed = 0;
        s.AddClosedListener(() => { closed++; });
        s.IsOpen = false;
        target.Flush();
        assert.equal(closed, 0, 'programmatic close is silent');
    });
});
