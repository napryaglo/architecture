import { Color, Theme, ThemeManager, defineScheme, defineTheme } from '../../runtime/index.js';
import type { ResourceDictionary, Scheme, TokenCatalog } from '../../runtime/index.js';
import { MaterialElevationEffect, SolidColorBrush } from '../../visual-engine/index.js';
import { LightPalette } from '../../../build/framework/material/light.mu.js';
import { DarkPalette }  from '../../../build/framework/material/dark.mu.js';
import { Typography }   from '../../../build/framework/material/typography.mu.js';

// Material 3 theme registration for µ-mural.
//
// Two-level architecture (see theme-architecture.md):
//   * Material is a Theme — the structural design language. Owns the
//     token catalog (what tokens exist + their types) and the control
//     templates / default styles (currently delivered via the existing
//     ensureControlsTheme / ensureSurfaceTheme factories — moving them
//     into Theme.templates is a follow-up).
//   * `light` and `dark` are Schemes — pure token-value dictionaries
//     declared against the Material Theme. Each Scheme provides values
//     for every token in the catalog. `Typography` tokens ride a third
//     scheme-agnostic dict that doesn't swap with the colour scheme.
//
// SetTheme('light' | 'dark') survives as a convenience alias for
// `ThemeManager.Current.ActivateScheme(name)` — existing demo bootstrap
// code keeps working unchanged.
//
// Token-name authority: see light.mu / dark.mu. The token names mirror
// the M3 spec verbatim.

export type MaterialThemeName = 'light' | 'dark';

// ── Token catalog ─────────────────────────────────────────────────────
// Hand-declared for now. The full vision (see theme-architecture.md)
// has the compiler emit this from a `tokens { … }` block in the theme
// bundle's `.template.mu`; until that grammar lands, the catalog lives
// here as a literal Map.
//
// Schemes that fail to provide every token in this catalog get rejected
// by ThemeManager.RegisterTheme at registration time. Types are
// authoritative — the runtime doesn't type-check values today (the
// compiler does that at build time once contract validation lands), but
// the type strings serve as documentation now and as the contract later.
function buildCatalog(): TokenCatalog
{
    const c = new Map<string, { type: string; description?: string }>();

    // Primary tier
    c.set('Primary',              { type: 'Brush', description: 'Primary brand color' });
    c.set('OnPrimary',            { type: 'Brush', description: 'Text / icon over Primary' });
    c.set('PrimaryContainer',     { type: 'Brush' });
    c.set('OnPrimaryContainer',   { type: 'Brush' });
    c.set('PrimaryHover',         { type: 'Brush', description: 'Primary at hover state-layer' });
    c.set('PrimaryPress',         { type: 'Brush', description: 'Primary at pressed state-layer' });

    // Secondary tier
    c.set('Secondary',            { type: 'Brush' });
    c.set('OnSecondary',          { type: 'Brush' });
    c.set('SecondaryContainer',   { type: 'Brush' });
    c.set('OnSecondaryContainer', { type: 'Brush' });

    // Tertiary tier
    c.set('Tertiary',             { type: 'Brush' });
    c.set('OnTertiary',           { type: 'Brush' });
    c.set('TertiaryContainer',    { type: 'Brush' });
    c.set('OnTertiaryContainer',  { type: 'Brush' });

    // Error tier
    c.set('Error',                { type: 'Brush' });
    c.set('OnError',              { type: 'Brush' });
    c.set('ErrorContainer',       { type: 'Brush' });
    c.set('OnErrorContainer',     { type: 'Brush' });

    // Background / surface
    c.set('Background',           { type: 'Brush' });
    c.set('OnBackground',         { type: 'Brush' });
    c.set('Surface',              { type: 'Brush', description: 'Default surface' });
    c.set('OnSurface',            { type: 'Brush', description: 'Text / icon over Surface' });
    c.set('SurfaceVariant',       { type: 'Brush' });
    c.set('OnSurfaceVariant',     { type: 'Brush' });

    // M3 Surface containers (elevation tinting)
    c.set('SurfaceContainerLowest',  { type: 'Brush' });
    c.set('SurfaceContainerLow',     { type: 'Brush' });
    c.set('SurfaceContainer',        { type: 'Brush' });
    c.set('SurfaceContainerHigh',    { type: 'Brush', description: 'Elevated surface tone' });
    c.set('SurfaceContainerHighest', { type: 'Brush' });

    // Outline
    c.set('Outline',              { type: 'Brush', description: '1dp dividers + control outlines' });
    c.set('OutlineVariant',       { type: 'Brush' });

    // Inverse / overlays
    c.set('InverseSurface',       { type: 'Brush' });
    c.set('InverseOnSurface',     { type: 'Brush' });
    c.set('InversePrimary',       { type: 'Brush' });

    // Scrim / shadow / state overlays
    c.set('Scrim',                { type: 'Brush', description: 'Modal overlay tint (drawer / dialog backdrop)' });
    c.set('Shadow',               { type: 'Brush' });
    c.set('StateHoverOverlay',    { type: 'Brush', description: 'OnSurface @ 8% — hover state-layer' });
    c.set('StateFocusOverlay',    { type: 'Brush', description: 'OnSurface @ 12% — focus state-layer' });
    c.set('StatePressOverlay',    { type: 'Brush', description: 'OnSurface @ 12% — pressed state-layer' });

    // Shape
    c.set('ShapeExtraSmall',      { type: 'CornerRadius | number', description: '4dp' });
    c.set('ShapeSmall',           { type: 'CornerRadius | number', description: '8dp' });
    c.set('ShapeMedium',          { type: 'CornerRadius | number', description: '12dp' });
    c.set('ShapeLarge',           { type: 'CornerRadius | number', description: '16dp' });
    c.set('ShapeExtraLarge',      { type: 'CornerRadius | number', description: '28dp' });
    c.set('ShapeFull',            { type: 'CornerRadius | number', description: 'Fully rounded — clamped to min(W,H)/2 at render' });

    // Typography family (token; the full Typography value type is Slice 5)
    c.set('FontFamily',           { type: 'string', description: 'Default font family stack' });

    // Selection / marquee colors (used by ListBox / TreeView / Diagram marquee selection)
    c.set('MarqueeFill',          { type: 'Brush', description: 'Marquee-selection rectangle fill' });
    c.set('MarqueeStroke',        { type: 'Brush', description: 'Marquee-selection rectangle stroke' });

    // Elevation (composed at activation time — Effect-shape, M3 dual shadow per level)
    c.set('Elevation1',           { type: 'Effect', description: 'M3 elevation level 1' });
    c.set('Elevation2',           { type: 'Effect', description: 'M3 elevation level 2' });
    c.set('Elevation3',           { type: 'Effect', description: 'M3 elevation level 3' });
    c.set('Elevation4',           { type: 'Effect', description: 'M3 elevation level 4' });
    c.set('Elevation5',           { type: 'Effect', description: 'M3 elevation level 5' });

    return c;
}

// Extract { key: value } pairs from a compiled `.mu` ResourceDictionary
// subclass so they can flow into a Scheme's token map. The .mu files
// use string keys for every `@Token` they declare.
function tokensFromDict(dict: ResourceDictionary): Map<string, unknown>
{
    const m = new Map<string, unknown>();
    for (const [k, v] of dict.Entries())
    {
        if (typeof k === 'string') m.set(k, v);
    }
    return m;
}

// Elevation tokens — composed at module load (same shape across schemes
// for now; Slice 5 will fold these into per-scheme typography +
// elevation-tint composition). Folded into each Scheme's token dict.
function elevationTokens(): Map<string, unknown>
{
    const m = new Map<string, unknown>();
    m.set('Elevation1', new MaterialElevationEffect(1));
    m.set('Elevation2', new MaterialElevationEffect(2));
    m.set('Elevation3', new MaterialElevationEffect(3));
    m.set('Elevation4', new MaterialElevationEffect(4));
    m.set('Elevation5', new MaterialElevationEffect(5));
    return m;
}

// Build the Scheme value object for one palette + optional extras
// (Typography + Elevation merged in so every token in the catalog is
// covered). Used once per scheme at module load.
function buildScheme(name: MaterialThemeName, palette: ResourceDictionary): Scheme
{
    const tokens = new Map<string, unknown>();
    // Order matters where keys overlap, but palette / typography /
    // elevation never share keys in practice. Last-write-wins is fine.
    for (const [k, v] of tokensFromDict(palette))                 tokens.set(k, v);
    for (const [k, v] of tokensFromDict(Typography.Clone()))      tokens.set(k, v);
    for (const [k, v] of elevationTokens())                       tokens.set(k, v);
    // Selection / marquee defaults — same in both schemes for now;
    // when the marquee colours need theme-specific tuning they move
    // into light.mu / dark.mu.
    if (!tokens.has('MarqueeFill'))   tokens.set('MarqueeFill',   defaultMarqueeFill());
    if (!tokens.has('MarqueeStroke')) tokens.set('MarqueeStroke', defaultMarqueeStroke());
    return defineScheme({ name, theme: 'material', tokens });
}

// Cached at module load — same value across both schemes for now.
// Used as a fallback when the palette doesn't declare MarqueeFill /
// MarqueeStroke (they'll move into light.mu / dark.mu when the
// marquee colours need theme-specific tuning).
const _marqueeFill   = new SolidColorBrush(Color.FromHex('#3699cc33'));
const _marqueeStroke = new SolidColorBrush(Color.FromHex('#3699cc'));
function defaultMarqueeFill():   unknown { return _marqueeFill; }
function defaultMarqueeStroke(): unknown { return _marqueeStroke; }

// ── Theme + Scheme registration ───────────────────────────────────────

let _theme: Theme | undefined;

// Idempotent — multiple imports / multi-app tests can call this; we
// register the Theme exactly once with ThemeManager.
function ensureRegistered(): Theme
{
    if (_theme !== undefined) return _theme;

    const light = buildScheme('light', LightPalette.Clone());
    const dark  = buildScheme('dark',  DarkPalette.Clone());

    _theme = defineTheme({
        name:           'material',
        // Templates flow through the existing
        // ensureControlsTheme / ensureSurfaceTheme factory mechanism —
        // moving them into Theme.templates is a follow-up. Activating
        // the Material theme just swaps token dicts for now.
        templates:      [],
        catalog:        buildCatalog(),
        schemes:        [light, dark],
        defaultScheme:  'light',
    });

    // Register with the global ThemeManager. RegisterTheme validates
    // every scheme against the catalog — typos and missing tokens
    // surface here.
    const mgr = ThemeManager.Current;
    if (mgr.GetTheme('material') === undefined)
    {
        mgr.RegisterTheme(_theme);
    }
    return _theme;
}

// Switch Material to `theme`. Idempotent. Must be called AFTER an
// Application is constructed (so Application.current is defined).
export function SetTheme(theme: MaterialThemeName): void
{
    ensureRegistered();
    const mgr = ThemeManager.Current;
    if (mgr.ActiveTheme === undefined)
    {
        mgr.ActivateTheme('material', { scheme: theme });
    }
    else if (mgr.ActiveTheme.name !== 'material')
    {
        mgr.ActivateTheme('material', { scheme: theme });
    }
    else
    {
        mgr.ActivateScheme(theme);
    }
}

export function CurrentTheme(): MaterialThemeName | undefined
{
    const s = ThemeManager.Current.ActiveScheme;
    if (s === undefined) return undefined;
    if (s.name === 'light' || s.name === 'dark') return s.name;
    return undefined;
}

export function ToggleTheme(): MaterialThemeName
{
    const next: MaterialThemeName = CurrentTheme() === 'light' ? 'dark' : 'light';
    SetTheme(next);
    return next;
}
