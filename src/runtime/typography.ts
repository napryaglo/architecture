// Typography — value type bundling the per-token typography properties
// from M3 (Display, Headline, Title, Body, Label families) into a single
// immutable object. Schemes ship Typography instances for each token
// (@DisplayLarge, @BodyMedium, @LabelLargeFont/Size/Weight/Tracking, …);
// templates reference the token name and the typography pipeline reads
// the bundled fields onto a TextBlock-derived target.
//
// § 17.10 — v1 scope:
//   * Value class with five read-only fields matching the M3 token
//     shape (family / size / weight / line-height / tracking).
//   * Static helper `applyTo(target)` that mirrors the bundle onto a
//     target's standard typography DPs (Foreground stays consumer-
//     controlled — Typography is type-only, not colour).
//   * Hand-authoring in TypeScript: `new Typography({...})`. Markup
//     authoring via `.mu`'s value-position syntax (`@BodyMedium =
//     Typography { Family: 'Roboto' ... }`) is a separate compiler
//     change; v1 closure surfaces the JS API.
//
// Future work tracked under § 17.10 follow-up:
//   * `.mu` value-position parser support for Typography
//   * Style-applier integration so `Setter(Style.TypographyKey, ...)`
//     fans out to FontFamily / FontSize / FontWeight / LineHeight DPs
//   * Per-target letter-spacing wiring (mural's LetterSpacing DP on
//     TextBlock — verify the writer plumbing across Slider value labels,
//     menu item rows, etc.)

/** WPF-style FontWeight ergonomics. Mural's existing TextBlock.FontWeight
 *  accepts string values ('Regular', 'Medium', etc.) and numeric
 *  weights (400, 500, 700); Typography normalises to numeric so the
 *  downstream renderer doesn't need to disambiguate. */
export type TypographyWeight = number;

export interface TypographyProps
{
    /** Font family stack — first match wins per the CSS contract. */
    readonly Family: string;
    /** Type size in DP. M3's token catalogue maps to pixel sizes one-to-
     *  one (Display/Large = 57 / 64 / 72, Body/Medium = 14 / 20 / 0.25,
     *  …); the size DP stays the source-of-truth and the renderer
     *  multiplies by Density / zoom on demand. */
    readonly Size: number;
    /** Numeric font weight (100-900). M3 typography tokens land on 400
     *  (Regular) or 500 (Medium) most of the time; the Display family
     *  occasionally uses 600 (Semibold). */
    readonly Weight: TypographyWeight;
    /** Line height in DP — absolute value, NOT a ratio. M3 baseline
     *  multiplies the type size by ~1.4 for body roles, ~1.15 for
     *  display roles. */
    readonly LineHeight: number;
    /** Letter spacing in DP. M3 tokens express tracking in millis (the
     *  catalogue's "0.25" reads as 0.25 dp per character); this field
     *  is in the same DP unit as the renderer's `letter-spacing` CSS
     *  emission. Default 0 (kern-pair-driven; no track adjustment). */
    readonly Tracking?: number;
}

export class Typography
{
    public readonly Family:     string;
    public readonly Size:       number;
    public readonly Weight:     TypographyWeight;
    public readonly LineHeight: number;
    public readonly Tracking:   number;

    constructor(props: TypographyProps)
    {
        this.Family     = props.Family;
        this.Size       = props.Size;
        this.Weight     = props.Weight;
        this.LineHeight = props.LineHeight;
        this.Tracking   = props.Tracking ?? 0;
    }

    /** Two Typography instances are equal when every numeric / string
     *  field matches. Used by the implicit-transition engine to skip
     *  no-op writes; consumer code rarely needs it. */
    public Equals(other: Typography): boolean
    {
        return this.Family     === other.Family
            && this.Size       === other.Size
            && this.Weight     === other.Weight
            && this.LineHeight === other.LineHeight
            && this.Tracking   === other.Tracking;
    }
}
