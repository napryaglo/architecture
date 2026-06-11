// Material 3 theme bundle for µ-mural.
//
// Declarative replacement for the hand-written `material.ts`. The
// compiler emits a `Material` class extending `Theme` with:
//   * static Catalog        — token contract authored in the
//                             `tokens { … }` block below
//   * static DefaultScheme  — the class reference of the default scheme
//   * static instance       — singleton
//   * static Activate(s?)   — flips the active scheme on ThemeManager
//
// Module-load side effects: registers the singleton with ThemeManager
// (so RegisterTheme is automatic) and enrols Material as the default
// theme on Application (so `app.initialize()` with no args picks it up).
//
// Authoring a custom theme follows the same shape: import the schemes,
// list them in the `schemes:` header, point `defaultScheme:` at one,
// and declare the `tokens { … }` contract. The compiler does the rest.

theme Material {
    import MaterialLight  from "./light.mu.js"
    import MaterialDark   from "./dark.mu.js"
    import MuralBasic     from "../basic.resources.mu.js"
    import MuralFramework from "../framework.resources.mu.js"

    schemes:       [MaterialLight, MaterialDark]
    defaultScheme: MaterialLight
    dictionaries:  [MuralBasic, MuralFramework]

    tokens {
        // ── Primary tier ────────────────────────────────────────────
        @Primary              : Brush "Primary brand color"
        @OnPrimary            : Brush "Text / icon over Primary"
        @PrimaryContainer     : Brush
        @OnPrimaryContainer   : Brush
        @PrimaryHover         : Brush "Primary at hover state-layer"
        @PrimaryPress         : Brush "Primary at pressed state-layer"

        // ── Secondary tier ──────────────────────────────────────────
        @Secondary            : Brush
        @OnSecondary          : Brush
        @SecondaryContainer   : Brush
        @OnSecondaryContainer : Brush

        // ── Tertiary tier ───────────────────────────────────────────
        @Tertiary             : Brush
        @OnTertiary           : Brush
        @TertiaryContainer    : Brush
        @OnTertiaryContainer  : Brush

        // ── Error tier ──────────────────────────────────────────────
        @Error                : Brush
        @OnError              : Brush
        @ErrorContainer       : Brush
        @OnErrorContainer     : Brush

        // ── Background / surface ────────────────────────────────────
        @Background           : Brush
        @OnBackground         : Brush
        @Surface              : Brush "Default surface"
        @OnSurface            : Brush "Text / icon over Surface"
        @SurfaceVariant       : Brush
        @OnSurfaceVariant     : Brush

        // ── M3 surface containers (elevation tinting) ───────────────
        @SurfaceContainerLowest  : Brush
        @SurfaceContainerLow     : Brush
        @SurfaceContainer        : Brush
        @SurfaceContainerHigh    : Brush "Elevated surface tone"
        @SurfaceContainerHighest : Brush

        // ── Outline ─────────────────────────────────────────────────
        @Outline              : Brush "1dp dividers + control outlines"
        @OutlineVariant       : Brush

        // ── Inverse / overlays ──────────────────────────────────────
        @InverseSurface       : Brush
        @InverseOnSurface     : Brush
        @InversePrimary       : Brush

        // ── Scrim / shadow / state overlays ─────────────────────────
        @Scrim                : Brush "Modal overlay tint (drawer / dialog backdrop)"
        @Shadow               : Brush
        @StateHoverOverlay    : Brush "OnSurface @ 8% — hover state-layer"
        @StateFocusOverlay    : Brush "OnSurface @ 12% — focus state-layer"
        @StatePressOverlay    : Brush "OnSurface @ 12% — pressed state-layer"

        // ── Shape ───────────────────────────────────────────────────
        @ShapeExtraSmall      : number "4dp"
        @ShapeSmall           : number "8dp"
        @ShapeMedium          : number "12dp"
        @ShapeLarge           : number "16dp"
        @ShapeExtraLarge      : number "28dp"
        @ShapeFull            : CornerRadius "Fully rounded — clamped to min(W,H)/2 at render"

        // ── Typography family ───────────────────────────────────────
        @FontFamily           : string "Default font family stack"

        // ── Selection / marquee colors ──────────────────────────────
        @MarqueeFill          : Brush "Marquee-selection rectangle fill"
        @MarqueeStroke        : Brush "Marquee-selection rectangle stroke"

        // ── Elevation (composed by scheme via MaterialElevationEffect)
        @Elevation1           : Effect "M3 elevation level 1"
        @Elevation2           : Effect "M3 elevation level 2"
        @Elevation3           : Effect "M3 elevation level 3"
        @Elevation4           : Effect "M3 elevation level 4"
        @Elevation5           : Effect "M3 elevation level 5"
    }
}
