import { Color } from '../primitives.js';
import { Effect } from './effect.js';

// Single-shadow drop shadow. Mirrors WPF's
// `System.Windows.Media.Effects.DropShadowEffect` defaults so authors
// who know WPF Effects can translate `new DropShadowEffect { ... }`
// XAML straight across.
//
// Coordinate convention follows WPF:
//   * Direction is in degrees CCW from East. 0 = right, 90 = up,
//     180 = left, 270 = down.
//   * CSS drop-shadow uses (x, y, blur, color) with positive Y
//     DOWNWARDS — toCssFilter() converts WPF's (depth, direction)
//     polar form to that signed-x / signed-y rectangular form.
//   * Opacity multiplies the color's own alpha (0..1) — same as WPF.
//
// Mutability: properties are public-writable plain fields, NOT
// registered DPs. Effects are typically value-types: install once,
// don't mutate. To swap colour or depth, replace the Effect on the
// Visual.Effect DP and let the render pipeline pick up the new
// instance. This keeps the class light and avoids hooking the Model
// machinery for value types.
export class DropShadowEffect extends Effect
{
    public Color:       Color;
    public BlurRadius:  number;
    public ShadowDepth: number;
    public Direction:   number;
    public Opacity:     number;

    constructor(opts: {
        Color?:       Color;
        BlurRadius?:  number;
        ShadowDepth?: number;
        Direction?:   number;
        Opacity?:     number;
    } = {})
    {
        super();
        this.Color       = opts.Color       ?? Color.Black;
        this.BlurRadius  = opts.BlurRadius  ?? 5;
        this.ShadowDepth = opts.ShadowDepth ?? 5;
        // WPF default direction is 315° (down-and-right). The
        // M3 material elevation specifically uses 270° (straight down)
        // — pick that as the new default since most consumers will be
        // using this for Material elevation.
        this.Direction   = opts.Direction   ?? 270;
        this.Opacity     = opts.Opacity     ?? 1;
    }

    public override toCssFilter(): string
    {
        const angle = this.Direction * Math.PI / 180;
        // WPF: positive Y is up. CSS: positive Y is down. Sin gives
        // the y component in WPF convention; flip for CSS.
        const x = Math.cos(angle) * this.ShadowDepth;
        const y = -Math.sin(angle) * this.ShadowDepth;
        const a = Math.max(0, Math.min(1, this.Color.A / 255 * this.Opacity));
        // Round to 1 decimal and squash the negative-zero IEEE
        // artefact: cos(270°) returns ≈ -1.5e-16, which would render
        // as "-0.0" — visually ugly and breaks exact-string equality
        // checks downstream. (Math.round / 10) + 0 normalises -0 to
        // +0 (per IEEE: -0 + +0 = +0).
        const fmt = (n: number): string => (Math.round(n * 10) / 10 + 0).toFixed(1);
        return `drop-shadow(${fmt(x)}px ${fmt(y)}px ${fmt(this.BlurRadius)}px rgba(${this.Color.R}, ${this.Color.G}, ${this.Color.B}, ${a.toFixed(3)}))`;
    }
}

// Material 3 elevation uses TWO drop shadows stacked: a tight key
// shadow + a softer ambient shadow. CSS `filter: drop-shadow(...)`
// composes by concatenation (`drop-shadow(A) drop-shadow(B)`), so we
// model elevation as an Effect that emits both functions in one
// `toCssFilter()` string. The five-level ramp matches M3 spec
// (https://m3.material.io/styles/elevation/tokens). Levels 0 and 5+
// are clamped — Level 0 returns the empty filter string (no shadow);
// higher inputs cap to Level 5.
export class MaterialElevationEffect extends Effect
{
    // Level is a plain field with public getter/setter so authors can
    // write the effect in `.mu` value position via the element-node
    // value form:
    //   @Elevation1 = MaterialElevationEffect [Level = 1]
    // Effect is a lightweight non-Model base class (it doesn't
    // participate in the property/binding pipeline), so a real DP
    // can't be registered here — the element-node-value emit just
    // does `_e.Level = 1` which goes through the setter.
    public Level: 0 | 1 | 2 | 3 | 4 | 5 = 1;

    constructor(level?: 0 | 1 | 2 | 3 | 4 | 5)
    {
        super();
        if (level !== undefined) this.Level = level;
    }

    public override toCssFilter(): string
    {
        // Level 0 = M3 "Resting / flat" — no shadow at all. Returning
        // the empty filter string lets the renderer treat it the same
        // as not setting `filter` at all.
        if (this.Level === 0) return '';
        // (offsetY1, blur1, offsetY2, blur2) per M3 spec, abridged.
        const RAMP: ReadonlyArray<readonly [number, number, number, number]> = [
            [1,  2, 1,  3],   // Level 1
            [1,  2, 2,  6],   // Level 2
            [1,  3, 4,  8],   // Level 3
            [2,  3, 6, 10],   // Level 4
            [4,  4, 8, 12],   // Level 5
        ];
        const [y1, b1, y2, b2] = RAMP[this.Level - 1]!;
        // M3 key shadow at 30% opacity; ambient at 15% opacity.
        return `drop-shadow(0 ${y1}px ${b1}px rgba(0, 0, 0, 0.30)) drop-shadow(0 ${y2}px ${b2}px rgba(0, 0, 0, 0.15))`;
    }
}
