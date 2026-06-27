// WPF-parity input enumerations that aren't already covered by the
// routed-event core (PointerButton / WheelDeltaMode / RoutingStrategy
// live in routed-event.ts; ModifierKeys is there too as a flags enum).
//
// Flags enums (KeyStates) are numeric so bitwise composition works;
// the plain named sets are string enums per the repo's
// enums-over-string-unions rule (PascalCase members, stable string
// values for debuggability / serialization).

import { PointerButton } from '../routed-event.js';

// WPF System.Windows.Input.MouseButton. Semantic button identity for
// the Mouse façade and MouseButtonEventArgs. Distinct from the pointer
// layer's numeric `PointerButton` (which mirrors DOM PointerEvent.button)
// — `mouseButtonFromPointer` bridges the two.
export enum MouseButton
{
    Left     = 'Left',
    Middle   = 'Middle',
    Right    = 'Right',
    XButton1 = 'XButton1',
    XButton2 = 'XButton2',
}

// WPF System.Windows.Input.MouseButtonState.
export enum MouseButtonState
{
    Released = 'Released',
    Pressed  = 'Pressed',
}

// WPF System.Windows.Input.KeyStates — [Flags]. Numeric so a key can be
// simultaneously Down and Toggled (e.g. CapsLock held while latched).
export enum KeyStates
{
    None    = 0,
    Down    = 1 << 0,
    Toggled = 1 << 1,
}

// WPF System.Windows.Input.CaptureMode — scope of a pointer/mouse
// capture. `Element` routes input only to the captured element;
// `SubTree` also routes to its visual subtree (hit-tested normally but
// constrained to the captured root); `None` releases capture.
export enum CaptureMode
{
    None    = 'None',
    Element = 'Element',
    SubTree = 'SubTree',
}

// WPF System.Windows.Input.FocusNavigationDirection — the logical
// direction a TraversalRequest moves focus.
export enum FocusNavigationDirection
{
    Next     = 'Next',
    Previous = 'Previous',
    First    = 'First',
    Last     = 'Last',
    Left     = 'Left',
    Right    = 'Right',
    Up       = 'Up',
    Down     = 'Down',
}

// WPF System.Windows.Input.KeyboardNavigationMode — how Tab / arrow
// traversal behaves within a navigation container.
export enum KeyboardNavigationMode
{
    Continue  = 'Continue',
    Once      = 'Once',
    Cycle     = 'Cycle',
    None      = 'None',
    Contained = 'Contained',
    Local     = 'Local',
}

// Bridge the pointer-layer numeric button to the semantic MouseButton.
// Returns undefined for PointerButton.None (no button — move / hover).
export function mouseButtonFromPointer(b: PointerButton): MouseButton | undefined
{
    switch (b)
    {
        case PointerButton.Primary:   return MouseButton.Left;
        case PointerButton.Middle:    return MouseButton.Middle;
        case PointerButton.Secondary: return MouseButton.Right;
        case PointerButton.X1:        return MouseButton.XButton1;
        case PointerButton.X2:        return MouseButton.XButton2;
        default:                      return undefined;
    }
}
