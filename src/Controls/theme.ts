import { Color } from '../runtime/index.js';
import { SolidColorBrush } from '../visual-engine/index.js';

// Default Material UI palette used by the Controls library's built-in
// ControlTemplates. Centralised here so the same brush instance is
// reused across every control that needs it — saves re-allocating a
// SolidColorBrush on every template apply, and gives the codebase one
// place to retune the visual identity.
//
// The accompanying `.template.mu` files embed the matching hex literals
// inline (template authors prefer self-contained markup over reaching
// into a shared module). When a template needs the same colour at
// runtime — typically for a hover or pressed swap driven by the
// templated parent's IsMouseOver / IsPressed listeners — the code-side
// constructor imports from here so both sides agree on identity.
export const Theme = {
    // ── Surfaces ────────────────────────────────────────────────────
    paper:           new SolidColorBrush(Color.FromHex('#ffffff')),
    hairline:        new SolidColorBrush(Color.FromHex('#e2e8f0')),
    nav:             new SolidColorBrush(Color.FromHex('#f8fafc')),
    navHover:        new SolidColorBrush(Color.FromHex('#e2e8f0')),

    // ── Ink ─────────────────────────────────────────────────────────
    ink:             new SolidColorBrush(Color.FromHex('#1f2937')),
    hint:            new SolidColorBrush(Color.FromHex('#6b7280')),
    placeholder:     new SolidColorBrush(Color.FromHex('#9e9e9e')),
    fieldText:       new SolidColorBrush(Color.FromHex('#212121')),

    // ── Primary (MUI Contained Button) ──────────────────────────────
    primary:         new SolidColorBrush(Color.FromHex('#1976d2')),
    primaryHover:    new SolidColorBrush(Color.FromHex('#1565c0')),
    primaryPress:    new SolidColorBrush(Color.FromHex('#0d47a1')),
    primaryInk:      new SolidColorBrush(Color.FromHex('#ffffff')),

    // ── Form field (MUI Outlined) ───────────────────────────────────
    fieldBg:         new SolidColorBrush(Color.FromHex('#ffffff')),
    fieldBorder:     new SolidColorBrush(Color.FromHex('#c4c4c4')),
    fieldBorderOpen: new SolidColorBrush(Color.FromHex('#1976d2')),

    // ── Popup / dropdown ────────────────────────────────────────────
    popupBg:         new SolidColorBrush(Color.FromHex('#ffffff')),
    popupBorder:     new SolidColorBrush(Color.FromHex('#e0e0e0')),
    itemHoverBg:     new SolidColorBrush(Color.FromHex('#f5f5f5')),
    itemSelectedBg:  new SolidColorBrush(Color.FromHex('#e3f2fd')),

    // ── Scrollbar ───────────────────────────────────────────────────
    scrollTrack:     new SolidColorBrush(Color.FromHex('#f1f5f9')),
    scrollThumb:     new SolidColorBrush(Color.FromHex('#cbd5e1')),
    scrollThumbHover:new SolidColorBrush(Color.FromHex('#94a3b8')),
    scrollThumbDrag: new SolidColorBrush(Color.FromHex('#64748b')),

    // ── Scrim ───────────────────────────────────────────────────────
    scrim:           new SolidColorBrush(Color.FromHex('#00000066')),
} as const;
