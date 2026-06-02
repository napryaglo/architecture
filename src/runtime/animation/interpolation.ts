import { Color, Thickness } from '../primitives.js';

// Per-type interpolators used by the per-type Animation subclasses.
// Each returns a fresh instance — never mutates From / To. Colour and
// Thickness are immutable in this codebase but the same convention makes
// it safe to swap in mutable types later without surprise aliasing.
//
// Channel-by-channel arithmetic uses the raw stored fields. Colour
// channels stay floating-point during interpolation (Color's constructor
// accepts floats); the final round to integer happens at ToCss().

export type Interpolator<T> = (from: T, to: T, t: number) => T;

export const interpolateNumber: Interpolator<number> = (a, b, t) => a + (b - a) * t;

export const interpolateColor: Interpolator<Color> = (a, b, t) => new Color(
    a.R + (b.R - a.R) * t,
    a.G + (b.G - a.G) * t,
    a.B + (b.B - a.B) * t,
    a.A + (b.A - a.A) * t,
);

export const interpolateThickness: Interpolator<Thickness> = (a, b, t) => new Thickness(
    a.Left   + (b.Left   - a.Left)   * t,
    a.Top    + (b.Top    - a.Top)    * t,
    a.Right  + (b.Right  - a.Right)  * t,
    a.Bottom + (b.Bottom - a.Bottom) * t,
);
