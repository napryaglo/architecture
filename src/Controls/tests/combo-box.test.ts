import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Application,
    InputManager,
    NoModifiers,
    PointerButton,
    Panel,
    Size,
    Rect,
    type PointerEventInit,
} from '../../runtime/index.js';
import { ComboBox } from '../combo-box.js';
import { Orientation, StackPanel } from '../stack-panel.js';
import { TextBlock } from '../text-block.js';

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

describe('StackPanel — layout', () => {
    beforeEach(() => { Application.current = null; });

    test('Vertical: children stack top-to-bottom; width = max child width', () => {
        const sp = new StackPanel();
        const a = new TextBlock('A');  // narrow
        const b = new TextBlock('A longer line');
        a.FontSize = 14; b.FontSize = 14;
        sp.AddChild(a); sp.AddChild(b);

        sp.Measure(new Size(500, 500));
        const ad = a.DesiredSize, bd = b.DesiredSize;
        // Height accumulates; width is the max.
        assert.equal(sp.DesiredSize.Height, ad.Height + bd.Height);
        assert.equal(sp.DesiredSize.Width,  Math.max(ad.Width, bd.Width));

        sp.Arrange(new Rect(0, 0, sp.DesiredSize.Width, sp.DesiredSize.Height));
        assert.equal(a.ArrangedRect.Y, 0);
        assert.equal(b.ArrangedRect.Y, ad.Height);
    });

    test('Horizontal: children stack left-to-right', () => {
        const sp = new StackPanel();
        sp.Orientation = Orientation.Horizontal;
        const a = new TextBlock('A');
        const b = new TextBlock('B');
        sp.AddChild(a); sp.AddChild(b);

        sp.Measure(new Size(500, 500));
        const ad = a.DesiredSize, bd = b.DesiredSize;
        assert.equal(sp.DesiredSize.Width,  ad.Width + bd.Width);
        assert.equal(sp.DesiredSize.Height, Math.max(ad.Height, bd.Height));

        sp.Arrange(new Rect(0, 0, sp.DesiredSize.Width, sp.DesiredSize.Height));
        assert.equal(a.ArrangedRect.X, 0);
        assert.equal(b.ArrangedRect.X, ad.Width);
    });
});

describe('ComboBox — selection model', () => {
    beforeEach(() => { Application.current = null; });

    test('SelectedIndex syncs SelectedItem and vice versa', () => {
        const cb = new ComboBox();
        cb.Items = ['Apple', 'Pear', 'Plum'];
        cb.SelectedIndex = 1;
        assert.equal(cb.SelectedItem, 'Pear');

        cb.SelectedItem = 'Plum';
        assert.equal(cb.SelectedIndex, 2);

        // Setting an item not in Items clears the index.
        cb.SelectedItem = 'NotThere';
        assert.equal(cb.SelectedIndex, -1);
    });

    test('Setting Items resets SelectedIndex to match SelectedItem identity', () => {
        const cb = new ComboBox();
        cb.Items = ['a', 'b', 'c'];
        cb.SelectedItem = 'b';
        assert.equal(cb.SelectedIndex, 1);

        cb.Items = ['x', 'b', 'y', 'z'];
        assert.equal(cb.SelectedIndex, 1, 'identity lookup keeps the same string match');
        assert.equal(cb.SelectedItem, 'b');
    });
});

describe('ComboBox — popup behaviour', () => {
    beforeEach(() => { Application.current = null; });

    test('IsDropDownOpen toggles inclusion of the popup in the layout', () => {
        const cb = new ComboBox();
        cb.Items = ['One', 'Two'];

        // Closed: the root stack has only the selection box.
        const rootStack = cb.visualChildren[0] as StackPanel;
        const initialCount = rootStack.visualChildren.length;
        assert.equal(initialCount, 1);

        cb.IsDropDownOpen = true;
        assert.equal(rootStack.visualChildren.length, 2,
            'open should attach the popup');

        cb.IsDropDownOpen = false;
        assert.equal(rootStack.visualChildren.length, 1,
            'close should detach the popup');
    });

    test('Clicking the selection box toggles IsDropDownOpen', () => {
        const root = new Root();
        const cb = new ComboBox();
        cb.Items = ['One', 'Two'];
        root.AddChild(cb);

        // The selection box is the first child of the root stack.
        const rootStack = cb.visualChildren[0] as StackPanel;
        const selectionBox = rootStack.visualChildren[0]!;

        const im = new InputManager();
        im.InjectPointerDown(selectionBox, pointer());
        im.InjectPointerUp  (selectionBox, pointer());
        assert.equal(cb.IsDropDownOpen, true);

        im.InjectPointerDown(selectionBox, pointer());
        im.InjectPointerUp  (selectionBox, pointer());
        assert.equal(cb.IsDropDownOpen, false);
    });

    test('Clicking an item commits selection and closes the dropdown', () => {
        const root = new Root();
        const cb = new ComboBox();
        cb.Items = ['Apple', 'Pear', 'Plum'];
        root.AddChild(cb);
        cb.IsDropDownOpen = true;

        // Drill down to the popup's StackPanel of item containers.
        const rootStack = cb.visualChildren[0] as StackPanel;
        const popup = rootStack.visualChildren[1]! as { visualChildren: readonly { visualChildren: readonly unknown[] }[] };
        const popupStack = popup.visualChildren[0]! as StackPanel;
        const items = popupStack.visualChildren;
        assert.equal(items.length, 3);

        const im = new InputManager();
        // Click the second item.
        im.InjectPointerDown(items[1]!, pointer());
        im.InjectPointerUp  (items[1]!, pointer());

        assert.equal(cb.SelectedIndex, 1);
        assert.equal(cb.SelectedItem,  'Pear');
        assert.equal(cb.IsDropDownOpen, false,
            'committing a selection should close the dropdown');
    });
});
