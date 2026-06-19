import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initTestApp } from '../../basic/tests/test-app.js';
import {
    CommandBase,
    KeyEventArgs,
    NoModifiers,
    PointerButton,
    RelayCommand,
    dispatchKey,
    type PointerEventInit,
} from '../../runtime/index.js';
import { HeadlessTarget } from '../../visual-engine/index.js';
import { Border } from '../../basic/border.js';
import { Button } from '../button.js';
import { InputManager } from '../input-manager.js';
import { CommandManager } from '../commands/command-manager.js';
import { KeyBinding } from '../commands/input-binding.js';
import { RoutedCommand } from '../commands/routed-command.js';
import {
    PlacementMode,
    ToolTipService,
    TooltipPopupHost,
} from '../tooltip-service.js';
import { Tooltip } from '../tooltip.js';

function pointer(overrides: Partial<PointerEventInit> = {}): PointerEventInit
{
    return {
        HostX: 0, HostY: 0,
        Button: PointerButton.Left,
        Buttons: 1,
        Modifiers: NoModifiers,
        PointerId: 0,
        Pressure: 0,
        PointerType: 'mouse',
        ...overrides,
    };
}

function resetTooltipService(): void
{
    ToolTipService.dismiss();
}

describe('CommandBase metadata', () => {

    test('defaults are empty / undefined', () => {
        const cmd = new RelayCommand(() => undefined);
        assert.equal(cmd.Text,        '');
        assert.equal(cmd.Description, '');
        assert.equal(cmd.Icon,        undefined);
    });

    test('RelayCommand accepts a metadata bag at construction', () => {
        const cmd = new RelayCommand(() => undefined, undefined, {
            Text:        'Save',
            Description: 'Save the current document',
        });
        assert.equal(cmd.Text,        'Save');
        assert.equal(cmd.Description, 'Save the current document');
    });

    test('RoutedCommand accepts a metadata bag as its 4th arg', () => {
        const cmd = new RoutedCommand('Save', class {}, [], { Text: 'Save' });
        assert.equal(cmd.Text, 'Save');
    });

    test('mutating metadata after construction fires CanExecuteChanged listeners? NO — these are display DPs, not gate fields', () => {
        // CommandBase.Text/Description/Icon are bindable DPs, but the
        // CanExecuteChanged pulse fires on RaiseCanExecuteChanged only.
        // Metadata writes are intentionally silent — re-rendering a
        // tooltip uses Model-level property-changed listeners, not the
        // command's CanExecuteChanged hook.
        const cmd = new RelayCommand(() => undefined);
        let pulses = 0;
        cmd.AddCanExecuteChangedListener(() => pulses++);
        cmd.Text = 'Save';
        assert.equal(pulses, 0,
            'metadata writes do NOT pulse CanExecuteChanged');
    });
});

describe('KeyBinding.DisplayString', () => {

    test('falls back to a formatted gesture when not explicitly set', () => {
        const b = new KeyBinding('S', { Control: true });
        assert.equal(b.DisplayString, 'Ctrl+S');
    });

    test('order is Ctrl → Alt → Shift → Meta', () => {
        const b = new KeyBinding('S', { Control: true, Alt: true, Shift: true });
        assert.equal(b.DisplayString, 'Ctrl+Alt+Shift+S');
    });

    test('explicit override wins over the computed string', () => {
        const b = new KeyBinding('Z', { Control: true }, undefined, undefined, '⌘Z');
        assert.equal(b.DisplayString, '⌘Z');
    });

    test('single-char keys are upper-cased; multi-char names pass through', () => {
        assert.equal(new KeyBinding('a', {}).DisplayString,           'A');
        assert.equal(new KeyBinding('ArrowUp', {}).DisplayString,     'ArrowUp');
        assert.equal(new KeyBinding('F4', {}).DisplayString,          'F4');
    });
});

describe('CommandManager.FindShortcutForCommand', () => {

    test('returns the DisplayString of the first matching instance KeyBinding on the anchor', () => {
        initTestApp();
        const cmd  = new RelayCommand(() => undefined, undefined, { Text: 'Save' });
        const btn  = new Button();
        btn.InputBindings.push(new KeyBinding('S', { Control: true }, cmd));
        const target = new HeadlessTarget(200, 100);
        target.Content = btn;
        target.Flush();

        assert.equal(
            CommandManager.FindShortcutForCommand(cmd, btn),
            'Ctrl+S',
        );
    });

    test('walks up the ancestor chain — a binding on the root shadows nothing on the anchor', () => {
        initTestApp();
        const cmd   = new RelayCommand(() => undefined);
        const inner = new Button();
        const root  = new Border();
        root.Child  = inner;
        // Put the KeyBinding on the OUTER root by way of a Control
        // wrapper that supports InputBindings (Border isn't a Control,
        // so we use a Button as the carrier).
        const outerCarrier = new Button();
        outerCarrier.Content = inner;
        outerCarrier.InputBindings.push(new KeyBinding('F4', {}, cmd));
        const target = new HeadlessTarget(200, 100);
        target.Content = outerCarrier;
        target.Flush();

        assert.equal(
            CommandManager.FindShortcutForCommand(cmd, inner),
            'F4',
            'inner anchor finds the carrier ancestor\'s binding',
        );
    });

    test('returns undefined when no binding maps to the command', () => {
        initTestApp();
        const cmd  = new RelayCommand(() => undefined);
        const btn  = new Button();
        const target = new HeadlessTarget(200, 100);
        target.Content = btn;
        target.Flush();

        assert.equal(
            CommandManager.FindShortcutForCommand(cmd, btn),
            undefined,
        );
    });
});

describe('Button keyboard activation', () => {

    test('Space on a focused Button fires the bound Command', () => {
        initTestApp();
        let fired = 0;
        const cmd = new RelayCommand(() => { fired++; });
        const btn = new Button();
        btn.Command = cmd;
        const target = new HeadlessTarget(200, 100);
        target.Content = btn;
        target.Flush();

        const args = new KeyEventArgs('KeyDown', btn, {
            Key: ' ', Code: 'Space', Modifiers: NoModifiers, Repeat: false,
        });
        dispatchKey(args);

        assert.equal(fired, 1, 'Space → Command.Execute');
        assert.equal(args.Handled, true, 'Button marked the args Handled');
    });

    test('Enter on a focused Button also fires Command', () => {
        initTestApp();
        let fired = 0;
        const cmd = new RelayCommand(() => { fired++; });
        const btn = new Button();
        btn.Command = cmd;
        const target = new HeadlessTarget(200, 100);
        target.Content = btn;
        target.Flush();

        const args = new KeyEventArgs('KeyDown', btn, {
            Key: 'Enter', Code: 'Enter', Modifiers: NoModifiers, Repeat: false,
        });
        dispatchKey(args);

        assert.equal(fired, 1, 'Enter → Command.Execute');
    });

    test('other keys are ignored', () => {
        initTestApp();
        let fired = 0;
        const cmd = new RelayCommand(() => { fired++; });
        const btn = new Button();
        btn.Command = cmd;
        const target = new HeadlessTarget(200, 100);
        target.Content = btn;
        target.Flush();

        const args = new KeyEventArgs('KeyDown', btn, {
            Key: 'a', Code: 'KeyA', Modifiers: NoModifiers, Repeat: false,
        });
        dispatchKey(args);

        assert.equal(fired, 0, 'unrelated key does not trigger activation');
    });

    test('CanExecute=false suppresses keyboard activation', () => {
        initTestApp();
        let fired = 0;
        const cmd = new RelayCommand(
            () => { fired++; },
            () => false,
        );
        const btn = new Button();
        btn.Command = cmd;
        const target = new HeadlessTarget(200, 100);
        target.Content = btn;
        target.Flush();

        const args = new KeyEventArgs('KeyDown', btn, {
            Key: ' ', Code: 'Space', Modifiers: NoModifiers, Repeat: false,
        });
        dispatchKey(args);

        assert.equal(fired, 0, 'gated command does not fire');
    });
});

describe('Button auto-tooltip from Command', () => {

    test('setting Command (a CommandBase) auto-fills ToolTipService.ToolTip', () => {
        initTestApp();
        const cmd = new RelayCommand(() => undefined, undefined, {
            Text: 'Save', Description: 'Save the current document',
        });
        const btn = new Button();
        assert.equal(ToolTipService.GetToolTip(btn), undefined,
            'baseline: button has no tooltip set');

        btn.Command = cmd;
        assert.equal(ToolTipService.GetToolTip(btn), cmd,
            'Button auto-published the command as its tooltip Content');
    });

    test('an explicit ToolTip set BEFORE Command wins — no auto-overwrite', () => {
        initTestApp();
        const cmd = new RelayCommand(() => undefined, undefined, { Text: 'Save' });
        const btn = new Button();
        ToolTipService.SetToolTip(btn, 'Custom');

        btn.Command = cmd;
        assert.equal(ToolTipService.GetToolTip(btn), 'Custom',
            'pre-existing explicit ToolTip retains priority');
    });

    test('clearing Command retracts the auto-published ToolTip', () => {
        initTestApp();
        const cmd = new RelayCommand(() => undefined, undefined, { Text: 'Save' });
        const btn = new Button();
        btn.Command = cmd;
        assert.equal(ToolTipService.GetToolTip(btn), cmd);
        btn.Command = undefined;
        assert.equal(ToolTipService.GetToolTip(btn), undefined,
            'auto-published tooltip is retracted when Command is cleared');
    });

    test('plain ICommand (no Text/Description) does NOT auto-publish a tooltip', () => {
        initTestApp();
        const cmd: { Execute: () => void; CanExecute: () => boolean; AddCanExecuteChangedListener: () => void; RemoveCanExecuteChangedListener: () => void } = {
            Execute: () => undefined,
            CanExecute: () => true,
            AddCanExecuteChangedListener: () => undefined,
            RemoveCanExecuteChangedListener: () => undefined,
        };
        const btn = new Button();
        btn.Command = cmd as never;
        assert.equal(ToolTipService.GetToolTip(btn), undefined,
            'non-CommandBase ICommand has nothing to show → no auto tooltip');
    });
});

describe('ToolTipService.show populates Shortcut', () => {

    test('CommandBase content with a matching KeyBinding → Tooltip.Shortcut shows the gesture', async () => {
        initTestApp();
        resetTooltipService();
        const cmd = new RelayCommand(() => undefined, undefined, { Text: 'Save' });
        // Plain Button — set the ToolTip + KeyBinding directly, bypass
        // the auto-derive path (covered in 'Button auto-tooltip from
        // Command'). Keeps this assertion focused on the
        // shortcut-resolution slice.
        const btn = new Button();
        btn.Width = 60; btn.Height = 30;
        btn.InputBindings.push(new KeyBinding('S', { Control: true }, cmd));
        const target = new HeadlessTarget(300, 200);
        target.Content = btn;
        target.Flush();

        ToolTipService.SetInitialShowDelay(btn, 5);
        ToolTipService.SetToolTip(btn, cmd);

        const im = new InputManager();
        im.InjectPointerMove(btn, pointer({ HostX: 30, HostY: 15 }));
        await new Promise<void>(r => setTimeout(r, 20));

        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined);
        const popupHost = (overlay as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as TooltipPopupHost;
        const tooltip   = (popupHost as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as Tooltip;
        assert.equal(tooltip.Shortcut, 'Ctrl+S',
            'Tooltip.Shortcut populated from the matching KeyBinding');
        assert.equal(tooltip.Content, cmd,
            'Content set to the CommandBase — DataTemplate dispatch happens inside ContentPresenter');

        resetTooltipService();
        ToolTipService.SetToolTip(btn, undefined);
        // Detach the InputBinding so it doesn't keep cmd reachable past
        // the test for the singleton's lookup map.
        btn.InputBindings.length = 0;
    });

    test('non-CommandBase content leaves Shortcut empty', async () => {
        initTestApp();
        resetTooltipService();
        const btn = new Button();
        btn.Width = 60; btn.Height = 30;
        const target = new HeadlessTarget(300, 200);
        target.Content = btn;
        target.Flush();

        ToolTipService.SetInitialShowDelay(btn, 5);
        ToolTipService.SetToolTip(btn, 'Save');

        const im = new InputManager();
        im.InjectPointerMove(btn, pointer({ HostX: 30, HostY: 15 }));
        await new Promise<void>(r => setTimeout(r, 20));

        const overlay = target.OverlayRoot as Border | undefined;
        assert.ok(overlay !== undefined);
        const popupHost = (overlay as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as TooltipPopupHost;
        const tooltip   = (popupHost as unknown as { Children: { Get(i: number): unknown } }).Children.Get(0) as Tooltip;
        assert.equal(tooltip.Shortcut, '', 'string content carries no shortcut');

        resetTooltipService();
        ToolTipService.SetToolTip(btn, undefined);
        // Touch the unused PlacementMode import so the linter is happy.
        void PlacementMode.Bottom;
    });
});
