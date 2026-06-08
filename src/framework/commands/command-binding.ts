import type { Visual } from '../../runtime/visual.js';
import type { ICommand } from '../../runtime/command.js';
import { RoutedCommand } from './routed-command.js';

// Args delivered to a CommandBinding's Executed handler. Mirrors WPF's
// ExecutedRoutedEventArgs: carries the command identity, the parameter
// originally supplied to Execute, the target Visual the routed event
// originated from, and a Handled flag the handler can set to mark the
// command as taken (stops the routing walk).
export class ExecutedRoutedEventArgs
{
    public readonly Command:   RoutedCommand;
    public readonly Parameter: unknown;
    /** Visual the routed Execute() was dispatched against. Walks up
     *  from here looking for the first matching CommandBinding. The
     *  binding's `sender` (passed alongside `args`) is the Visual
     *  carrying the binding, NOT the target. */
    public readonly Target:    Visual;
    public Handled: boolean = false;

    constructor(command: RoutedCommand, parameter: unknown, target: Visual)
    {
        this.Command   = command;
        this.Parameter = parameter;
        this.Target    = target;
    }
}

// Args delivered to a CommandBinding's CanExecute handler. The handler
// writes the boolean answer to `CanExecute` (default false matches WPF —
// the framework treats "no handler claimed the command" as "not
// executable here"). `ContinueRouting` mirrors WPF: set to true to ask
// the dispatcher to keep walking even if this binding handled the
// callback (rare; used to delegate up the tree without taking ownership).
export class CanExecuteRoutedEventArgs
{
    public readonly Command:   RoutedCommand;
    public readonly Parameter: unknown;
    public readonly Target:    Visual;
    public CanExecute:      boolean = false;
    public ContinueRouting: boolean = false;
    public Handled:         boolean = false;

    constructor(command: RoutedCommand, parameter: unknown, target: Visual)
    {
        this.Command   = command;
        this.Parameter = parameter;
        this.Target    = target;
    }
}

export type ExecutedRoutedEventHandler   = (sender: Visual, args: ExecutedRoutedEventArgs)   => void;
export type CanExecuteRoutedEventHandler = (sender: Visual, args: CanExecuteRoutedEventArgs) => void;

// A CommandBinding glues a RoutedCommand identity to a pair of handlers
// (Executed + CanExecute). Lives in `Visual.CommandBindings` (per-
// instance) or in `CommandManager.RegisterClassCommandBinding` (per-
// control-class). When a RoutedCommand fires against a target Visual,
// CommandManager walks up from the target inspecting CommandBindings
// on each ancestor; the first match handles the call.
//
// The handlers receive the binding's HOST Visual as `sender` (the
// Visual whose CommandBindings collection contains this binding), not
// the dispatch target. Inside the handler, `args.Target` is the
// dispatch origin; `sender` is the scope of the binding. Same shape
// as WPF.
//
// The `Relay` ergonomic shortcut: when set, the binding's Executed and
// CanExecute both forward to the given ICommand (typically a
// RelayCommand on a VM). This is the canonical "RoutedCommand identity
// + RelayCommand implementation" bridge — write
//   new CommandBinding(AlignmentCommands.AlignLeft, { relay: vm.AlignLeft })
// instead of redeclaring Executed/CanExecute by hand. Explicit Executed
// / CanExecute handlers take precedence; Relay only fills the gap when
// they're absent.
export interface CommandBindingOptions
{
    /** Function delegate run when a matching RoutedCommand is dispatched
     *  to this binding's scope. */
    executed?:   ExecutedRoutedEventHandler;
    /** Function delegate that reports whether the command should be
     *  treated as executable at the current target. Sets
     *  `args.CanExecute = true|false`. */
    canExecute?: CanExecuteRoutedEventHandler;
    /** Shortcut: forward Executed/CanExecute to this ICommand. Equivalent
     *  to writing matching delegates that invoke `relay.Execute` and
     *  `relay.CanExecute`. Used by the mixed RoutedCommand + RelayCommand
     *  pattern. Explicit `executed` / `canExecute` win when both are set. */
    relay?:      ICommand;
}

export class CommandBinding
{
    public readonly Command:    RoutedCommand;
    public readonly Executed:   ExecutedRoutedEventHandler   | undefined;
    public readonly CanExecute: CanExecuteRoutedEventHandler | undefined;
    public readonly Relay:      ICommand                     | undefined;

    constructor(command: RoutedCommand, options?: CommandBindingOptions)
    {
        this.Command    = command;
        this.Executed   = options?.executed;
        this.CanExecute = options?.canExecute;
        this.Relay      = options?.relay;
    }

    /** Convenience: a CommandBinding that simply forwards to a RelayCommand
     *  / any other ICommand. The created binding marks args.Handled = true
     *  in its Executed pass so the routing walk stops at the first relay
     *  catcher (matches WPF semantics — a CommandBinding that successfully
     *  invokes the command consumes the event). */
    public static Relay(command: RoutedCommand, relay: ICommand): CommandBinding
    {
        return new CommandBinding(command, { relay });
    }

    /** Internal — invoke the Executed side of the binding. CommandManager
     *  calls this; consumers don't. Resolves Relay if no explicit Executed
     *  is set, marks Handled, and returns whether something fired. */
    public _invokeExecuted(sender: Visual, args: ExecutedRoutedEventArgs): boolean
    {
        if (this.Executed !== undefined)
        {
            this.Executed(sender, args);
            return true;
        }
        if (this.Relay !== undefined)
        {
            if (!this.Relay.CanExecute(args.Parameter)) return false;
            this.Relay.Execute(args.Parameter);
            args.Handled = true;
            return true;
        }
        return false;
    }

    /** Internal — invoke the CanExecute side. Same precedence rules. */
    public _invokeCanExecute(sender: Visual, args: CanExecuteRoutedEventArgs): boolean
    {
        if (this.CanExecute !== undefined)
        {
            this.CanExecute(sender, args);
            return true;
        }
        if (this.Relay !== undefined)
        {
            args.CanExecute = this.Relay.CanExecute(args.Parameter);
            args.Handled    = true;
            return true;
        }
        // No CanExecute handler AND no Relay: a binding with only an
        // Executed delegate implicitly treats the command as executable.
        // Matches WPF: a CommandBinding(Cmd, ExecutedOnly) gates fire on
        // "did something handle Executed", not on an explicit gate.
        if (this.Executed !== undefined)
        {
            args.CanExecute = true;
            args.Handled    = true;
            return true;
        }
        return false;
    }
}
