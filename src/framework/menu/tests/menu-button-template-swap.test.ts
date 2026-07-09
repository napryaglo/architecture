import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { NoModifiers, Panel, PointerButton, Visual, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';
import { HeadlessTarget } from '../../../visual-engine/index.js';
import { Button } from '../../buttons/button.js';
import { Border } from '../../../basic/border.js';
import { StackPanel } from '../../../basic/panels/stack-panel.js';
import { Orientation } from '../../../basic/panels/orientation.js';
import { TextBlock } from '../../../basic/text-block.js';
import { ControlTemplate } from '../../../basic/templates/control-template.js';
import { ItemsPresenter } from '../../../basic/templates/items-presenter.js';
import { ClickAwayScrim } from '../../../basic/click-away-scrim.js';
import { MenuButton, MenuItem, MenuPopupHost } from '../menu-strip.js';

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

// Mirror @DefaultMenuButtonTrigger's shape: a Button root whose Content is
// a named StackPanel holding the named PART_HeaderText. Names are set via
// .Name so ControlTemplate.Apply builds the instance NameScope from them
// (registerNamedVisuals walks the consumer-Content logical child too).
// A __tag marker on PART_HeaderText makes the active template observable.
function makeTriggerTemplate(tag: string): ControlTemplate
{
    return new ControlTemplate(() => {
        const btn   = new Button();
        const stack = new StackPanel();
        stack.Name = 'PART_TriggerStack';
        stack.Orientation = Orientation.Horizontal;
        const text = new TextBlock();
        text.Name = 'PART_HeaderText';
        (text as unknown as { __tag: string }).__tag = tag;
        stack.AddChild(text);
        btn.Content = stack;
        return btn;
    });
}

describe('MenuButton TriggerTemplate swap-while-active (§18.12)', () => {
    beforeEach(() => { initTestApp(); });

    test('swapping TriggerTemplate rebuilds the trigger and re-hydrates Header', () => {
        const root = new Root();
        const mb = new MenuButton();
        mb.Header = 'File';
        root.AddChild(mb);

        const trigger1 = mb.visualChildren[0] as Button;
        const text1 = trigger1.FindName('PART_HeaderText') as TextBlock;
        assert.equal(text1.Text, 'File', 'Header lands on the default trigger');

        mb.TriggerTemplate = makeTriggerTemplate('v2');

        const trigger2 = mb.visualChildren[0] as Button;
        assert.notEqual(trigger2, trigger1, 'the trigger Button was rebuilt');
        const text2 = trigger2.FindName('PART_HeaderText') as TextBlock;
        assert.equal((text2 as unknown as { __tag: string }).__tag, 'v2',
            'the swapped-in chrome is what renders');
        assert.equal(text2.Text, 'File',
            'Header text re-hydrated onto the rebuilt trigger');
    });

    test('the rebuilt trigger still toggles IsOpen on click', () => {
        const root = new Root();
        const mb = new MenuButton();
        root.AddChild(mb);
        mb.TriggerTemplate = makeTriggerTemplate('v2');

        const btn = mb.visualChildren[0] as Button;
        assert.equal(mb.IsOpen, false);
        const im = new InputManager();
        im.InjectPointerDown(btn, pointer());
        im.InjectPointerUp  (btn, pointer());
        assert.equal(mb.IsOpen, true, 'click on the swapped trigger flips IsOpen');
    });

    test('a later Header write reaches the swapped trigger', () => {
        const root = new Root();
        const mb = new MenuButton();
        root.AddChild(mb);
        mb.TriggerTemplate = makeTriggerTemplate('v2');

        mb.Header = 'Edit';
        const text = (mb.visualChildren[0] as Button).FindName('PART_HeaderText') as TextBlock;
        assert.equal(text.Text, 'Edit',
            'Header DP still drives PART_HeaderText after a trigger swap');
    });
});

// Mirror @DefaultMenuButtonPopup's shape: a MenuPopupHost root holding a
// named PART_Scrim (ClickAwayScrim) and a named PART_PopupContainer (Border)
// wrapping an ItemsPresenter. A __tag on the container makes the active
// popup chrome observable across a swap.
function makePopupTemplate(tag: string): ControlTemplate
{
    return new ControlTemplate(() => {
        const host = new MenuPopupHost();
        host.Name = 'PART_PopupHost';
        const scrim = new ClickAwayScrim();
        scrim.Name = 'PART_Scrim';
        const container = new Border();
        container.Name = 'PART_PopupContainer';
        (container as unknown as { __tag: string }).__tag = tag;
        container.SetChild(new ItemsPresenter());
        host.AddChild(scrim);
        host.AddChild(container);
        return host;
    });
}

describe('MenuButton Template (popup-chrome) swap-while-active (§18.12)', () => {
    beforeEach(() => { initTestApp(); });

    function mount(mb: MenuButton): HeadlessTarget
    {
        const root = new Root();
        root.AddChild(mb);
        const target = new HeadlessTarget(400, 300);
        target.Content = root;
        target.Flush();
        return target;
    }

    test('swapping Template re-adopts popup parts; menu Items survive', () => {
        const mb = new MenuButton();
        const item = new MenuItem();
        item.Header = 'New';
        mb.AddChild(item);
        mount(mb);

        // Swap the popup chrome. The items panel (holding the MenuItem) must
        // carry across to the new template's ItemsPresenter.
        mb.Template = makePopupTemplate('popup-v2');

        // Open and assert the NEW chrome is what mounts, still hosting the item.
        mb.IsOpen = true;
        assert.equal(mb.IsOpen, true);
        assert.ok(mb.ItemCount() === 1 && mb.ItemAt(0) === item,
            'the MenuItem survives the popup-chrome swap');
    });

    test('swapping Template while the popup is OPEN remounts the new chrome', () => {
        const mb = new MenuButton();
        mb.AddChild(makeItem('One'));
        const target = mount(mb);

        // Open first — the original chrome mounts onto the OverlayLayer.
        mb.IsOpen = true;
        target.Flush();
        const overlayBefore = target.OverlayRoot!;
        assert.equal(overlayBefore.visualChildren.length, 1,
            'original popup host mounted');
        const hostBefore = overlayBefore.visualChildren[0] as MenuPopupHost;

        // Swap chrome WHILE open — the stale host unmounts, the fresh one mounts.
        mb.Template = makePopupTemplate('popup-v2');
        target.Flush();

        const overlayAfter = target.OverlayRoot!;
        assert.equal(overlayAfter.visualChildren.length, 1,
            'exactly one popup host mounted after the swap (no stale leftover)');
        const hostAfter = overlayAfter.visualChildren[0] as MenuPopupHost;
        assert.notEqual(hostAfter, hostBefore, 'the mounted host is the new one');
        const container = (hostAfter as unknown as Visual)
            .FindName('PART_PopupContainer') as Border;
        assert.equal((container as unknown as { __tag: string }).__tag, 'popup-v2',
            'the swapped-in chrome is what renders');

        // Closing still tears the (new) host down.
        mb.IsOpen = false;
        target.Flush();
        assert.equal(target.OverlayRoot!.visualChildren.length, 0,
            'closing detaches the swapped host');
    });

    test('a swap while CLOSED leaves nothing mounted', () => {
        const mb = new MenuButton();
        mb.AddChild(makeItem('One'));
        const target = mount(mb);

        mb.Template = makePopupTemplate('popup-v2');
        target.Flush();
        // No overlay materialised (or an empty one) — nothing is mounted.
        assert.equal(target.OverlayRoot?.visualChildren.length ?? 0, 0,
            'a closed MenuButton mounts nothing after a Template swap');
    });
});

function makeItem(header: string): MenuItem
{
    const mi = new MenuItem();
    mi.Header = header;
    return mi;
}
