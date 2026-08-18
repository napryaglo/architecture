// Color modifiers — the built-in palette of color transforms usable on
// the `<<` converter pipe in `.mu`:
//
//     Fill:   #0d47a1 << Lighten(0.5)            // literal → folded once
//     Stroke: @PrimaryColor << Darken(0.2)        // resource → constant
//     Glow:   $accent << Lighten(0.3) << Alpha(0.6)  // binding → reactive
//     Tint:   @Surface << Mix(#ff0000, 0.25)      // blend toward another color
//
// Each modifier is a FACTORY: it takes the DSL arguments and returns a
// `ValueConverter`, which is exactly what the `<<` pipe consumes. That's
// the whole "registration mechanism": a modifier is just an exported
// converter-factory function. Built-ins are listed in the compiler's
// symbol table so `.mu` can name them unqualified; a user-defined
// modifier is authored the same way and pulled in with an `import` clause
// in the `.mu` file, identical to any custom converter.
//
// Modifiers operate in the Color domain. `colorOp` adapts that to the
// pipe, which on a brush property (Fill/Foreground/Stroke/Fill)
// carries a SolidColorBrush: it unwraps to the Color, applies the
// transform, and rewraps so the target still receives a brush. A
// non-solid brush (gradient/image/pattern) has no single color to modify
// and raises a clear error rather than silently dropping to a default.

import type { ValueConverter } from './binding.js';
import { Color } from '../../visual-engine/primitives.js';
import { Brush, SolidColorBrush } from '../../visual-engine/drawing/brush.js';

// Extract the Color a modifier should operate on. Accepts a bare Color or
// a SolidColorBrush (the shape a Fill/Foreground binding produces). Any
// other brush kind has no single representative color — surface that
// rather than guessing.
function toColor(value: unknown): Color
{
    if (value instanceof Color) return value;
    if (value instanceof SolidColorBrush) return value.Color;
    if (value instanceof Brush)
    {
        throw new Error(
            `color modifier: '${value.constructor.name}' has no single color to ` +
            `modify — color modifiers apply to solid colors only`);
    }
    throw new Error(
        `color modifier: expected a Color or SolidColorBrush, got ${typeof value}`);
}

// Wrap a Color→Color transform as a ValueConverter, preserving the
// input's shape: a brush in → a (solid) brush out, a bare Color in → a
// Color out. One-way only — there's no meaningful inverse of "lighten".
function colorOp(fn: (c: Color) => Color): ValueConverter
{
    return {
        convert(value: unknown): unknown
        {
            const out = fn(toColor(value));
            return value instanceof Brush ? new SolidColorBrush(out) : out;
        },
    };
}

// `amount` ∈ 0..1. Lighten(1) → white, Darken(1) → black; the source
// alpha is preserved (tinting shouldn't change opacity).
export const Lighten = (amount: number): ValueConverter =>
    colorOp(c => Color.Lerp(c, Color.White, amount).WithAlpha(c.A));

export const Darken = (amount: number): ValueConverter =>
    colorOp(c => Color.Lerp(c, Color.Black, amount).WithAlpha(c.A));

// Blend `amount` of the way from the source toward `other` (all channels,
// alpha included). `other` may be a Color or a SolidColorBrush — so
// `Mix(#ff0000, 0.25)` works even though a `#` literal compiles to a brush.
export const Mix = (other: Color | SolidColorBrush, amount: number): ValueConverter =>
    colorOp(c => Color.Lerp(c, toColor(other), amount));

// Shift HSL saturation by `amount` (∈ ~0..1); Saturate intensifies,
// Desaturate mutes. Saturation clamps to 0..1.
export const Saturate = (amount: number): ValueConverter =>
    colorOp(c => c.AdjustSaturation(amount));

export const Desaturate = (amount: number): ValueConverter =>
    colorOp(c => c.AdjustSaturation(-amount));

// Set the alpha channel. A fractional `alpha` (≤ 1) is read as 0..1 and
// scaled to 0..255; a value > 1 is taken as a raw 0..255 channel.
export const Alpha = (alpha: number): ValueConverter =>
    colorOp(c => c.WithAlpha(alpha <= 1 ? alpha * 255 : alpha));
