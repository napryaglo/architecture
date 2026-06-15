import type { Visual } from '../../visual-engine/visual.js';
import { Control } from '../control.js';
import type { ICommand } from '../../runtime/command.js';
import {
    _setInputBindingDispatcher,
    type KeyEventArgs,
    type PointerEventArgs,
    type ModifierKeys,
} from '../../visual-engine/routed-event.js';
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
     *  binding's HOST Visual is the dispatch target. */
    public CommandTarget: Visual | undefined;

    /** Sub-class hook: does the supplied routed-event args satisfy this
     *  binding's gesture? */
    public abstract MatchesKey(args: KeyEventArgs): boolean;
    public abstract MatchesPointer(args: PointerEventArgs): boolean;
}

// KeyBinding — a (Key, Modifiers) → Command mapping. `Key` matches
// against DOM KeyboardEvent.key — the LOGICAL character the press
// produces (case-insensitive for ASCII letters). Modifiers are the four
// standard ones; an undefined slot means "don't care" while a defined
// boolean is an exact match requirement.
//
// `Key` examples: 'S', 's', 'F4', 'ArrowUp', 'Enter', 'Escape', ' '
// (space). Single-letter keys are compared case-insensitively so
// declaring `Key=S` matches whether or not Shift is also active —
// authors who care about the Shift case put `Shift=true` in Modifiers.
export class KeyBinding extends InputBinding
{
    /** The logical key. Compared against KeyEventArgs.Key. Single-char
     *  alphabetics are matched case-insensitively. */
    public Key: string;

    /** Modifier requirements. An omitted modifier (undefined) is "don't
     *  care"; a defined boolean is an exact-match requirement (Shift =
     *  true means Shift MUST be down; Shift = false means Shift MUST
     *  NOT be down). The four-modifier `ModifierKeys` shape from
     *  routed-event.ts is the convenient form when all four are
     *  specified; the binding stores the partial shape internally so
     *  "don't care" stays expressible. */
    public Modifiers: Partial<ModifierKeys>;

    constructor(key: string, modifiers: Partial<ModifierKeys>, command?: ICommand, target?: Visual)
    {
        super();
        this.Key       = key;
        this.Modifiers = modifiers;
        if (command !== undefined) this.Command       = command;
        if (target  !== undefined) this.CommandTarget = target;
    }

    public override MatchesKey(args: KeyEventArgs): boolean
    {
        // KeyBinding fires on KeyDown only — KeyUp doesn't trigger any
        // gesture in WPF either. Distinguished from MouseBinding by the
        // event Kind on the args.
        if (args.Kind !== 'KeyDown') return false;
        if (!keysEqual(args.Key, this.Key)) return false;
        if (!modifiersMatch(args.Modifiers, this.Modifiers)) return false;
        return true;
    }

    public override MatchesPointer(_args: PointerEventArgs): boolean { return false; }
}

function keysEqual(a: string, b: string): boolean
{
    if (a === b) return true;
    // ASCII case-insensitive match for single-character keys. Multi-
    // character key names ('ArrowUp', 'F4', …) must match exactly.
    if (a.length === 1 && b.length === 1)
    {
        return a.toLowerCase() === b.toLowerCase();
    }
    return false;
}

function modifiersMatch(actual: ModifierKeys, expected: Partial<ModifierKeys>): boolean
{
    if (expected.Shift   !== undefined && expected.Shift   !== actual.Shift)   return false;
    if (expected.Control !== undefined && expected.Control !== actual.Control) return false;
    if (expected.Alt     !== undefined && expected.Alt     !== actual.Alt)     return false;
    if (expected.Meta    !== undefined && expected.Meta    !== actual.Meta)    return false;
    return true;
}

// MouseBinding — gesture-on-pointer mapping. Only a small set of
// gestures is supported in v1: { LeftClick, RightClick, MiddleClick,
// LeftDoubleClick, RightDoubleClick, MiddleDoubleClick }. WPF has more
// (chorded buttons, drag-from), but those add little when authors can
// fall back to PointerDown handlers for the unusual cases.
export enum MouseGesture
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
    /** Pointer gesture (button + click count). Modifier overlay is the
     *  same partial-match shape as KeyBinding. */
    public Gesture:   MouseGesture;
    public Modifiers: Partial<ModifierKeys>;

    constructor(
        gesture: MouseGesture,
        modifiers: Partial<ModifierKeys> = {},
        command?: ICommand,
        target?: Visual,
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
            case MouseGesture.LeftClick:         buttonOk = args.Button === /*Primary*/   0; break;
            case MouseGesture.MiddleClick:       buttonOk = args.Button === /*Middle*/    1; break;
            case MouseGesture.RightClick:        buttonOk = args.Button === /*Secondary*/ 2; break;
            case MouseGesture.LeftDoubleClick:   buttonOk = args.Button === /*Primary*/   0; requireDouble = true; break;
            case MouseGesture.MiddleDoubleClick: buttonOk = args.Button === /*Middle*/    1; requireDouble = true; break;
            case MouseGesture.RightDoubleClick:  buttonOk = args.Button === /*Secondary*/ 2; requireDouble = true; break;
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
    host: Visual,
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
    host: Visual,
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
