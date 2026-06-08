import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    Panel,
    RelayCommand,
    Visual,
} from '../../../runtime/index.js';
import {
    CommandBinding,
    CommandManager,
    Control,
    RoutedCommand,
    type ExecutedRoutedEventArgs,
    type CanExecuteRoutedEventArgs,
} from '../../index.js';;

// Test fixture: a Control that doubles as a Panel-shaped parent. The
// fixture extends Control (so CommandBindings exist) but adopts the
// children-via-AddChild surface Panel provides — both are needed by
// the routing tests below.
class Root extends Control
{
    private readonly _kids: Visual[] = [];
    public AddChild(child: Visual): void
    {
        this._kids.push(child);
        // AttachLogical wires the property-inheritance edge; AttachVisual
        // wires the render / hit-test edge. Panel.AddChild does both;
        // we replicate that here.
        (this as unknown as { AttachLogical(v: Visual): void }).AttachLogical(child);
        (this as unknown as { AttachVisual(v: Visual): void }).AttachVisual(child);
    }
    public override get visualChildren():  readonly Visual[] { return this._kids; }
    public override get logicalChildren(): readonly Visual[] { return this._kids; }
}
// Keep the Panel import alive (some test bodies still type-annotate
// off Panel even though Root no longer extends it).
void Panel;

describe('CommandBinding — Executed / CanExecute handlers', () => {
    beforeEach(() => { CommandManager._resetForTests(); });

    test('Executed handler runs when CommandManager.Execute dispatches', () => {
        const root = new Root();
        const cmd = new RoutedCommand('TestCmd', RoutedCommand);
        let called = 0;
        let seenParam: unknown = null;
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_sender, args: ExecutedRoutedEventArgs) => {
                called++;
                seenParam = args.Parameter;
                args.Handled = true;
            },
        }));
        CommandManager.Execute(cmd, 'hello', root);
        assert.equal(called, 1);
        assert.equal(seenParam, 'hello');
    });

    test('CanExecute default is false when only Executed is set BUT CanExecute is implicit true', () => {
        // WPF parity: a CommandBinding with only an Executed handler
        // implicitly treats the command as executable. Verifies the
        // implicit-true gate in _invokeCanExecute.
        const root = new Root();
        const cmd = new RoutedCommand('TestCmd', RoutedCommand);
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { args.Handled = true; },
        }));
        assert.equal(CommandManager.CanExecute(cmd, undefined, root), true);
    });

    test('CanExecute handler can veto execution', () => {
        const root = new Root();
        const cmd = new RoutedCommand('TestCmd', RoutedCommand);
        let executed = 0;
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed:   () => { executed++; },
            canExecute: (_s, args: CanExecuteRoutedEventArgs) => {
                args.CanExecute = false;
            },
        }));
        const fired = CommandManager.Execute(cmd, undefined, root);
        assert.equal(fired, false);
        assert.equal(executed, 0);
    });

    test('CommandBinding routing walks up the visual tree', () => {
        // Binding lives on the root; child is the target.
        const root  = new Root();
        const child = new Root();
        root.AddChild(child);

        const cmd = new RoutedCommand('AlignLeft', RoutedCommand);
        let executedSender: unknown = null;
        let executedTarget: unknown = null;
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (sender, args) => {
                executedSender = sender;
                executedTarget = args.Target;
                args.Handled   = true;
            },
        }));
        CommandManager.Execute(cmd, undefined, child);
        assert.equal(executedSender, root, 'sender is the binding host (root)');
        assert.equal(executedTarget, child, 'args.Target is the dispatch origin');
    });

    test('inner binding shadows outer binding for the same command', () => {
        const root  = new Root();
        const child = new Root();
        root.AddChild(child);

        const cmd = new RoutedCommand('Cmd', RoutedCommand);
        const log: string[] = [];
        root.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { log.push('root');  args.Handled = true; },
        }));
        child.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { log.push('child'); args.Handled = true; },
        }));
        CommandManager.Execute(cmd, undefined, child);
        assert.deepEqual(log, ['child'], 'inner binding wins');
    });

    test('Relay sugar forwards Executed/CanExecute to an inner ICommand', () => {
        const root = new Root();
        const cmd = new RoutedCommand('Save', RoutedCommand);
        let executed = 0;
        let gate = true;
        const relay = new RelayCommand(() => { executed++; }, () => gate);

        root.CommandBindings.push(CommandBinding.Relay(cmd, relay));

        assert.equal(CommandManager.CanExecute(cmd, undefined, root), true);
        CommandManager.Execute(cmd, 'p', root);
        assert.equal(executed, 1);

        gate = false;
        assert.equal(CommandManager.CanExecute(cmd, undefined, root), false);
        CommandManager.Execute(cmd, 'p', root);
        // Gated — still 1.
        assert.equal(executed, 1);
    });

    test('No matching binding → CanExecute false, Execute returns false', () => {
        const root = new Root();
        const cmd = new RoutedCommand('Unbound', RoutedCommand);
        assert.equal(CommandManager.CanExecute(cmd, undefined, root), false);
        assert.equal(CommandManager.Execute(cmd, undefined, root), false);
    });
});

describe('CommandManager class-level bindings', () => {
    beforeEach(() => { CommandManager._resetForTests(); });

    test('Class-level CommandBinding fires for every instance of the class', () => {
        const cmd = new RoutedCommand('ClassCmd', RoutedCommand);
        let fired = 0;
        CommandManager.RegisterClassCommandBinding(Root, new CommandBinding(cmd, {
            executed: (_s, args) => { fired++; args.Handled = true; },
        }));

        const a = new Root();
        const b = new Root();
        CommandManager.Execute(cmd, undefined, a);
        CommandManager.Execute(cmd, undefined, b);
        assert.equal(fired, 2);
    });

    test('Instance binding shadows class binding on the same Visual', () => {
        const cmd = new RoutedCommand('ShadowCmd', RoutedCommand);
        const log: string[] = [];
        CommandManager.RegisterClassCommandBinding(Root, new CommandBinding(cmd, {
            executed: (_s, args) => { log.push('class'); args.Handled = true; },
        }));

        const r = new Root();
        r.CommandBindings.push(new CommandBinding(cmd, {
            executed: (_s, args) => { log.push('instance'); args.Handled = true; },
        }));
        CommandManager.Execute(cmd, undefined, r);
        assert.deepEqual(log, ['instance']);
    });
});
