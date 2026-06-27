import type { Element } from '../../visual-engine/element.js';
import { Control } from '../base/control.js';
import type { ICommand } from '../../runtime/command.js';
import {
    _setInputBindingDispatcher,
    hasModifier,
    ModifierKeys,
    type KeyEventArgs,
    type PointerEventArgs,
} from '../../visual-engine/routed-event.js';
import { Key } from '../../visual-engine/input/key.js';
import { RoutedCommand } from './routed-command.js';
import { CommandManager } from './command-manager.js';

// InputBinding — abstract base for the markup-declared gesture → command
// table on a Visual. Subclasses pattern-match a routed input event
// (KeyEventArgs for KeyBinding, PointerEventArgs for MouseBinding) and,
// on a match, invoke their bound Command against the binding's target
// or the inferred dispatch target.
//
// Authoring shape in `.mu`:
//
//   InputBindings {
//       KeyBinding[Key=S, Modifiers=Control, Command=$SaveCommand]
//       KeyBinding[Key=F4, Command=$CloseTabCommand]
//       MouseBinding[Gesture=RightDoubleClick, Command=$InspectCommand]
//   }
//
// Dispatch order — when a routed input event is on the bubble pass,
// InputManager walks the route bottom-up looking for the first
// InputBinding (per-instance OR per-class) whose Matches returns true.
// The matched binding fires its Command and the routed event is marked
// Handled. WPF processes InputBindings on the bubble; tunneling
// counterparts (PreviewInputBindings) aren't shipped here — most use
// cases are "consume on bubble" and tunneling is rare enough to skip
// in v1.

export abstract class InputBinding
{
    /** ICommand invoked on a gesture match. Supports both plain
     *  ICommands (RelayCommand on a VM) and RoutedCommands (which fan
     *  out through CommandBindings). */
    public Command: ICommand | undefined;

    /** Parameter passed to Command.Execute on match. */
    public CommandParameter: unknown;

    /** Optional explicit target for a RoutedCommand. When undefined the
     *  binding's HOST Element is the dispatch target. */
    public CommandTarget: Element | undefined;

    /** Sub-class hook: does the supplied routed-event args satisfy this
     *  binding's gesture? */
    public abstract MatchesKey(args: KeyEventArgs): boolean;
    public abstract MatchesPointer(args: PointerEventArgs): boolean;
}

// KeyBinding — a (Key, Modifiers) → Command mapping. `Key` is the
// WPF-style virtual `Key` enum, compared by identity against
// `KeyEventArgs.Key`. The enum already collapses Shift-case (`Key.S`
// regardless of whether Shift produced 'S' or 's'); authors who require
// Shift add `Modifiers=Shift`. Modifiers match exactly (WPF semantics).
//
// `Key` examples: `Key.S`, `Key.F4`, `Key.Up`, `Key.Return`,
// `Key.Escape`, `Key.Space`.
export class KeyBinding extends InputBinding
{
    /** The virtual key this binding fires on. Compared by identity
     *  against `KeyEventArgs.Key`. */
    public Key: Key;

    /** Required modifier set (exact match, WPF semantics). Default
     *  `ModifierKeys.None`. The pressed modifiers must equal this for the
     *  gesture to fire — `Modifiers=Control` matches Ctrl+key only, not
     *  Ctrl+Shift+key. */
    public Modifiers: ModifierKeys;

    // Human-readable gesture text — what a tooltip / menu writes next to
    // a command bound through this KeyBinding. Computed from Key +
    // Modifiers when not supplied explicitly. The framework looks this
    // up at tooltip render time via
    // `CommandManager.FindShortcutForCommand(cmd, anchor)`, so commands
    // never need to carry their own shortcut metadata.
    private _displayStringOverride: string | undefined;
    public get DisplayString(): string
    {
        return this._displayStringOverride
            ?? formatKeyGesture(this.Key, this.Modifiers);
    }
    public set DisplayString(v: string | undefined)
    {
        this._displayStringOverride = v;
    }

    constructor(
        key:       Key,
        modifiers: ModifierKeys = ModifierKeys.None,
        command?:  ICommand,
        target?:   Element,
        displayString?: string,
    )
    {
        super();
        this.Key       = key;
        this.Modifiers = modifiers;
        if (command       !== undefined) this.Command                = command;
        if (target        !== undefined) this.CommandTarget          = target;
        if (displayString !== undefined) this._displayStringOverride = displayString;
    }

    public override MatchesKey(args: KeyEventArgs): boolean
    {
        // KeyBinding fires on KeyDown only — KeyUp doesn't trigger any
        // gesture in WPF either. Distinguished from MouseBinding by the
        // event Kind on the args.
        if (args.Kind !== 'KeyDown') return false;
        if (args.Key !== this.Key) return false;
        if (!modifiersMatch(args.Modifiers, this.Modifiers)) return false;
        return true;
    }

    public override MatchesPointer(_args: PointerEventArgs): boolean { return false; }
}

// Compose a human-readable gesture string from a key + modifiers.
// Matches the formatting WPF / Windows menu chrome uses: modifier order
// is Ctrl, Alt, Shift, Meta (the WPF accelerator parser's canonical
// order), keys joined with '+'. Single-letter keys are upper-cased.
//
// Exported so KeyGesture (see RoutedCommand.InputGestures advisory list)
// and any future binding subclass can share a single formatter — keeps
// "Ctrl+S" rendered identically wherever it surfaces.
export function formatKeyGesture(key: Key, m: ModifierKeys): string
{
    const parts: string[] = [];
    if (hasModifier(m, ModifierKeys.Control)) parts.push('Ctrl');
    if (hasModifier(m, ModifierKeys.Alt))     parts.push('Alt');
    if (hasModifier(m, ModifierKeys.Shift))   parts.push('Shift');
    if (hasModifier(m, ModifierKeys.Windows)) parts.push('Windows');
    parts.push(keyLabel(key));
    return parts.join('+');
}

// Human-readable token for a single `Key` in a gesture string. Most keys
// render as their enum value; a few get the conventional menu-chrome
// spelling (digit rows, Enter/Backspace, common punctuation OEM keys).
function keyLabel(key: Key): string
{
    if (/^D[0-9]$/.test(key)) return key.slice(1);            // D5 → 5
    switch (key)
    {
        case Key.Return:    return 'Enter';
        case Key.Back:      return 'Backspace';
        case Key.Escape:    return 'Esc';
        case Key.Space:     return 'Space';
        case Key.OemPlus:   return '+';
        case Key.OemMinus:  return '-';
        case Key.OemComma:  return ',';
        case Key.OemPeriod: return '.';
        default:            return key;
    }
}

// Exact modifier match (WPF KeyGesture / MouseAction semantics): the
// pressed modifier set must equal the binding's declared set. `Key=S`
// with no Modifiers fires only when no modifier is held; require
// `Modifiers=Control` for Ctrl+S, `Modifiers=Control,Shift` for
// Ctrl+Shift+S. (The pre-parity build allowed per-modifier "don't
// care"; exact match matches WPF and composes cleanly with the Key
// enum.)
function modifiersMatch(actual: ModifierKeys, expected: ModifierKeys): boolean
{
    return actual === expected;
}

// MouseBinding — gesture-on-pointer mapping. Only a small set of
// gestures is supported in v1: { LeftClick, RightClick, MiddleClick,
// LeftDoubleClick, RightDoubleClick, MiddleDoubleClick }. WPF has more
// (chorded buttons, drag-from), but those add little when authors can
// fall back to PointerDown handlers for the unusual cases.
export enum MouseAction
{
    LeftClick         = 'LeftClick',
    RightClick        = 'RightClick',
    MiddleClick       = 'MiddleClick',
    LeftDoubleClick   = 'LeftDoubleClick',
    RightDoubleClick  = 'RightDoubleClick',
    MiddleDoubleClick = 'MiddleDoubleClick',
}

export class MouseBinding extends InputBinding
{
    /** Pointer gesture (button + click count). Modifiers are an exact
     *  match, same as KeyBinding. */
    public Gesture:   MouseAction;
    public Modifiers: ModifierKeys;

    constructor(
        gesture: MouseAction,
        modifiers: ModifierKeys = ModifierKeys.None,
        command?: ICommand,
        target?: Element,
    )
    {
        super();
        this.Gesture   = gesture;
        this.Modifiers = modifiers;
        if (command !== undefined) this.Command       = command;
        if (target  !== undefined) this.CommandTarget = target;
    }

    public override MatchesKey(_args: KeyEventArgs): boolean { return false; }

    public override MatchesPointer(args: PointerEventArgs): boolean
    {
        // Single-click gestures fire on every PointerDown that matches
        // their button (including the second press of a double-click).
        // Double-click gestures match ONLY when the host adapter has
        // flagged `args.IsDoubleClick` — set on the second PointerDown
        // within the OS-typical 500 ms / 4 px tolerance window
        // (html-target.ts classifyDoubleClick). This is the WPF parity:
        // a binding on LeftClick + a binding on LeftDoubleClick both
        // fire when you double-click, because two MouseDown events
        // physically occur.
        if (args.Kind !== 'PointerDown') return false;
        let buttonOk = false;
        let requireDouble = false;
        switch (this.Gesture)
        {
            case MouseAction.LeftClick:         buttonOk = args.Button === /*Primary*/   0; break;
            case MouseAction.MiddleClick:       buttonOk = args.Button === /*Middle*/    1; break;
            case MouseAction.RightClick:        buttonOk = args.Button === /*Secondary*/ 2; break;
            case MouseAction.LeftDoubleClick:   buttonOk = args.Button === /*Primary*/   0; requireDouble = true; break;
            case MouseAction.MiddleDoubleClick: buttonOk = args.Button === /*Middle*/    1; requireDouble = true; break;
            case MouseAction.RightDoubleClick:  buttonOk = args.Button === /*Secondary*/ 2; requireDouble = true; break;
            default:                             buttonOk = false; break;
        }
        if (!buttonOk) return false;
        if (requireDouble && !args.IsDoubleClick) return false;
        if (!modifiersMatch(args.Modifiers, this.Modifiers)) return false;
        return true;
    }
}

// Try to fire any InputBinding (per-instance then per-class) attached
// to `host` that matches the supplied routed-event args. The routed-
// event walker invokes this on every bubble-pass hop for KeyDown /
// PointerDown — innermost-binding-wins falls out of the walker stopping
// on args.Handled.
//
// Returns true if a binding fired (the args.Handled flag is set on
// match).
export function _tryFireInputBindingsForVisual(
    host: Element,
    args: KeyEventArgs | PointerEventArgs,
): boolean
{
    // Only Control instances carry InputBindings; plain Visuals fall
    // through to the per-class table.
    const instance = host instanceof Control ? host._tryGetInputBindings() : undefined;
    if (instance !== undefined)
    {
        for (const b of instance)
        {
            if (matchesBinding(b, args) && fireBinding(b, host, args)) return true;
        }
    }
    const cls = CommandManager._getClassInputBindingsFor(host);
    for (const b of cls)
    {
        if (matchesBinding(b, args) && fireBinding(b, host, args)) return true;
    }
    return false;
}

// Register the dispatcher with the routed-event module at module load
// so dispatchKey's bubble pass can consult InputBindings without
// importing this file (would cycle through CommandManager → Visual).
_setInputBindingDispatcher((v, args) => { _tryFireInputBindingsForVisual(v, args); });

function matchesBinding(b: InputBinding, args: KeyEventArgs | PointerEventArgs): boolean
{
    if ('Key' in args) return b.MatchesKey(args);
    return b.MatchesPointer(args as PointerEventArgs);
}

function fireBinding(
    b: InputBinding,
    host: Element,
    args: KeyEventArgs | PointerEventArgs,
): boolean
{
    const cmd = b.Command;
    if (cmd === undefined) return false;
    const target = b.CommandTarget ?? host;
    if (cmd instanceof RoutedCommand)
    {
        if (!CommandManager.CanExecute(cmd, b.CommandParameter, target)) return false;
        const fired = CommandManager.Execute(cmd, b.CommandParameter, target);
        if (fired) args.Handled = true;
        return fired;
    }
    if (!cmd.CanExecute(b.CommandParameter)) return false;
    cmd.Execute(b.CommandParameter);
    args.Handled = true;
    return true;
}
