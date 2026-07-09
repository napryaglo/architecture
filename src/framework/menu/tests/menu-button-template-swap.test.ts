import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../../basic/tests/test-app.js';

import { NoModifiers, Panel, PointerButton, type PointerEventInit } from '../../../runtime/index.js';
import { InputManager } from '../../../framework/index.js';
import { Button } from '../../buttons/button.js';
import { StackPanel } from '../../../basic/panels/stack-panel.js';
import { Orientation } from '../../../basic/panels/orientation.js';
import { TextBlock } from '../../../basic/text-block.js';
import { ControlTemplate } from '../../../basic/templates/control-template.js';
import { MenuButton } from '../menu-strip.js';

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
