import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Application, NoModifiers, Panel, PointerButton, RelayCommand, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';;
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { ContextMenu, ContextMenuService } from '../context-menu.js';
import { MenuItem } from '../menu-strip.js';

class Root extends Panel {}

function rightClick(): PointerEventInit
{
    return rightClickAt(50, 30);
}

function rightClickAt(x: number, y: number): PointerEventInit
{
    return {
        HostX: x, HostY: y,
        Button: PointerButton.Secondary, Buttons: 2,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
    };
}

// The popup's top-left in overlay coordinates — MenuPopupHost arranges the
// popup container at (fixedPoint.x, fixedPoint.y), so its ArrangedRect origin
// is where the menu actually renders.
interface CmInternals { _popupContainer: { ArrangedRect: { X: number; Y: number } } }
function popupOrigin(cm: ContextMenu): { x: number; y: number }
{
    const rect = (cm as unknown as CmInternals)._popupContainer.ArrangedRect;
    return { x: rect.X, y: rect.Y };
}

describe('ContextMenu — attached DP + auto-open', () => {
    beforeEach(() => { initTestApp(); });

    test('Visual.ContextMenu accessor mirrors the attached DP', () => {
        const v = new Root();
        const cm = new ContextMenu();
        v.ContextMenu = cm;
        assert.equal(v.ContextMenu, cm);
        assert.equal(ContextMenuService.GetContextMenu(v), cm);
    });

    test('ContextMenu defaults to IsOpen=false', () => {
        const cm = new ContextMenu();
        assert.equal(cm.IsOpen, false);
    });

    test('ContextMenu Items hold its data items (it IS the ItemsControl)', () => {
        const cm = new ContextMenu();
        const mi = new MenuItem();
        mi.Header = 'Delete';
        cm.Items = [mi];
        const items = cm.Items as unknown;
        const count = Array.isArray(items) ? items.length : 0;
        assert.equal(count, 1);
    });

    test('Right-click on a Visual with an attached ContextMenu sets IsOpen=true', () => {
        const target = new HeadlessTarget(400, 300);
        const root = new Root();
        target.Content = root;

        const cm = new ContextMenu();
        const mi = new MenuItem();
        mi.Header = 'Delete';
        mi.Command = new RelayCommand(() => {});
        cm.Items = [mi];
        root.ContextMenu = cm;

        const im = new InputManager();
        im.InjectPointerDown(root, rightClick());
        assert.equal(cm.IsOpen, true);
    });

    test('Right-click resolves to the NEAREST ancestor with a ContextMenu', () => {
        const target = new HeadlessTarget(400, 300);
        const outer = new Root();
        const inner = new Root();
        outer.AddChild(inner);
        target.Content = outer;

        const cmOuter = new ContextMenu();
        const cmInner = new ContextMenu();
        const miInner = new MenuItem();
        miInner.Header = 'Inner';
        cmInner.Items = [miInner];
        cmOuter.Items = [new MenuItem()];

        outer.ContextMenu = cmOuter;
        inner.ContextMenu = cmInner;

        const im = new InputManager();
        im.InjectPointerDown(inner, rightClick());
        assert.equal(cmInner.IsOpen, true);
        assert.equal(cmOuter.IsOpen, false, 'inner cm should win');
    });

    test('Re-opening the menu repositions the popup to the new cursor point', () => {
        const target = new HeadlessTarget(400, 300);
        const root = new Root();
        target.Content = root;

        const cm = new ContextMenu();
        const mi = new MenuItem();
        mi.Header = 'Delete';
        mi.Command = new RelayCommand(() => {});
        cm.Items = [mi];
        root.ContextMenu = cm;

        const im = new InputManager();

        // First open at (50, 30).
        im.InjectPointerDown(root, rightClickAt(50, 30));
        target.Flush();
        assert.deepEqual(popupOrigin(cm), { x: 50, y: 30 });

        // Close, then open again at a different point — the popup must follow.
        cm.IsOpen = false;
        target.Flush();
        im.InjectPointerDown(root, rightClickAt(120, 90));
        target.Flush();
        assert.deepEqual(popupOrigin(cm), { x: 120, y: 90 });
    });

    test('Right-click on a Visual WITHOUT an attached ContextMenu is a pass-through', () => {
        const root = new Root();
        // No ContextMenu attached.
        let pointerDownReached = 0;
        class Probe extends Root
        {
            protected override OnPointerDown(): void { pointerDownReached++; }
        }
        const probe = new Probe();
        root.AddChild(probe);

        const im = new InputManager();
        im.InjectPointerDown(probe, rightClick());
        // The right-click hook only fires on Secondary; the routed
        // event still reaches the visual's normal handlers because
        // nothing claimed it.
        assert.equal(pointerDownReached, 1);
    });
});
