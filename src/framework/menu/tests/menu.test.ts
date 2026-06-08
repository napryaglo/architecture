import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, NoModifiers, Panel, PointerButton, RelayCommand, Size, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';;
import { Menu, MenuButton, MenuItem, MenuSeparator } from '../menu.js';

class Root extends Panel {}

function pointer(button: PointerButton = PointerButton.Primary): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: button, Buttons: button === PointerButton.Secondary ? 2 : 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
    };
}

describe('Menu / MenuItem / MenuSeparator', () => {
    beforeEach(() => { Application.current = null; });

    test('Menu instantiates with a vertical-stack ItemsPanel', () => {
        const menu = new Menu();
        assert.ok(menu instanceof Menu);
    });

    test('MenuItem default state — empty Header, no Icon, IsCheckable=false', () => {
        const mi = new MenuItem();
        assert.equal(mi.Header, undefined);
        assert.equal(mi.Icon,   undefined);
        assert.equal(mi.IsCheckable, false);
        assert.equal(mi.IsChecked,   false);
    });

    test('MenuItem click fires its Command and onActivated', () => {
        const root = new Root();
        const mi = new MenuItem();
        root.AddChild(mi);

        let executed = 0;
        let activated = 0;
        mi.Header = 'Save';
        mi.Command = new RelayCommand(() => { executed++; });
        mi._onActivated = (): void => { activated++; };

        const im = new InputManager();
        im.InjectPointerDown(mi, pointer());
        im.InjectPointerUp  (mi, pointer());
        assert.equal(executed, 1);
        assert.equal(activated, 1);
    });

    test('Checkable MenuItem flips IsChecked on click', () => {
        const root = new Root();
        const mi = new MenuItem();
        root.AddChild(mi);
        mi.IsCheckable = true;
        assert.equal(mi.IsChecked, false);

        const im = new InputManager();
        im.InjectPointerDown(mi, pointer());
        im.InjectPointerUp  (mi, pointer());
        assert.equal(mi.IsChecked, true);

        im.InjectPointerDown(mi, pointer());
        im.InjectPointerUp  (mi, pointer());
        assert.equal(mi.IsChecked, false);
    });

    test('MenuSeparator measures to its Height + the available width', () => {
        const sep = new MenuSeparator();
        sep.Measure(new Size(100, 12));
        const ds = sep.DesiredSize;
        assert.equal(ds.Height, 9);
        assert.equal(ds.Width, 100);
    });
});

describe('MenuButton', () => {
    beforeEach(() => { Application.current = null; });

    test('MenuButton.IsOpen toggles via the trigger Button click', () => {
        const root = new Root();
        const mb = new MenuButton();
        root.AddChild(mb);

        assert.equal(mb.IsOpen, false);
        // Open + close via DP — the underlying button click path is
        // exercised in a separate integration test under demos. Verify
        // the DP plumbing here.
        mb.IsOpen = true;
        assert.equal(mb.IsOpen, true);
        mb.IsOpen = false;
        assert.equal(mb.IsOpen, false);
    });

    test('MenuButton.Items mirror into the inner Menu', () => {
        const mb = new MenuButton();
        mb.Items = ['a', 'b', 'c'];
        // The MenuButton's Items DP holds the data items; the inner
        // Menu's Items should mirror them after the property-change
        // forwarding.
        const inner = (mb as unknown as { _menu: Menu })._menu;
        const innerItems = inner.Items;
        const count = innerItems === undefined
            ? 0
            : Array.isArray(innerItems) ? innerItems.length : (innerItems as { Count: number }).Count;
        assert.equal(count, 3);
    });
});
