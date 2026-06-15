import type { ICommand } from '../../runtime/command.js';
import type { ModifierKeys } from '../../visual-engine/routed-event.js';

// RoutedCommand — identity-only ICommand. Mirrors WPF's RoutedCommand:
// the command itself contains NO execution logic. Calling Execute
// raises a routed event that walks the visual tree; any ancestor's
// CommandBinding whose Command matches handles the call.
//
// Compared to a plain RelayCommand (which IS the implementation), a
// RoutedCommand is just a NAME + a list of advisory input gestures.
// The same RoutedCommand can be invoked from many places (toolbar
// button, menu item, keyboard shortcut), and the actual behaviour is
// decided by whoever's CommandBinding catches the routed event.
//
// Use cases:
//   * App-wide named commands (`ApplicationCommands.Save` etc.) that
//     different views handle differently.
//   * The mixed pattern from §5.9 of the design notes — a toolbar /
//     context menu fires a RoutedCommand; a control's CommandBinding
//     bridges it to a RelayCommand on the VM.
//
// RoutedCommand DOES implement ICommand so it can be assigned to
// `ICommandSource.Command` (Button.Command etc.) uniformly with plain
// commands. The ICommand-shaped Execute/CanExecute are convenience
// shims that route through CommandManager against the currently-
// focused element (or whatever target was last published via
// `RoutedCommand.SetTargetResolver`). The PRIMARY invocation path is
// `CommandManager.Execute(cmd, parameter, target)` — that's what
// ICommandSource controls use internally.
//
// CanExecuteChanged on a RoutedCommand does NOT fire per-instance:
// executability depends on whichever CommandBinding catches the
// event at invocation time, which can't be known ahead of dispatch.
// Instead, RoutedCommand subscribes its listeners to
// CommandManager.RequerySuggested — a centralized "something
// changed, requery your commands" pulse fired on focus changes
// and on explicit InvalidateRequerySuggested calls.

import { CommandManager } from './command-manager.js';

// One step of a keyboard / mouse gesture — used as advisory metadata
// for menu / toolbar display. WPF stores gestures on the command and
// uses them for `InputGestureText` in MenuItems plus an implicit
// CommandManager-driven keybinding resolution. Mural treats gestures
// as display-only on RoutedCommand; the keybinding itself is declared
// via `KeyBinding` in `Visual.InputBindings`.
export interface InputGesture
{
    /** Human-readable gesture string for menu chrome, e.g. "Ctrl+S",
     *  "Right-click". Whatever a MenuItem.InputGestureText would
     *  render. Pure display — does not influence dispatch. */
    DisplayString: string;
}

// Convenience constructor for a KeyGesture-style advisory gesture.
// Building one keeps the call-site readable when declaring a command's
// default gesture; the matching real keybinding lives elsewhere
// (Visual.InputBindings or CommandManager.RegisterClassInputBinding).
export class KeyGesture implements InputGesture
{
    public readonly Key:       string;
    public readonly Modifiers: ModifierKeys;
    public readonly DisplayString: string;

    constructor(key: string, modifiers: ModifierKeys, display?: string)
    {
        this.Key           = key;
        this.Modifiers     = modifiers;
        this.DisplayString = display ?? formatKeyGesture(key, modifiers);
    }
}

function formatKeyGesture(key: string, m: ModifierKeys): string
{
    const parts: string[] = [];
    if (m.Control) parts.push('Ctrl');
    if (m.Alt)     parts.push('Alt');
    if (m.Shift)   parts.push('Shift');
    if (m.Meta)    parts.push('Meta');
    parts.push(key);
    return parts.join('+');
}

export class RoutedCommand implements ICommand
{
    /** Stable identifier for the command. Same shape as WPF's RoutedCommand.Name
     *  — usually matches the static-field name (e.g. 'Save'). Used for debug
     *  logging and for InputBindings that want to match by name in markup. */
    public readonly Name: string;

    /** The static-class owner (e.g. `ApplicationCommands`). Mirrors WPF's
     *  RoutedCommand.OwnerType; useful for debugging and for filtering when
     *  multiple commands share a Name. Stored as a Function reference, not
     *  a string — matches the "no string type proxies" convention. */
    public readonly OwnerType: Function;

    /** Advisory keyboard / mouse gestures associated with the command. Pure
     *  display data: MenuItem and ribbon controls read `InputGestures[0]` to
     *  render "Ctrl+S" next to the command name. The framework does NOT
     *  auto-install these as keybindings — author code declares the matching
     *  KeyBinding in Visual.InputBindings (or via
     *  CommandManager.RegisterClassInputBinding for a control-class default). */
    public readonly InputGestures: readonly InputGesture[];

    private readonly _listeners: Set<() => void> = new Set();
    private          _subscribedToRequerySuggested = false;
    private readonly _onRequerySuggested = (): void => { this._notify(); };

    constructor(name: string, ownerType: Function, gestures?: readonly InputGesture[])
    {
        this.Name          = name;
        this.OwnerType     = ownerType;
        this.InputGestures = gestures ?? [];
    }

    // ── ICommand surface ──────────────────────────────────────────────
    //
    // The single-arg ICommand contract makes RoutedCommand assignable to
    // any `ICommandSource.Command` slot. The default behaviour when
    // invoked through this surface (rather than the explicit
    // CommandManager.Execute(cmd, p, target)) is to dispatch against the
    // currently-focused Visual reported by the active CommandManager.
    // ICommandSource controls (Button etc.) bypass this and pass their
    // own target explicitly — they detect `instanceof RoutedCommand`
    // and route via CommandManager directly.

    public Execute(parameter?: unknown): void
    {
        const target = CommandManager.GetFocusedVisualForRouting();
        if (target === undefined) return;
        CommandManager.Execute(this, parameter, target);
    }

    public CanExecute(parameter?: unknown): boolean
    {
        const target = CommandManager.GetFocusedVisualForRouting();
        if (target === undefined) return false;
        return CommandManager.CanExecute(this, parameter, target);
    }

    // Subscribers piggyback on CommandManager.RequerySuggested — the
    // centralized "executability MAY have changed" pulse. Per-instance
    // CanExecuteChanged isn't fired by the command itself; whichever
    // CommandBinding catches the event at invocation time decides
    // executability, and the set of catchers depends on focus / tree
    // composition. RequerySuggested is the closest analogue.
    public AddCanExecuteChangedListener(listener: () => void): void
    {
        this._listeners.add(listener);
        if (!this._subscribedToRequerySuggested)
        {
            CommandManager.SubscribeRequerySuggested(this._onRequerySuggested);
            this._subscribedToRequerySuggested = true;
        }
    }

    public RemoveCanExecuteChangedListener(listener: () => void): void
    {
        this._listeners.delete(listener);
        if (this._listeners.size === 0 && this._subscribedToRequerySuggested)
        {
            CommandManager.UnsubscribeRequerySuggested(this._onRequerySuggested);
            this._subscribedToRequerySuggested = false;
        }
    }

    private _notify(): void
    {
        const snap = [...this._listeners];
        for (const cb of snap) cb();
    }
}
