import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Application, Visual } from '../../../runtime/index.js';
import { Control, InputManager } from '../../../framework/index.js';;
import {
    CommandBinding,
    CommandManager,
    RoutedCommand,
} from '../../index.js';;

class FocusableRoot extends Control
{
    private readonly _kids: Visual[] = [];
    constructor() { super(); this.Focusable = true; }
    public AddChild(child: Visual): void
    {
        this._kids.push(child);
        (this as unknown as { AttachLogical(v: Visual): void }).AttachLogical(child);
        (this as unknown as { AttachVisual(v: Visual): void }).AttachVisual(child);
    }
    public override get visualChildren():  readonly Visual[] { return this._kids; }
    public override get logicalChildren(): readonly Visual[] { return this._kids; }
}

describe('CommandManager.RequerySuggested', () => {
    beforeEach(() => {
        Application.current = null;
        CommandManager._resetForTests();
    });

    test('Subscribers fire on InvalidateRequerySuggested', () => {
        let fired = 0;
        const listener = (): void => { fired++; };
        CommandManager.SubscribeRequerySuggested(listener);
        CommandManager.InvalidateRequerySuggested();
        CommandManager.InvalidateRequerySuggested();
        assert.equal(fired, 2);
    });

    test('Unsubscribed listener no longer fires', () => {
        let fired = 0;
        const listener = (): void => { fired++; };
        CommandManager.SubscribeRequerySuggested(listener);
        CommandManager.UnsubscribeRequerySuggested(listener);
        CommandManager.InvalidateRequerySuggested();
        assert.equal(fired, 0);
    });

    test('Focus change fires RequerySuggested + publishes focused visual', () => {
        let fired = 0;
        CommandManager.SubscribeRequerySuggested(() => { fired++; });

        const im = new InputManager();
        const v  = new FocusableRoot();
        im.SetFocus(v);
        assert.equal(fired, 1);
        assert.equal(CommandManager.GetFocusedVisualForRouting(), v);

        im.SetFocus(undefined);
        assert.equal(fired, 2);
        assert.equal(CommandManager.GetFocusedVisualForRouting(), undefined);
    });

    test('Snapshot iteration safe against listener mutation mid-fire', () => {
        const fired: string[] = [];
        const a = (): void => { fired.push('a'); CommandManager.UnsubscribeRequerySuggested(a); };
        const b = (): void => { fired.push('b'); };
        CommandManager.SubscribeRequerySuggested(a);
        CommandManager.SubscribeRequerySuggested(b);
        CommandManager.InvalidateRequerySuggested();
        assert.deepEqual(fired, ['a', 'b']);
        // Next pulse — `a` is gone.
        fired.length = 0;
        CommandManager.InvalidateRequerySuggested();
        assert.deepEqual(fired, ['b']);
    });
});

describe('RoutedCommand.Execute via focused visual', () => {
    beforeEach(() => {
        Application.current = null;
        CommandManager._resetForTests();
    });

    test('RoutedCommand.Execute dispatches to focused visual when published', () => {
        const root = new FocusableRoot();
        const cmd  = new RoutedCommand('Foo', RoutedCommand);
        let executed = 0;
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { executed++; args.Handled = true; },
        }));

        const im = new InputManager();
        im.SetFocus(root);
        cmd.Execute('p');
        assert.equal(executed, 1);
    });

    test('RoutedCommand.CanExecute checks against focused visual', () => {
        const root = new FocusableRoot();
        const cmd  = new RoutedCommand('Foo', RoutedCommand);
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed:   () => {},
            canExecute: (_s, args) => { args.CanExecute = true; },
        }));

        const im = new InputManager();
        im.SetFocus(root);
        assert.equal(cmd.CanExecute(), true);
        im.SetFocus(undefined);
        assert.equal(cmd.CanExecute(), false);
    });
});
