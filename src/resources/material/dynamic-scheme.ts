import { Color, defineScheme, type Scheme } from '../../runtime/index.js';
import { SolidColorBrush } from '../../visual-engine/index.js';

// M3 dynamic-colour scheme generator (§ 17.13).
//
// A real implementation needs the CAM16 "HCT" colour space — the same
// numeric library Google's `material-color-utilities` package ships.
// That's substantial: ~2000 LOC of perceptually-uniform colour-space
// math (`Hct`, `CorePalette`, `TonalPalette`, `Cam16`, `ViewingConditions`).
// v1 ships a SIMPLIFIED tonal-palette derivation using HSL — visually
// close enough for development demos, with a clear seam to swap in
// the full HCT pipeline when concrete demand appears.
//
// Public surface:
//   * `DynamicSchemeVariant` enum (Tonal / Vibrant / Expressive /
//     Fidelity / Content / Neutral / Monochrome) — same options M3
//     publishes; v1 only differentiates `TonalSpot` vs. `Neutral`
//     vs. `Monochrome`. The other variants alias to TonalSpot for now.
//   * `makeDynamicScheme(opts)` — builds a single Scheme from a seed
//     ARGB integer (or `Color`) + isDark flag + variant.
//   * `makeDynamicLightDarkPair(opts)` — convenience that builds both
//     light and dark schemes from the same seed.
//
// What's intentionally NOT in v1 (tracked as follow-ups):
//   * Wallpaper-extraction seed sourcing (no browser/Node API for it
//     yet — consumer apps can wire that themselves).
//   * `PrefersContrast=More` higher-chroma tone tables.
//   * Per-role post-generation overrides (`scheme.with({ Primary: X })`).
//   * Exposing `TonalPalette` itself as a first-class .mu value type.
//   * Full HCT/CAM16 pipeline (port of material-color-utilities).
//
// Generator contract: every Scheme produced satisfies the Material
// theme's token catalog — 30 colour roles plus the shared shape /
// motion / typography pass-through. Tokens use the same names as the
// hand-authored light/dark.mu schemes so existing template references
// (@Primary, @OnPrimary, @Surface, …) keep resolving without changes.

/** Variant family. Differentiates how secondary/tertiary palettes are
 *  derived from the seed. v1 only fully differentiates three variants;
 *  the others alias for now and can specialise as the implementation
 *  matures. */
export enum DynamicSchemeVariant
{
    TonalSpot   = 'TonalSpot',   // Default. Hue-shifted secondary/tertiary.
    Vibrant     = 'Vibrant',     // Higher chroma; pops more colour.
    Expressive  = 'Expressive',  // Wider hue spread between roles.
    Fidelity    = 'Fidelity',    // Closely matches the seed hue.
    Content     = 'Content',     // Seed-content-driven — image extraction.
    Neutral     = 'Neutral',     // Low-chroma; greyish palette.
    Monochrome  = 'Monochrome',  // Single hue (the seed); chroma = 0 elsewhere.
}

export interface DynamicSchemeOptions
{
    /** Scheme name (e.g. 'auto-light'). */
    readonly name:    string;
    /** Theme to register against — typically the Material theme. */
    readonly theme:   string;
    /** Seed colour. Accepts a 24-bit / 32-bit ARGB integer (matching
     *  Google's API), or a Color instance. */
    readonly seed:    number | Color;
    /** `true` for the dark variant. */
    readonly isDark:  boolean;
    /** Variant family. Defaults to TonalSpot. */
    readonly variant?: DynamicSchemeVariant;
}

/** Build a single light-or-dark Scheme from `seed` + variant. */
export function makeDynamicScheme(opts: DynamicSchemeOptions): Scheme
{
    const seedColor = opts.seed instanceof Color
        ? opts.seed
        : argbToColor(opts.seed);
    const variant   = opts.variant ?? DynamicSchemeVariant.TonalSpot;

    // Per-variant palette derivation. v1 uses HSL approximations of
    // M3's tonal palette logic — the produced tokens are visually
    // close to the HCT output for most seed colours and identical
    // enough that template authors can build against this API today.
    const palettes = buildPalettes(seedColor, variant);

    // M3 role → tone mapping (light / dark). Numbers come from the
    // m3 spec's role-tone table.
    const tones = opts.isDark ? darkTones : lightTones;

    const tokens: Record<string, unknown> = {};
    for (const [role, [palette, tone]] of Object.entries(tones))
    {
        const c = palettes[palette].tone(tone);
        tokens[role] = new SolidColorBrush(c);
    }

    return defineScheme({
        name:   opts.name,
        theme:  opts.theme,
        tokens,
    });
}

/** Convenience: build both schemes from the same seed + variant. */
export function makeDynamicLightDarkPair(
    seed: number | Color,
    themeName: string = 'material',
    variant: DynamicSchemeVariant = DynamicSchemeVariant.TonalSpot,
): { light: Scheme; dark: Scheme }
{
    return {
        light: makeDynamicScheme({ name: 'auto-light', theme: themeName, seed, isDark: false, variant }),
        dark:  makeDynamicScheme({ name: 'auto-dark',  theme: themeName, seed, isDark: true,  variant }),
    };
}

// ─────────────────────────────────────────────────────────────────────
// Internals — palette derivation
// ─────────────────────────────────────────────────────────────────────

interface TonalPalette
{
    tone(value: number): Color;
}

interface PaletteSet
{
    a1: TonalPalette;   // Primary
    a2: TonalPalette;   // Secondary
    a3: TonalPalette;   // Tertiary
    n1: TonalPalette;   // Neutral
    n2: TonalPalette;   // Neutral variant
    error: TonalPalette;
}

function buildPalettes(seed: Color, variant: DynamicSchemeVariant): PaletteSet
{
    const seedHsl = rgbToHsl(seed);
    // M3 spec rules:
    //   * Secondary palette: same hue, lower chroma.
    //   * Tertiary palette: hue rotated ~60° (variant-dependent), normal chroma.
    //   * Neutrals: same hue, very low chroma.
    //   * Error: fixed red-ish hue around 25°, high chroma.
    let primaryChroma:   number;
    let secondaryChroma: number;
    let tertiaryChroma:  number;
    let tertiaryHueShift: number;
    let neutralChroma:   number;
    switch (variant)
    {
        case DynamicSchemeVariant.Vibrant:
            primaryChroma    = Math.min(seedHsl.s, 0.85);
            secondaryChroma  = seedHsl.s * 0.5;
            tertiaryChroma   = Math.min(seedHsl.s, 0.6);
            tertiaryHueShift = 90;
            neutralChroma    = 0.08;
            break;
        case DynamicSchemeVariant.Neutral:
            primaryChroma    = Math.min(seedHsl.s, 0.3);
            secondaryChroma  = seedHsl.s * 0.1;
            tertiaryChroma   = Math.min(seedHsl.s, 0.2);
            tertiaryHueShift = 60;
            neutralChroma    = 0.04;
            break;
        case DynamicSchemeVariant.Monochrome:
            primaryChroma    = 0;
            secondaryChroma  = 0;
            tertiaryChroma   = 0;
            tertiaryHueShift = 0;
            neutralChroma    = 0;
            break;
        default:
            primaryChroma    = Math.min(seedHsl.s, 0.7);
            secondaryChroma  = seedHsl.s * 0.33;
            tertiaryChroma   = Math.min(seedHsl.s, 0.5);
            tertiaryHueShift = 60;
            neutralChroma    = 0.06;
            break;
    }

    return {
        a1: tonalPalette(seedHsl.h, primaryChroma),
        a2: tonalPalette(seedHsl.h, secondaryChroma),
        a3: tonalPalette((seedHsl.h + tertiaryHueShift) % 360, tertiaryChroma),
        n1: tonalPalette(seedHsl.h, neutralChroma),
        n2: tonalPalette(seedHsl.h, neutralChroma * 0.5),
        error: tonalPalette(25, 0.6),
    };
}

// Tonal palette factory: returns a function that maps tone (0-100) to a
// Color, holding hue + chroma fixed. Tone maps to HSL lightness 0-100.
function tonalPalette(hue: number, chroma: number): TonalPalette
{
    return {
        tone(value: number): Color
        {
            const l = clamp(value, 0, 100) / 100;
            return hslToRgb(hue, chroma, l);
        },
    };
}

// M3 role → (palette key, tone-in-light) for the LIGHT scheme.
// Mirrors the role table in the M3 token catalogue.
const lightTones: Record<string, [keyof PaletteSet, number]> = {
    // Primary family
    Primary:                     ['a1', 40],
    OnPrimary:                   ['a1', 100],
    PrimaryContainer:            ['a1', 90],
    OnPrimaryContainer:          ['a1', 10],
    // Secondary
    Secondary:                   ['a2', 40],
    OnSecondary:                 ['a2', 100],
    SecondaryContainer:          ['a2', 90],
    OnSecondaryContainer:        ['a2', 10],
    // Tertiary
    Tertiary:                    ['a3', 40],
    OnTertiary:                  ['a3', 100],
    TertiaryContainer:           ['a3', 90],
    OnTertiaryContainer:         ['a3', 10],
    // Error
    Error:                       ['error', 40],
    OnError:                     ['error', 100],
    ErrorContainer:              ['error', 90],
    OnErrorContainer:            ['error', 10],
    // Background + Surface family
    Background:                  ['n1', 99],
    OnBackground:                ['n1', 10],
    Surface:                     ['n1', 99],
    OnSurface:                   ['n1', 10],
    SurfaceVariant:              ['n2', 90],
    OnSurfaceVariant:            ['n2', 30],
    // Outline + Shadow
    Outline:                     ['n2', 50],
    OutlineVariant:              ['n2', 80],
    Shadow:                      ['n1', 0],
    Scrim:                       ['n1', 0],
    InverseSurface:              ['n1', 20],
    InverseOnSurface:            ['n1', 95],
    InversePrimary:              ['a1', 80],
    SurfaceTint:                 ['a1', 40],
    // Surface containers (M3 2024 expanded surface roles)
    SurfaceContainerLowest:      ['n1', 100],
    SurfaceContainerLow:         ['n1', 96],
    SurfaceContainer:            ['n1', 94],
    SurfaceContainerHigh:        ['n1', 92],
    SurfaceContainerHighest:     ['n1', 90],
};

// Dark scheme inverts tones around the M3 dark-palette rules.
const darkTones: Record<string, [keyof PaletteSet, number]> = {
    Primary:                     ['a1', 80],
    OnPrimary:                   ['a1', 20],
    PrimaryContainer:            ['a1', 30],
    OnPrimaryContainer:          ['a1', 90],
    Secondary:                   ['a2', 80],
    OnSecondary:                 ['a2', 20],
    SecondaryContainer:          ['a2', 30],
    OnSecondaryContainer:        ['a2', 90],
    Tertiary:                    ['a3', 80],
    OnTertiary:                  ['a3', 20],
    TertiaryContainer:           ['a3', 30],
    OnTertiaryContainer:         ['a3', 90],
    Error:                       ['error', 80],
    OnError:                     ['error', 20],
    ErrorContainer:              ['error', 30],
    OnErrorContainer:            ['error', 90],
    Background:                  ['n1', 10],
    OnBackground:                ['n1', 90],
    Surface:                     ['n1', 10],
    OnSurface:                   ['n1', 90],
    SurfaceVariant:              ['n2', 30],
    OnSurfaceVariant:            ['n2', 80],
    Outline:                     ['n2', 60],
    OutlineVariant:              ['n2', 30],
    Shadow:                      ['n1', 0],
    Scrim:                       ['n1', 0],
    InverseSurface:              ['n1', 90],
    InverseOnSurface:            ['n1', 20],
    InversePrimary:              ['a1', 40],
    SurfaceTint:                 ['a1', 80],
    SurfaceContainerLowest:      ['n1', 4],
    SurfaceContainerLow:         ['n1', 10],
    SurfaceContainer:            ['n1', 12],
    SurfaceContainerHigh:        ['n1', 17],
    SurfaceContainerHighest:     ['n1', 22],
};

// ─────────────────────────────────────────────────────────────────────
// HSL <-> RGB helpers (v1 stand-in for HCT)
// ─────────────────────────────────────────────────────────────────────

interface Hsl { h: number; s: number; l: number; }

function rgbToHsl(c: Color): Hsl
{
    const r = c.R / 255;
    const g = c.G / 255;
    const b = c.B / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min)
    {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max)
        {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
            case g: h = ((b - r) / d + 2) * 60; break;
            case b: h = ((r - g) / d + 4) * 60; break;
        }
    }
    return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Color
{
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (h % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp < 1)      { r1 = c; g1 = x; }
    else if (hp < 2) { r1 = x; g1 = c; }
    else if (hp < 3) { g1 = c; b1 = x; }
    else if (hp < 4) { g1 = x; b1 = c; }
    else if (hp < 5) { r1 = x; b1 = c; }
    else             { r1 = c; b1 = x; }
    const m = l - c / 2;
    return new Color(
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255),
        255,
    );
}

function argbToColor(argb: number): Color
{
    const a = (argb >>> 24) & 0xff;
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>>  8) & 0xff;
    const b =  argb         & 0xff;
    return new Color(r, g, b, a === 0 ? 255 : a);
}

function clamp(v: number, lo: number, hi: number): number
{
    return Math.max(lo, Math.min(hi, v));
}
