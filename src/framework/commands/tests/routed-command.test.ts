import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    NoModifiers,
} from '../../../runtime/index.js';
import {
    CommandManager,
    KeyGesture,
    RoutedCommand,
} from '../../index.js';;

describe('RoutedCommand — identity + ICommand contract', () => {
    beforeEach(() => { CommandManager._resetForTests(); });

    test('Name / OwnerType / InputGestures populate from constructor args', () => {
        const cmd = new RoutedCommand('Save', RoutedCommand, [new KeyGesture('S', { ...NoModifiers, Control: true })]);
        assert.equal(cmd.Name, 'Save');
        assert.equal(cmd.OwnerType, RoutedCommand);
        assert.equal(cmd.InputGestures.length, 1);
        assert.equal(cmd.InputGestures[0]?.DisplayString, 'Ctrl+S');
    });

    test('InputGestures defaults to empty when omitted', () => {
        const cmd = new RoutedCommand('Foo', RoutedCommand);
        assert.deepEqual([...cmd.InputGestures], []);
    });

    test('KeyGesture.DisplayString formats modifiers in canonical order', () => {
        const g = new KeyGesture('S', { Control: true, Shift: true, Alt: false, Meta: false });
        assert.equal(g.DisplayString, 'Ctrl+Shift+S');
    });

    test('CanExecute without a focused-visual target returns false', () => {
        const cmd = new RoutedCommand('Foo', RoutedCommand);
        // No InputManager has published a focused visual yet — the
        // bare ICommand surface has nowhere to dispatch to.
        assert.equal(cmd.CanExecute(), false);
    });

    test('Execute without a focused-visual target is a no-op', () => {
        const cmd = new RoutedCommand('Foo', RoutedCommand);
        // No throw, no observable effect — Execute silently no-ops
        // when there's no target. Same shape as WPF RoutedCommand
        // when no Keyboard.FocusedElement is set.
        cmd.Execute();
        assert.ok(true);
    });

    test('CanExecuteChanged subscribers fire on InvalidateRequerySuggested', () => {
        // RoutedCommand piggybacks on CommandManager.RequerySuggested
        // because per-command CanExecute is decided by the dispatch
        // tree, not by the command itself.
        const cmd = new RoutedCommand('Foo', RoutedCommand);
        let fired = 0;
        cmd.AddCanExecuteChangedListener(() => { fired++; });
        CommandManager.InvalidateRequerySuggested();
        CommandManager.InvalidateRequerySuggested();
        assert.equal(fired, 2);
    });

    test('Removed CanExecuteChanged listener no longer fires', () => {
        const cmd = new RoutedCommand('Foo', RoutedCommand);
        let fired = 0;
        const listener = (): void => { fired++; };
        cmd.AddCanExecuteChangedListener(listener);
        cmd.RemoveCanExecuteChangedListener(listener);
        CommandManager.InvalidateRequerySuggested();
        assert.equal(fired, 0);
    });
});
