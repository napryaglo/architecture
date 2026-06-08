import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, NoModifiers, Panel, PointerButton, RelayCommand, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';;
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { ContextMenu, ContextMenuService } from '../context-menu.js';
import { MenuItem } from '../menu.js';

class Root extends Panel {}

function rightClick(): PointerEventInit
{
    return {
        HostX: 50, HostY: 30,
        Button: PointerButton.Secondary, Buttons: 2,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
    };
}

describe('ContextMenu — attached DP + auto-open', () => {
    beforeEach(() => { Application.current = null; });

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

    test('ContextMenu Items mirror into the inner Menu', () => {
        const cm = new ContextMenu();
        const mi = new MenuItem();
        mi.Header = 'Delete';
        cm.Items = [mi];
        const innerMenu = (cm as unknown as { _menu: { Items: unknown } })._menu;
        const innerItems = innerMenu.Items as unknown;
        const count = Array.isArray(innerItems) ? innerItems.length : 0;
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
