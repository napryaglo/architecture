import { FontStyle, FontWeight } from './formatted-text.js';

// A font reference — WPF's FontFamily analogue. Wraps a CSS-style family
// source string (a single family name like "Inter", or a comma-separated
// fallback stack like "Inter, system-ui, sans-serif"). The value class
// exists so a FontFamily DP carries a real typed value rather than a bare
// string proxy; the engine layer (TextMeasurer, FormattedText, renderers)
// still works in the CSS string, reached here via `.Source`.
//
// Immutable. Constructed from a string at the markup/DP boundary (the
// compiler coerces `FontFamily="Inter"` to `new FontFamily("Inter")`) or
// handed back from a `fonts { … }` block as a registered family.
export class FontFamily
{
    /** CSS-style family source — a name or comma-separated fallback stack. */
    public readonly Source: string;

    constructor(source: string)
    {
        this.Source = source;
    }

    /** The fallback stack split into individual family names, trimmed.
     *  `"Inter, system-ui"` → `["Inter", "system-ui"]`. */
    public get FamilyNames(): readonly string[]
    {
        return this.Source.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    /** First (primary) family name in the stack. */
    public get Name(): string
    {
        return this.FamilyNames[0] ?? this.Source;
    }

    public Equals(other: FontFamily | null | undefined): boolean
    {
        return other instanceof FontFamily && other.Source === this.Source;
    }

    /** The CSS string the engine emits verbatim into `font-family`. */
    public toString(): string
    {
        return this.Source;
    }

    /** Coerce a string-or-FontFamily into a FontFamily. Used at binding /
     *  DP boundaries where a value may arrive as either (a markup string
     *  literal, or an already-built family resource). */
    public static from(value: FontFamily | string): FontFamily
    {
        return value instanceof FontFamily ? value : new FontFamily(value);
    }
}

// A fully-specified type face — family + weight + style. WPF's Typeface
// analogue and the unit the FontManager registers and resolves against.
// Controls keep FontFamily / FontWeight / FontStyle as separate DPs (as
// WPF does); a Typeface is the value that combines them when a single
// handle is needed (registration, resolution, measurement keys).
export class Typeface
{
    public readonly Family: FontFamily;
    public readonly Weight: FontWeight;
    public readonly Style:  FontStyle;

    constructor(
        family: FontFamily | string,
        weight: FontWeight = FontWeight.Normal,
        style:  FontStyle  = FontStyle.Normal,
    )
    {
        this.Family = FontFamily.from(family);
        this.Weight = weight;
        this.Style  = style;
    }

    public Equals(other: Typeface | null | undefined): boolean
    {
        return other instanceof Typeface
            && other.Family.Equals(this.Family)
            && other.Weight === this.Weight
            && other.Style  === this.Style;
    }

    public toString(): string
    {
        return `${this.Family.Source} ${this.Weight} ${this.Style}`;
    }
}
