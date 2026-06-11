import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../Basic/tests/test-app.js';

import { Application, NoModifiers, PointerButton, Panel, Size, Rect, Visual, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';;
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { ComboBox } from '../combo-box.js';
import { Border } from '../../../Basic/border.js';
import { Orientation, StackPanel } from '../../../Basic/stack-panel.js';
import { TextBlock } from '../../../Basic/text-block.js';

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
    beforeEach(() => { initTestApp(); });

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
    beforeEach(() => { initTestApp(); });

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

// Mount a combo box into a HeadlessTarget large enough to lay everything
// out and flush so the combo's target is wired and arranged rectangles
// are realistic before the assertions run.
function mountInTarget(cb: ComboBox): HeadlessTarget {
    const root = new Root();
    root.AddChild(cb);
    const target = new HeadlessTarget(400, 300);
    target.Content = root;
    target.Flush();
    return target;
}

// Walk into the popup-host subtree to retrieve the item containers.
// The host structure is:
//   target.OverlayRoot
//     └─ popupHost (Panel)
//          ├─ scrim (Border)
//          └─ popup (Border)
//               └─ ComboBoxItemList (internal ItemsControl)
//                    └─ items panel (StackPanel)
//                         └─ item containers (ClickableBorder…)
function popupItems(target: HeadlessTarget): readonly Visual[] {
    const overlay = target.OverlayRoot!;
    const popupHost = overlay.visualChildren[0]!;
    const popup = popupHost.visualChildren[1] as Border;
    // popup → ComboBoxItemList → items panel (StackPanel) → rows.
    // The ItemsControl layer is the post-refactor change; previously
    // the popup hosted a plain StackPanel directly.
    const popupList   = popup.visualChildren[0]!;
    const stack       = popupList.visualChildren[0] as StackPanel;
    return stack.visualChildren;
}

describe('ComboBox — popup behaviour', () => {
    beforeEach(() => { initTestApp(); });

    test('Closed combo has only the selection box as a visual child', () => {
        const cb = new ComboBox();
        cb.Items = ['One', 'Two'];
        // Pre-mount: selection box is in flow, nothing else.
        assert.equal(cb.visualChildren.length, 1);
    });

    test('Opening mounts the popup host on PresentationTarget.OverlayRoot', () => {
        const cb = new ComboBox();
        cb.Items = ['One', 'Two'];
        const target = mountInTarget(cb);

        // No overlay until the user opens it.
        assert.equal(target.OverlayRoot, undefined);

        cb.IsDropDownOpen = true;
        target.Flush();
        assert.notEqual(target.OverlayRoot, undefined, 'overlay layer should be live after open');
        assert.equal(target.OverlayRoot!.visualChildren.length, 1, 'one host attached');

        cb.IsDropDownOpen = false;
        target.Flush();
        assert.equal(target.OverlayRoot!.visualChildren.length, 0, 'host detached on close');
    });

    test('Clicking the selection box toggles IsDropDownOpen', () => {
        const cb = new ComboBox();
        cb.Items = ['One', 'Two'];
        mountInTarget(cb);

        const selectionBox = cb.visualChildren[0]!;

        const im = new InputManager();
        im.InjectPointerDown(selectionBox, pointer());
        im.InjectPointerUp  (selectionBox, pointer());
        assert.equal(cb.IsDropDownOpen, true);

        im.InjectPointerDown(selectionBox, pointer());
        im.InjectPointerUp  (selectionBox, pointer());
        assert.equal(cb.IsDropDownOpen, false);
    });

    test('Clicking an item commits selection and closes the dropdown', () => {
        const cb = new ComboBox();
        cb.Items = ['Apple', 'Pear', 'Plum'];
        const target = mountInTarget(cb);
        cb.IsDropDownOpen = true;
        target.Flush();

        const items = popupItems(target);
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

    test('Clicking the click-away scrim dismisses the dropdown', () => {
        const cb = new ComboBox();
        cb.Items = ['Apple', 'Pear'];
        const target = mountInTarget(cb);
        cb.IsDropDownOpen = true;
        target.Flush();

        // popupHost children: [scrim, popup]. Scrim absorbs outside clicks.
        const scrim = target.OverlayRoot!.visualChildren[0]!.visualChildren[0]!;
        const im = new InputManager();
        im.InjectPointerDown(scrim, pointer());
        im.InjectPointerUp  (scrim, pointer());
        assert.equal(cb.IsDropDownOpen, false);
    });
});
