// Plain value types shared across the visual engine. None of these
// participate in the property/binding system — they're immutable
// snapshots passed by value (well, by reference to a frozen object;
// JavaScript doesn't have value types, but the readonly fields and the
// "every mutation returns a new instance" convention give equivalent
// semantics).
//
// Coordinate system: top-left origin, y-down, DIPs (device-independent
// pixels — 1/96"). Matches WPF and maps directly to SVG / Canvas.

// Per-side inset distances — used for Padding, Margin, BorderThickness,
// and any layout-time "how much space do the four sides eat" measurement.
// Constructor accepts 1, 2, or 4 numbers:
//   new Thickness(5)              → all four sides = 5
//   new Thickness(5, 10)          → horizontal = 5, vertical = 10
//   new Thickness(5, 10, 15, 20)  → left, top, right, bottom
export class Thickness
{
    public readonly Left:   number;
    public readonly Top:    number;
    public readonly Right:  number;
    public readonly Bottom: number;

    constructor(left: number);
    constructor(horizontal: number, vertical: number);
    constructor(left: number, top: number, right: number, bottom: number);
    constructor(a: number, b?: number, c?: number, d?: number)
    {
        if (b === undefined)
        {
            this.Left = this.Top = this.Right = this.Bottom = a;
        }
        else if (c === undefined)
        {
            this.Left = this.Right = a;
            this.Top  = this.Bottom = b;
        }
        else
        {
            this.Left   = a;
            this.Top    = b;
            this.Right  = c;
            this.Bottom = d!;
        }
    }

    public static readonly Zero: Thickness = new Thickness(0);

    public get Horizontal(): number { return this.Left + this.Right; }
    public get Vertical(): number   { return this.Top + this.Bottom; }
    public get IsZero(): boolean
    {
        return this.Left === 0 && this.Top === 0 && this.Right === 0 && this.Bottom === 0;
    }

    public Equals(other: Thickness): boolean
    {
        return this.Left === other.Left
            && this.Top === other.Top
            && this.Right === other.Right
            && this.Bottom === other.Bottom;
    }

    public toString(): string
    {
        return `Thickness(${this.Left}, ${this.Top}, ${this.Right}, ${this.Bottom})`;
    }
}

// 2D point. Equality is structural; no in-place mutation.
export class Point
{
    constructor(
        public readonly X: number,
        public readonly Y: number,
    ) {}

    public static readonly Zero: Point = new Point(0, 0);

    public Add(other: Point): Point
    {
        return new Point(this.X + other.X, this.Y + other.Y);
    }

    public Subtract(other: Point): Point
    {
        return new Point(this.X - other.X, this.Y - other.Y);
    }

    public Equals(other: Point): boolean
    {
        return this.X === other.X && this.Y === other.Y;
    }

    public toString(): string
    {
        return `Point(${this.X}, ${this.Y})`;
    }
}

// 2D size. Width and Height must be non-negative; Empty represents the
// "no size assigned" state (both NaN, matching WPF's Size.Empty).
export class Size
{
    constructor(
        public readonly Width: number,
        public readonly Height: number,
    ) {}

    public static readonly Zero: Size = new Size(0, 0);
    public static readonly Empty: Size = new Size(Number.NaN, Number.NaN);

    public get IsEmpty(): boolean
    {
        return Number.isNaN(this.Width) || Number.isNaN(this.Height);
    }

    public Equals(other: Size): boolean
    {
        if (this.IsEmpty && other.IsEmpty) return true;
        return this.Width === other.Width && this.Height === other.Height;
    }

    public toString(): string
    {
        return this.IsEmpty ? 'Size.Empty' : `Size(${this.Width}, ${this.Height})`;
    }
}

// Axis-aligned rectangle. X/Y are the top-left corner; Width/Height grow
// down-right. Width or Height may be 0 (degenerate but valid). Negative
// values are tolerated — callers that need normalization should compose
// via Rect.FromCorners.
export class Rect
{
    constructor(
        public readonly X: number,
        public readonly Y: number,
        public readonly Width: number,
        public readonly Height: number,
    ) {}

    public static readonly Zero: Rect = new Rect(0, 0, 0, 0);

    // Builds a rect from two opposite corners; order-independent.
    public static FromCorners(a: Point, b: Point): Rect
    {
        const x = Math.min(a.X, b.X);
        const y = Math.min(a.Y, b.Y);
        return new Rect(x, y, Math.abs(b.X - a.X), Math.abs(b.Y - a.Y));
    }

    public static FromOriginSize(origin: Point, size: Size): Rect
    {
        return new Rect(origin.X, origin.Y, size.Width, size.Height);
    }

    public get Left(): number   { return this.X; }
    public get Top(): number    { return this.Y; }
    public get Right(): number  { return this.X + this.Width; }
    public get Bottom(): number { return this.Y + this.Height; }

    public get TopLeft(): Point     { return new Point(this.Left, this.Top); }
    public get TopRight(): Point    { return new Point(this.Right, this.Top); }
    public get BottomLeft(): Point  { return new Point(this.Left, this.Bottom); }
    public get BottomRight(): Point { return new Point(this.Right, this.Bottom); }

    public get Size(): Size { return new Size(this.Width, this.Height); }

    public Contains(p: Point): boolean
    {
        return p.X >= this.Left && p.X <= this.Right
            && p.Y >= this.Top  && p.Y <= this.Bottom;
    }

    // Returns the overlap or undefined when the two rects don't intersect.
    public Intersect(other: Rect): Rect | undefined
    {
        const x = Math.max(this.Left, other.Left);
        const y = Math.max(this.Top,  other.Top);
        const r = Math.min(this.Right,  other.Right);
        const b = Math.min(this.Bottom, other.Bottom);
        if (r < x || b < y) return undefined;
        return new Rect(x, y, r - x, b - y);
    }

    // Smallest rect containing both inputs.
    public Union(other: Rect): Rect
    {
        const x = Math.min(this.Left, other.Left);
        const y = Math.min(this.Top,  other.Top);
        const r = Math.max(this.Right,  other.Right);
        const b = Math.max(this.Bottom, other.Bottom);
        return new Rect(x, y, r - x, b - y);
    }

    public Equals(other: Rect): boolean
    {
        return this.X === other.X && this.Y === other.Y
            && this.Width === other.Width && this.Height === other.Height;
    }

    public toString(): string
    {
        return `Rect(${this.X}, ${this.Y}, ${this.Width} × ${this.Height})`;
    }
}

// sRGB color with 0..255 channels and a separate 0..255 alpha. Channels
// are floats during construction so converters can pass partial values
// without rounding loss; toCss() rounds for output.
export class Color
{
    constructor(
        public readonly R: number,
        public readonly G: number,
        public readonly B: number,
        public readonly A: number = 255,
    ) {}

    public static readonly Transparent: Color = new Color(0, 0, 0, 0);
    public static readonly Black: Color       = new Color(0, 0, 0);
    public static readonly White: Color       = new Color(255, 255, 255);
    public static readonly Red: Color         = new Color(255, 0, 0);
    public static readonly Green: Color       = new Color(0, 128, 0);
    public static readonly Blue: Color        = new Color(0, 0, 255);

    // Accepts #rgb, #rgba, #rrggbb, #rrggbbaa (case-insensitive, '#' optional).
    // Rejects any non-hex character up front rather than letting parseInt
    // silently return NaN for invalid input.
    public static FromHex(hex: string): Color
    {
        const s = hex.startsWith('#') ? hex.slice(1) : hex;
        if (s.length !== 3 && s.length !== 4 && s.length !== 6 && s.length !== 8)
        {
            throw new Error(`Color.FromHex: malformed hex '${hex}' (expected #rgb / #rgba / #rrggbb / #rrggbbaa)`);
        }
        if (!/^[0-9a-fA-F]+$/.test(s))
        {
            throw new Error(`Color.FromHex: non-hex character in '${hex}'`);
        }
        const expand = (c: string): number => parseInt(c + c, 16);
        if (s.length === 3 || s.length === 4)
        {
            const r = expand(s[0]!);
            const g = expand(s[1]!);
            const b = expand(s[2]!);
            const a = s.length === 4 ? expand(s[3]!) : 255;
            return new Color(r, g, b, a);
        }
        const r = parseInt(s.slice(0, 2), 16);
        const g = parseInt(s.slice(2, 4), 16);
        const b = parseInt(s.slice(4, 6), 16);
        const a = s.length === 8 ? parseInt(s.slice(6, 8), 16) : 255;
        return new Color(r, g, b, a);
    }

    public WithAlpha(a: number): Color
    {
        return new Color(this.R, this.G, this.B, a);
    }

    // Channel-wise linear blend a→b at t∈[0,1] (clamped). Blends ALL four
    // channels including alpha; callers that must preserve a channel
    // (e.g. Lighten keeping the source alpha) re-apply it after. The
    // foundation the color modifiers build on: Lighten = Lerp(c,White,t),
    // Darken = Lerp(c,Black,t), Mix(c,other,t) = Lerp(c,other,t).
    public static Lerp(a: Color, b: Color, t: number): Color
    {
        const u = t < 0 ? 0 : t > 1 ? 1 : t;
        const mix = (x: number, y: number): number => x + (y - x) * u;
        return new Color(mix(a.R, b.R), mix(a.G, b.G), mix(a.B, b.B), mix(a.A, b.A));
    }

    // Shift saturation by `delta` (∈ roughly -1..+1) in HSL space, hue and
    // lightness preserved, alpha carried through unchanged. delta>0
    // saturates, delta<0 desaturates; the result S clamps to 0..1.
    public AdjustSaturation(delta: number): Color
    {
        const [h, s, l] = rgbToHsl(this.R, this.G, this.B);
        const s2 = Math.max(0, Math.min(1, s + delta));
        const [r, g, b] = hslToRgb(h, s2, l);
        return new Color(r, g, b, this.A);
    }

    // Emits the most compact CSS color form for the channel values:
    // 'rgb(r,g,b)' when fully opaque, 'rgba(r,g,b,a)' otherwise.
    public ToCss(): string
    {
        const r = Math.round(this.R);
        const g = Math.round(this.G);
        const b = Math.round(this.B);
        if (this.A >= 255) return `rgb(${r},${g},${b})`;
        const a = Math.round(this.A) / 255;
        return `rgba(${r},${g},${b},${a})`;
    }

    // Emits '#rrggbb' (fully opaque) or '#rrggbbaa' otherwise — the
    // same format Color.FromHex round-trips. Channel values clamp to
    // 0..255 before formatting so floats from converters (e.g. HSV
    // sliders) don't trip the two-hex-digit invariant.
    public ToHex(): string
    {
        const hex = (n: number): string => {
            const v = Math.max(0, Math.min(255, Math.round(n)));
            return v.toString(16).padStart(2, '0');
        };
        const base = `#${hex(this.R)}${hex(this.G)}${hex(this.B)}`;
        if (this.A >= 255) return base;
        return base + hex(this.A);
    }

    public Equals(other: Color): boolean
    {
        return this.R === other.R && this.G === other.G
            && this.B === other.B && this.A === other.A;
    }

    public toString(): string
    {
        return this.ToCss();
    }
}

// RGB (0..255) → HSL with h∈[0,1), s,l∈[0,1]. Standard conversion; used
// by Color.AdjustSaturation. Kept module-private — the public surface is
// the Color methods, not the raw triplet math.
function rgbToHsl(R: number, G: number, B: number): [number, number, number]
{
    const r = R / 255, g = G / 255, b = B / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return [0, 0, l];
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else                h = ((r - g) / d + 4) / 6;
    return [h, s, l];
}

// HSL (h∈[0,1), s,l∈[0,1]) → RGB (0..255). Inverse of rgbToHsl.
function hslToRgb(h: number, s: number, l: number): [number, number, number]
{
    if (s === 0)
    {
        const v = l * 255;
        return [v, v, v];
    }
    const hue = (p: number, q: number, t: number): number => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue(p, q, h + 1 / 3) * 255, hue(p, q, h) * 255, hue(p, q, h - 1 / 3) * 255];
}

// 2D affine transform. Storage matches WPF's row-vector convention:
//
//   | m11  m12  0 |
//   | m21  m22  0 |
//   | ox   oy   1 |
//
// Point transform: [X Y 1] * M = [X' Y' 1], i.e.
//   X' = X*m11 + Y*m21 + ox
//   Y' = X*m12 + Y*m22 + oy
//
// This convention also matches SVG/Canvas matrix(a,b,c,d,e,f) where
// (a,b,c,d,e,f) = (m11, m12, m21, m22, ox, oy) — so emitting to either
// renderer is a no-rearrange operation.
export class Matrix
{
    constructor(
        public readonly M11: number,
        public readonly M12: number,
        public readonly M21: number,
        public readonly M22: number,
        public readonly OffsetX: number,
        public readonly OffsetY: number,
    ) {}

    public static readonly Identity: Matrix = new Matrix(1, 0, 0, 1, 0, 0);

    public static Translate(dx: number, dy: number): Matrix
    {
        return new Matrix(1, 0, 0, 1, dx, dy);
    }

    public static Scale(sx: number, sy: number): Matrix
    {
        return new Matrix(sx, 0, 0, sy, 0, 0);
    }

    public static Rotate(angleRadians: number): Matrix
    {
        const c = Math.cos(angleRadians);
        const s = Math.sin(angleRadians);
        return new Matrix(c, s, -s, c, 0, 0);
    }

    public get IsIdentity(): boolean
    {
        return this.M11 === 1 && this.M12 === 0
            && this.M21 === 0 && this.M22 === 1
            && this.OffsetX === 0 && this.OffsetY === 0;
    }

    public get Determinant(): number
    {
        return this.M11 * this.M22 - this.M12 * this.M21;
    }

    // Row-vector multiplication: returns (this * other). Equivalent to
    // applying `this` first, then `other` to the result.
    public Multiply(other: Matrix): Matrix
    {
        return new Matrix(
            this.M11 * other.M11 + this.M12 * other.M21,
            this.M11 * other.M12 + this.M12 * other.M22,
            this.M21 * other.M11 + this.M22 * other.M21,
            this.M21 * other.M12 + this.M22 * other.M22,
            this.OffsetX * other.M11 + this.OffsetY * other.M21 + other.OffsetX,
            this.OffsetX * other.M12 + this.OffsetY * other.M22 + other.OffsetY,
        );
    }

    public Transform(p: Point): Point
    {
        return new Point(
            p.X * this.M11 + p.Y * this.M21 + this.OffsetX,
            p.X * this.M12 + p.Y * this.M22 + this.OffsetY,
        );
    }

    // Returns the inverse, or undefined when the matrix is singular.
    public Invert(): Matrix | undefined
    {
        const det = this.Determinant;
        if (det === 0) return undefined;
        const inv = 1 / det;
        return new Matrix(
             this.M22 * inv,
            -this.M12 * inv,
            -this.M21 * inv,
             this.M11 * inv,
            (this.M21 * this.OffsetY - this.M22 * this.OffsetX) * inv,
            (this.M12 * this.OffsetX - this.M11 * this.OffsetY) * inv,
        );
    }

    public Equals(other: Matrix): boolean
    {
        return this.M11 === other.M11 && this.M12 === other.M12
            && this.M21 === other.M21 && this.M22 === other.M22
            && this.OffsetX === other.OffsetX && this.OffsetY === other.OffsetY;
    }

    public toString(): string
    {
        return `Matrix(${this.M11}, ${this.M12}, ${this.M21}, ${this.M22}, ${this.OffsetX}, ${this.OffsetY})`;
    }
}

// The axis-aligned bounding-box SIZE of Rect(0,0,size) mapped through `m`.
// Used by LayoutTransform to report an element's transformed footprint (a
// scaled element measures larger; a rotated one measures to its rotated bbox).
export function transformBounds(size: Size, m: Matrix): Size
{
    const c0 = m.Transform(new Point(0, 0));
    const c1 = m.Transform(new Point(size.Width, 0));
    const c2 = m.Transform(new Point(0, size.Height));
    const c3 = m.Transform(new Point(size.Width, size.Height));
    const minX = Math.min(c0.X, c1.X, c2.X, c3.X);
    const minY = Math.min(c0.Y, c1.Y, c2.Y, c3.Y);
    const maxX = Math.max(c0.X, c1.X, c2.X, c3.X);
    const maxY = Math.max(c0.Y, c1.Y, c2.Y, c3.Y);
    return new Size(maxX - minX, maxY - minY);
}
