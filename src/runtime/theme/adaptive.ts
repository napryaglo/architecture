// Adaptive context — enums + viewport-breakpoint policy. The matching
// inherited DPs (Density, ViewportClass, Pointer, PrefersContrast,
// PrefersReducedMotion, PrefersColorScheme) and their MediaWatcher
// service live on `ThemeManager` so the trigger system can resolve
// them as `when(ThemeManager.Density = Compact)` against the static
// theme-manager class rather than a per-Visual attached property.
//
// This file deliberately holds NO references to ThemeManager or
// Visual — that lets theme.ts import from here without a cycle.
//
// See theme-architecture.md for the full design.

// ── Adaptive enums ────────────────────────────────────────────────────

/** User / app-controlled density. M3 calls this "spec density"; mural
 *  exposes the three M3-canonical values. Apps decide whether to flip
 *  this manually or honour a hypothetical OS density preference. */
export enum Density
{
    Compact      = 'Compact',
    Regular      = 'Regular',
    Comfortable  = 'Comfortable',
}

/** Viewport size bucket. Default thresholds match M3 baseline (mobile
 *  ≤ 600dp, tablet 600..840dp, desktop > 840dp). MediaWatcher updates
 *  this from a ResizeObserver on the root surface. */
export enum ViewportClass
{
    Mobile   = 'Mobile',
    Tablet   = 'Tablet',
    Desktop  = 'Desktop',
}

/** Primary pointer kind. `Coarse` = touch / pen (≥ 44dp targets);
 *  `Fine` = mouse / trackpad. Driven by `matchMedia('(pointer:
 *  coarse)')`. */
export enum Pointer
{
    Fine   = 'Fine',
    Coarse = 'Coarse',
}

/** OS-level contrast preference. Driven by `matchMedia('(prefers-
 *  contrast: more)')`. */
export enum PrefersContrast
{
    Normal  = 'Normal',
    More    = 'More',
}

/** OS-level color-scheme preference. Driven by `matchMedia('(prefers-
 *  color-scheme: dark)')`. Apps that call `ThemeManager.AutoScheme`
 *  use this as the source of truth; apps that pin a scheme via
 *  `SetTheme(...)` ignore it. */
export enum PreferredScheme
{
    NoPreference = 'NoPreference',
    Light        = 'Light',
    Dark         = 'Dark',
}

// ── Viewport breakpoints ──────────────────────────────────────────────
//
// M3 baseline thresholds in dp (device-independent pixels — for mural
// today, equivalent to CSS pixels). Configurable in case an app needs
// different breakpoints; MediaWatcher reads the live values on every
// ResizeObserver tick.

export interface ViewportBreakpoints
{
    /** Strictly less than this width → Mobile. */
    readonly mobileMax: number;
    /** Less than this width and ≥ mobileMax → Tablet; else Desktop. */
    readonly tabletMax: number;
}

export const M3_BREAKPOINTS: ViewportBreakpoints = {
    mobileMax: 600,
    tabletMax: 840,
};

/** Pick a ViewportClass for the given width using the provided
 *  breakpoint thresholds. Pure — testable without a DOM. */
export function classifyViewport(width: number, bps: ViewportBreakpoints = M3_BREAKPOINTS): ViewportClass
{
    if (width <  bps.mobileMax) return ViewportClass.Mobile;
    if (width <  bps.tabletMax) return ViewportClass.Tablet;
    return ViewportClass.Desktop;
}
