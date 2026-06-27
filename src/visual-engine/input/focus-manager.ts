// WPF-parity FocusManager façade (System.Windows.Input.FocusManager).
//
// WPF's FocusManager tracks a "logical focus" per focus scope (the
// element that regains focus when its scope is re-entered) distinct from
// the single keyboard focus. mural ships the common scope-less subset
// here: the focused element is the keyboard-focused element. Per-scope
// logical focus + the `IsFocusScope` attached property arrive with
// KeyboardNavigation (Phase 4); the `scope` parameter is accepted now
// for call-site compatibility but treated as the global scope.

import type { Element } from '../element.js';
import { Keyboard } from './keyboard.js';

export class FocusManager
{
    // The currently keyboard-focused element. The optional `scope` is
    // accepted for WPF call-site shape; scoped logical focus is a Phase 4
    // follow-up (returns the global focus today).
    public static GetFocusedElement(_scope?: Element): Element | undefined
    {
        return Keyboard.FocusedElement;
    }

    // Move focus to `element` (or clear it when undefined). Routes through
    // Keyboard.Focus → the element's Focus() bridge → the owning
    // InputManager.
    public static SetFocusedElement(elementOrScope?: Element, element?: Element): Element | undefined
    {
        // WPF's signature is SetFocusedElement(scope, element). Support
        // both the two-arg scoped form and a one-arg convenience form
        // (SetFocusedElement(element)) since scopes are global today.
        const target = element ?? elementOrScope;
        return Keyboard.Focus(target);
    }
}
