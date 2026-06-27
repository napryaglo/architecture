// WPF-parity `Key` enum and the DOM → Key mapping.
//
// WPF's `System.Windows.Input.Key` is a virtual-key enumeration. mural
// runs on the browser, whose `KeyboardEvent` exposes two relevant
// fields:
//
//   * `code` — the PHYSICAL key, layout-independent ('KeyA', 'Digit1',
//     'Numpad1', 'ArrowDown', 'ShiftLeft', 'Semicolon', 'Backquote').
//     This is the closest analogue to a Windows virtual key, so it's
//     the primary mapping source — `Ctrl+Z` lands on the physical Z
//     regardless of the active layout, matching WPF.
//   * `key` — the LOGICAL character the press produces ('a', 'A',
//     'Enter', 'ArrowDown', 'Shift'). Used as a fallback for keys with
//     no stable `code` and to recover the typed text.
//
// `KeyEventArgs.Key` is this enum; the raw browser strings remain
// available as `KeyEventArgs.KeyText` (the logical `key`) and
// `KeyEventArgs.Code` (the physical `code`) for layout-sensitive or
// text-entry handlers.
//
// Member names + string values mirror the WPF `Key` enum so markup
// (`KeyBinding[Key=Z]`) and serialized gestures stay WPF-readable.
// `Enter` / `Return`, `Escape` / `Esc`, `PageUp` / `Prior`, etc. follow
// WPF's primary spelling (Return, Escape, PageUp/PageDown, CapsLock).
export enum Key
{
    None = 'None',

    // Editing / whitespace.
    Cancel    = 'Cancel',
    Back      = 'Back',        // Backspace
    Tab       = 'Tab',
    Clear     = 'Clear',
    Return    = 'Return',      // Enter
    Pause     = 'Pause',
    CapsLock  = 'CapsLock',
    Escape    = 'Escape',
    Space     = 'Space',
    PageUp    = 'PageUp',
    PageDown  = 'PageDown',
    End       = 'End',
    Home      = 'Home',
    Left      = 'Left',
    Up        = 'Up',
    Right     = 'Right',
    Down      = 'Down',
    Select    = 'Select',
    Print     = 'Print',
    Execute   = 'Execute',
    PrintScreen = 'PrintScreen',
    Insert    = 'Insert',
    Delete    = 'Delete',
    Help      = 'Help',

    // Top-row digits.
    D0 = 'D0', D1 = 'D1', D2 = 'D2', D3 = 'D3', D4 = 'D4',
    D5 = 'D5', D6 = 'D6', D7 = 'D7', D8 = 'D8', D9 = 'D9',

    // Letters.
    A = 'A', B = 'B', C = 'C', D = 'D', E = 'E', F = 'F', G = 'G',
    H = 'H', I = 'I', J = 'J', K = 'K', L = 'L', M = 'M', N = 'N',
    O = 'O', P = 'P', Q = 'Q', R = 'R', S = 'S', T = 'T', U = 'U',
    V = 'V', W = 'W', X = 'X', Y = 'Y', Z = 'Z',

    // OS / context keys.
    LWin = 'LWin',
    RWin = 'RWin',
    Apps = 'Apps',
    Sleep = 'Sleep',

    // Numeric keypad.
    NumPad0 = 'NumPad0', NumPad1 = 'NumPad1', NumPad2 = 'NumPad2',
    NumPad3 = 'NumPad3', NumPad4 = 'NumPad4', NumPad5 = 'NumPad5',
    NumPad6 = 'NumPad6', NumPad7 = 'NumPad7', NumPad8 = 'NumPad8',
    NumPad9 = 'NumPad9',
    Multiply  = 'Multiply',
    Add       = 'Add',
    Separator = 'Separator',
    Subtract  = 'Subtract',
    Decimal   = 'Decimal',
    Divide    = 'Divide',

    // Function keys.
    F1 = 'F1', F2 = 'F2', F3 = 'F3', F4 = 'F4', F5 = 'F5', F6 = 'F6',
    F7 = 'F7', F8 = 'F8', F9 = 'F9', F10 = 'F10', F11 = 'F11', F12 = 'F12',
    F13 = 'F13', F14 = 'F14', F15 = 'F15', F16 = 'F16', F17 = 'F17',
    F18 = 'F18', F19 = 'F19', F20 = 'F20', F21 = 'F21', F22 = 'F22',
    F23 = 'F23', F24 = 'F24',

    // Locks.
    NumLock    = 'NumLock',
    Scroll     = 'Scroll',      // ScrollLock

    // Modifier keys (left / right distinguished, matching WPF).
    LeftShift  = 'LeftShift',
    RightShift = 'RightShift',
    LeftCtrl   = 'LeftCtrl',
    RightCtrl  = 'RightCtrl',
    LeftAlt    = 'LeftAlt',
    RightAlt   = 'RightAlt',

    // Browser / media keys (WPF parity subset).
    BrowserBack       = 'BrowserBack',
    BrowserForward    = 'BrowserForward',
    BrowserRefresh    = 'BrowserRefresh',
    BrowserStop       = 'BrowserStop',
    BrowserSearch     = 'BrowserSearch',
    BrowserFavorites  = 'BrowserFavorites',
    BrowserHome       = 'BrowserHome',
    VolumeMute        = 'VolumeMute',
    VolumeDown        = 'VolumeDown',
    VolumeUp          = 'VolumeUp',
    MediaNextTrack    = 'MediaNextTrack',
    MediaPreviousTrack = 'MediaPreviousTrack',
    MediaStop         = 'MediaStop',
    MediaPlayPause    = 'MediaPlayPause',

    // OEM / punctuation (US layout meanings, matching WPF's OEM names).
    Oem1       = 'Oem1',       // ;:
    OemPlus    = 'OemPlus',    // =+
    OemComma   = 'OemComma',   // ,<
    OemMinus   = 'OemMinus',   // -_
    OemPeriod  = 'OemPeriod',  // .>
    Oem2       = 'Oem2',       // /?
    Oem3       = 'Oem3',       // `~
    Oem4       = 'Oem4',       // [{
    Oem5       = 'Oem5',       // \|
    Oem6       = 'Oem6',       // ]}
    Oem7       = 'Oem7',       // '"

    // Unrecognised physical key — carries the press through so handlers
    // can still consult `KeyEventArgs.KeyText` / `.Code`.
    Unknown = 'Unknown',
}

// Physical-key (`KeyboardEvent.code`) → Key. Primary mapping source.
const CODE_TO_KEY: Readonly<Record<string, Key>> = {
    // Letters.
    KeyA: Key.A, KeyB: Key.B, KeyC: Key.C, KeyD: Key.D, KeyE: Key.E,
    KeyF: Key.F, KeyG: Key.G, KeyH: Key.H, KeyI: Key.I, KeyJ: Key.J,
    KeyK: Key.K, KeyL: Key.L, KeyM: Key.M, KeyN: Key.N, KeyO: Key.O,
    KeyP: Key.P, KeyQ: Key.Q, KeyR: Key.R, KeyS: Key.S, KeyT: Key.T,
    KeyU: Key.U, KeyV: Key.V, KeyW: Key.W, KeyX: Key.X, KeyY: Key.Y,
    KeyZ: Key.Z,

    // Top-row digits.
    Digit0: Key.D0, Digit1: Key.D1, Digit2: Key.D2, Digit3: Key.D3,
    Digit4: Key.D4, Digit5: Key.D5, Digit6: Key.D6, Digit7: Key.D7,
    Digit8: Key.D8, Digit9: Key.D9,

    // Numpad.
    Numpad0: Key.NumPad0, Numpad1: Key.NumPad1, Numpad2: Key.NumPad2,
    Numpad3: Key.NumPad3, Numpad4: Key.NumPad4, Numpad5: Key.NumPad5,
    Numpad6: Key.NumPad6, Numpad7: Key.NumPad7, Numpad8: Key.NumPad8,
    Numpad9: Key.NumPad9,
    NumpadMultiply: Key.Multiply, NumpadAdd: Key.Add,
    NumpadSubtract: Key.Subtract, NumpadDecimal: Key.Decimal,
    NumpadDivide: Key.Divide, NumpadEnter: Key.Return,
    NumLock: Key.NumLock,

    // Function keys.
    F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5,
    F6: Key.F6, F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10,
    F11: Key.F11, F12: Key.F12, F13: Key.F13, F14: Key.F14, F15: Key.F15,
    F16: Key.F16, F17: Key.F17, F18: Key.F18, F19: Key.F19, F20: Key.F20,
    F21: Key.F21, F22: Key.F22, F23: Key.F23, F24: Key.F24,

    // Editing / whitespace / navigation.
    Backspace: Key.Back, Tab: Key.Tab, Enter: Key.Return, Space: Key.Space,
    Escape: Key.Escape, Delete: Key.Delete, Insert: Key.Insert,
    Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown,
    ArrowLeft: Key.Left, ArrowUp: Key.Up, ArrowRight: Key.Right,
    ArrowDown: Key.Down, CapsLock: Key.CapsLock, ScrollLock: Key.Scroll,
    Pause: Key.Pause, PrintScreen: Key.PrintScreen, ContextMenu: Key.Apps,
    Help: Key.Help,

    // Modifiers (left / right).
    ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
    ControlLeft: Key.LeftCtrl, ControlRight: Key.RightCtrl,
    AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
    MetaLeft: Key.LWin, MetaRight: Key.RWin,

    // OEM / punctuation (US).
    Semicolon: Key.Oem1, Equal: Key.OemPlus, Comma: Key.OemComma,
    Minus: Key.OemMinus, Period: Key.OemPeriod, Slash: Key.Oem2,
    Backquote: Key.Oem3, BracketLeft: Key.Oem4, Backslash: Key.Oem5,
    BracketRight: Key.Oem6, Quote: Key.Oem7,
};

// Logical-key (`KeyboardEvent.key`) → Key fallback for the handful of
// presses whose `code` is empty or unstable (IME, virtual keyboards,
// some media keys). Only entries that aren't already unambiguous via
// `code` are listed.
const KEY_TO_KEY: Readonly<Record<string, Key>> = {
    Enter: Key.Return, Tab: Key.Tab, Escape: Key.Escape, ' ': Key.Space,
    Backspace: Key.Back, Delete: Key.Delete, Insert: Key.Insert,
    ArrowLeft: Key.Left, ArrowUp: Key.Up, ArrowRight: Key.Right,
    ArrowDown: Key.Down, Home: Key.Home, End: Key.End,
    PageUp: Key.PageUp, PageDown: Key.PageDown,
    Shift: Key.LeftShift, Control: Key.LeftCtrl, Alt: Key.LeftAlt,
    Meta: Key.LWin, ContextMenu: Key.Apps,
};

// Resolve a DOM KeyboardEvent (code, key) pair to a `Key`. Prefers the
// physical `code`; falls back to the logical `key`; finally maps a
// single typed character to its letter/digit Key, and otherwise returns
// `Key.Unknown` (the raw strings remain on the args for recovery).
export function keyFromDom(code: string, key: string): Key
{
    const byCode = CODE_TO_KEY[code];
    if (byCode !== undefined) return byCode;

    const byKey = KEY_TO_KEY[key];
    if (byKey !== undefined) return byKey;

    // Single printable character not covered by `code` (rare — IME /
    // synthetic events). Upper-case ASCII letter / digit → its Key.
    if (key.length === 1)
    {
        const c = key.toUpperCase();
        if (c >= 'A' && c <= 'Z') return Key[c as keyof typeof Key] as Key;
        if (c >= '0' && c <= '9') return (Key[('D' + c) as keyof typeof Key] as Key) ?? Key.Unknown;
    }
    return Key.Unknown;
}
