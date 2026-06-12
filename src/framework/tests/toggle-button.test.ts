import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';

import { Application, NoModifiers, PointerButton, RelayCommand, type PointerEventInit } from '../../runtime/index.js';
import { InputManager } from '../../framework/index.js';;
import { ToggleButton } from '../toggle-button.js';
import { Panel } from '../../runtime/index.js';

class Root extends Panel {}

function pointer(): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: PointerButton.Primary, Buttons: 1,
        Modifiers: NoModifiers, PointerId: 0, Pressure: 0,
        PointerType: 'mouse',
    };
}

describe('ToggleButton', () => {
    beforeEach(() => { initTestApp(); });

    test('IsChecked defaults to false', () => {
        const tb = new ToggleButton();
        assert.equal(tb.IsChecked, false);
    });

    test('PointerDown → PointerUp inside flips IsChecked', () => {
        const root = new Root();
        const tb = new ToggleButton();
        root.AddChild(tb);

        const im = new InputManager();
        im.InjectPointerDown(tb, pointer());
        im.InjectPointerUp  (tb, pointer());
        assert.equal(tb.IsChecked, true);

        im.InjectPointerDown(tb, pointer());
        im.InjectPointerUp  (tb, pointer());
        assert.equal(tb.IsChecked, false);
    });

    test('Click handlers + Command see the POST-toggle IsChecked', () => {
        const root = new Root();
        const tb = new ToggleButton();
        root.AddChild(tb);

        const log: boolean[] = [];
        tb.AddClickHandler(() => { log.push(tb.IsChecked); });
        tb.Command = new RelayCommand(() => { log.push(tb.IsChecked); });

        const im = new InputManager();
        im.InjectPointerDown(tb, pointer());
        im.InjectPointerUp  (tb, pointer());
        // Both Command and click handler ran AFTER the toggle: both see true.
        assert.deepEqual(log, [true, true]);
    });

    test('Programmatic IsChecked = true does NOT fire Command', () => {
        const tb = new ToggleButton();
        let executed = 0;
        tb.Command = new RelayCommand(() => { executed++; });
        tb.IsChecked = true;
        assert.equal(executed, 0);
    });

    test('Drag-off + release outside does not toggle', () => {
        const root = new Root();
        const tb = new ToggleButton();
        root.AddChild(tb);

        const im = new InputManager();
        im.InjectPointerDown(tb, pointer());
        // Pointer leaves the button (Leave drops IsMouseOver).
        im.InjectPointerLeave(pointer());
        im.InjectPointerUp(null, pointer());
        assert.equal(tb.IsChecked, false, 'drag-off should not toggle');
    });
});
