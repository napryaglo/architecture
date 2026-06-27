// WPF-parity keyboard façade. `Keyboard` is the static entry point
// (System.Windows.Input.Keyboard); `KeyboardDevice` is the live-state
// object it reads (System.Windows.Input.KeyboardDevice).
//
// The device OWNS the live keyboard state — the active modifier set, the
// set of currently-down keys (for IsKeyDown / GetKeyStates), and the
// focused element. The InputManager PUSHES updates on every key event
// and focus change; it's the only writer.

import type { Element } from '../element.js';
import { ModifierKeys } from '../routed-event.js';
import { Key } from './key.js';
import { KeyStates } from './input-enums.js';

export class KeyboardDevice
{
    private _modifiers = ModifierKeys.None;
    private readonly _down = new Set<Key>();
    private _focused: Element | undefined;

    public get Modifiers():      ModifierKeys        { return this._modifiers; }
    public get FocusedElement(): Element | undefined { return this._focused; }

    public IsKeyDown(key: Key): boolean { return this._down.has(key); }
    public IsKeyUp(key: Key):   boolean { return !this._down.has(key); }

    // WPF KeyStates is a [Flags] of Down | Toggled. mural doesn't track
    // lock-key toggle latches yet, so only the Down bit is reported.
    public GetKeyStates(key: Key): KeyStates
    {
        return this._down.has(key) ? KeyStates.Down : KeyStates.None;
    }

    // Move focus to `element` (Keyboard.Focus). Routes through the
    // element's own Focus() bridge, which reaches the InputManager that
    // owns its target. Returns the element now focused.
    public Focus(element: Element | undefined): Element | undefined
    {
        if (element === undefined)
        {
            this._focused?.Blur();
            return this._focused;
        }
        element.Focus();
        return this._focused;
    }

    // ── @internal — InputManager push surface ───────────────────────

    /** @internal */ public _setModifiers(m: ModifierKeys): void { this._modifiers = m; }

    /** @internal — record a key going down (KeyDown) or up (KeyUp). */
    public _setKeyState(key: Key, down: boolean): void
    {
        if (down) this._down.add(key);
        else      this._down.delete(key);
    }

    /** @internal */ public _setFocused(el: Element | undefined): void { this._focused = el; }
}

// Static façade — WPF System.Windows.Input.Keyboard.
export class Keyboard
{
    public static readonly PrimaryDevice = new KeyboardDevice();

    public static get Modifiers():      ModifierKeys        { return Keyboard.PrimaryDevice.Modifiers; }
    public static get FocusedElement(): Element | undefined { return Keyboard.PrimaryDevice.FocusedElement; }

    public static IsKeyDown(key: Key):    boolean   { return Keyboard.PrimaryDevice.IsKeyDown(key); }
    public static IsKeyUp(key: Key):      boolean   { return Keyboard.PrimaryDevice.IsKeyUp(key); }
    public static GetKeyStates(key: Key): KeyStates { return Keyboard.PrimaryDevice.GetKeyStates(key); }

    public static Focus(element: Element | undefined): Element | undefined
    {
        return Keyboard.PrimaryDevice.Focus(element);
    }
}
