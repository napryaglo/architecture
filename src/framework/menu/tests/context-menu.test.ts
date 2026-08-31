import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { Application, NoModifiers, Panel, PointerButton, RelayCommand, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';;
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { ContextMenu, ContextMenuService } from '../context-menu.js';
import { MenuItem } from '../menu-strip.js';
import { DataTemplate } from '../../../basic/index.js';
import { Visual } from '../../../visual-engine/index.js';

class Root extends Panel {}

class Choice { constructor(public label: string, public cmd: RelayCommand) {} }

// Recursively collect every MenuItem in a visual subtree (the overlay popup).
function findMenuItems(v: Visual, out: MenuItem[] = []): MenuItem[]
{
    if (v instanceof MenuItem) out.push(v);
    for (const c of (v as unknown as { visualChildren: Visual[] }).visualChildren ?? [])
        findMenuItems(c, out);
    return out;
}

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

    test('activating a leaf item runs its command and closes the menu', () => {
        const target = new HeadlessTarget(400, 300);
        const root = new Root();
        target.Content = root;

        const cm = new ContextMenu();
        let ran = 0;
        const mi = new MenuItem();
        mi.Header = 'Delete';
        mi.Command = new RelayCommand(() => { ran++; });
        cm.Items = [mi];
        root.ContextMenu = cm;

        const im = new InputManager();
        im.InjectPointerDown(root, rightClick());
        assert.equal(cm.IsOpen, true);
        target.Flush();

        // Is the item prepared with a close hook?
        const prepared = (mi as unknown as { _onActivated?: () => void })._onActivated;
        assert.notEqual(prepared, undefined, '_onActivated should be wired after realize');

        // Activate the leaf → command runs AND menu closes.
        (mi as unknown as { activate(): void }).activate();
        assert.equal(ran, 1, 'command ran');
        assert.equal(cm.IsOpen, false, 'menu should close on activation');
    });

    test('activating a nested (static) submenu child closes the whole menu', () => {
        const target = new HeadlessTarget(400, 300);
        const root = new Root();
        target.Content = root;

        const cm = new ContextMenu();
        const parent = new MenuItem(); parent.Header = 'More';
        const child = new MenuItem(); child.Header = 'Deep';
        let ran = 0; child.Command = new RelayCommand(() => { ran++; });
        parent.AddChild(child);   // declarative submenu child
        cm.AddChild(parent);      // declarative context-menu item
        root.ContextMenu = cm;

        const im = new InputManager();
        im.InjectPointerDown(root, rightClick());
        target.Flush();

        // Open the submenu, then activate the child.
        (parent as unknown as { activate(): void }).activate();
        target.Flush();
        const childHook = (child as unknown as { _onActivated?: () => void })._onActivated;
        assert.notEqual(childHook, undefined, 'child _onActivated should be wired');
        (child as unknown as { activate(): void }).activate();
        assert.equal(ran, 1, 'child command ran');
        assert.equal(cm.IsOpen, false, 'the whole menu should close');
    });

    test('a templated (ItemsSource) submenu child closes the whole menu (regression)', () => {
        const target = new HeadlessTarget(400, 300);
        const root = new Root();
        target.Content = root;

        const cm = new ContextMenu();
        const parent = new MenuItem(); parent.Header = 'Add New';
        let ran = 0;
        const choice = new Choice('File', new RelayCommand(() => { ran++; }));
        parent.ItemsSource  = [choice] as unknown as never;
        parent.ItemTemplate = new DataTemplate((d) => {
            const c = d as Choice;
            const it = new MenuItem(); it.Header = c.label; it.Command = c.cmd; return it;
        }, Choice);
        cm.AddChild(parent);
        root.ContextMenu = cm;

        const im = new InputManager();
        im.InjectPointerDown(root, rightClick());
        target.Flush();
        (parent as unknown as { activate(): void }).activate();   // open the submenu
        target.Flush();

        // The generated container is a ContentPresenter wrapping the templated
        // MenuItem — reach it through the parent's generator (the submenu popup is
        // mounted on a separate overlay, so a walk from `cm` won't find it).
        const container = (parent as unknown as { Generator: { ContainerFromItem(i: unknown): Visual | undefined } })
            .Generator.ContainerFromItem(choice);
        assert.notEqual(container, undefined, 'templated container should be realized');
        const child = findMenuItems(container as Visual).find((m) => m.Header === 'File');
        assert.notEqual(child, undefined, 'templated child MenuItem should exist');
        (child as unknown as { activate(): void }).activate();
        assert.equal(ran, 1, 'child command ran');
        assert.equal(cm.IsOpen, false, 'menu should close when a templated child is activated');
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
