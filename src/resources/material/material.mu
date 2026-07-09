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
    import MaterialLight from "./light.mu.js"
    import MaterialDark from "./dark.mu.js"
    import MuralBasic from "../basic.resources.mu.js"
    import MuralFramework from "../framework.resources.mu.js"
    schemes: [MaterialLight, MaterialDark]
    defaultScheme: MaterialLight
    dictionaries: [MuralBasic, MuralFramework]

    tokens {
        @Primary : Brush "Primary brand color"
        @OnPrimary : Brush "Text / icon over Primary"
        @PrimaryContainer : Brush
        @OnPrimaryContainer : Brush
        // KEEP (§18.7 audit) — pre-composed state-layer brushes, not raw M3
        // tokens. Consumed by the Slider template (hover/focus/drag) which
        // predates the @<Role>HoverLayer / @<Role>PressLayer overlay infra.
        // Retained until the Slider migrates to the overlay pattern; prefer
        // @PrimaryHoverLayer / @PrimaryPressLayer in new code.
        @PrimaryHover : Brush "Primary at hover state-layer"
        @PrimaryPress : Brush "Primary at pressed state-layer"
        @Secondary : Brush
        @OnSecondary : Brush
        @SecondaryContainer : Brush
        @OnSecondaryContainer : Brush
        @Tertiary : Brush
        @OnTertiary : Brush
        @TertiaryContainer : Brush
        @OnTertiaryContainer : Brush
        @Error : Brush
        @OnError : Brush
        @ErrorContainer : Brush
        @OnErrorContainer : Brush
        @Background : Brush
        @OnBackground : Brush
        @Surface : Brush "Default surface"
        @OnSurface : Brush "Text / icon over Surface"
        @SurfaceVariant : Brush
        @OnSurfaceVariant : Brush
        @SurfaceContainerLowest : Brush
        @SurfaceContainerLow : Brush
        @SurfaceContainer : Brush
        @SurfaceContainerHigh : Brush "Elevated surface tone"
        @SurfaceContainerHighest : Brush
        @Outline : Brush "1dp dividers + control outlines"
        @OutlineVariant : Brush
        @InverseSurface : Brush
        @InverseOnSurface : Brush
        @InversePrimary : Brush
        @SurfaceTint : Brush "Primary-tinted Surface for elevation tint"
        @Scrim : Brush "Modal overlay tint (drawer / dialog backdrop)"
        @Shadow : Brush
        @StateHoverOverlay : Brush "OnSurface @ 8% — hover state-layer"
        @StateFocusOverlay : Brush "OnSurface @ 12% — focus state-layer"
        @StatePressOverlay : Brush "OnSurface @ 12% — pressed state-layer"
        @StateHoverOpacity : number "0.08 — hover state-layer alpha"
        @StateFocusOpacity : number "0.12 — focus state-layer alpha"
        @StatePressOpacity : number "0.12 — pressed state-layer alpha"
        @StateDragOpacity : number "0.16 — dragging state-layer alpha"
        @OnPrimaryHoverLayer : Brush "OnPrimary @ 8% — Filled Button overlay"
        @OnPrimaryPressLayer : Brush "OnPrimary @ 12% — Filled Button overlay"
        @PrimaryHoverLayer : Brush "Primary @ 8% — Elevated/Outlined/Text/Standard overlay"
        @PrimaryPressLayer : Brush "Primary @ 12% — Elevated/Outlined/Text/Standard overlay"
        @OnSecondaryContainerHoverLayer : Brush "OnSecondaryContainer @ 8% — Tonal Button overlay"
        @OnSecondaryContainerPressLayer : Brush "OnSecondaryContainer @ 12% — Tonal Button overlay"
        @OnSurfaceVariantHoverLayer : Brush "OnSurfaceVariant @ 8% — Standard IconButton overlay (unchecked)"
        @OnSurfaceVariantPressLayer : Brush "OnSurfaceVariant @ 12% — Standard IconButton overlay (unchecked)"
        @OnPrimaryContainerHoverLayer : Brush "OnPrimaryContainer @ 8% — FloatingActionButton overlay"
        @OnPrimaryContainerPressLayer : Brush "OnPrimaryContainer @ 12% — FloatingActionButton overlay"
        @Spacing0 : number "0dp"
        @Spacing1 : number "4dp"
        @Spacing2 : number "8dp"
        @Spacing3 : number "12dp"
        @Spacing4 : number "16dp"
        @Spacing5 : number "20dp"
        @Spacing6 : number "24dp"
        @Spacing7 : number "28dp"
        @Spacing8 : number "32dp"
        @ListRowHeightCompact : number "28dp — Density.Compact"
        @ListRowHeightRegular : number "32dp — mural default"
        @ListRowHeightComfortable : number "40dp — Density.Comfortable"
        @ListRowHeightTouch : number "48dp — Pointer.Coarse touch target"
        @ListRowHeightTwoLine : number "64dp — headline + supporting text"
        @ListRowHeightThreeLine : number "88dp — headline + 2-line supporting text"
        @DisabledContainerOpacity : number "0.12 — disabled container alpha"
        @DisabledContentOpacity : number "0.38 — disabled content (text + icon) alpha"
        @ShapeNone : number "0dp — square corners"
        @ShapeExtraSmall : number "4dp"
        @ShapeSmall : number "8dp"
        @ShapeMedium : number "12dp"
        @ShapeLarge : number "16dp"
        @ShapeExtraLarge : number "28dp"
        @ShapeFull : CornerRadius "Fully rounded — clamped to min(W,H)/2 at render"
        @FontFamily : string "Default font family stack (= @TypefacePlain)"
        @TypefaceBrand : string "Brand typeface — used by Display / Headline / TitleLarge"
        @TypefacePlain : string "Plain typeface — used by Title S/M / Body / Label"
        @TypefaceWeightRegular : FontWeight "Regular weight (M3 = 400)"
        @TypefaceWeightMedium : FontWeight "Medium weight (M3 = 500)"
        @TypefaceWeightBold : FontWeight "Bold weight (M3 = 700)"
        @DisplayLargeFont : string "Display Large — brand typeface"
        @DisplayLargeWeight : FontWeight "Display Large — Regular"
        @DisplayLargeSize : number "Display Large — 57dp"
        @DisplayLargeLineHeight : number "Display Large — 64dp"
        @DisplayLargeTracking : number "Display Large — −0.25 letter-spacing"
        @DisplayMediumFont : string "Display Medium — brand typeface"
        @DisplayMediumWeight : FontWeight "Display Medium — Regular"
        @DisplayMediumSize : number "Display Medium — 45dp"
        @DisplayMediumLineHeight : number "Display Medium — 52dp"
        @DisplayMediumTracking : number "Display Medium — 0 letter-spacing"
        @DisplaySmallFont : string "Display Small — brand typeface"
        @DisplaySmallWeight : FontWeight "Display Small — Regular"
        @DisplaySmallSize : number "Display Small — 36dp"
        @DisplaySmallLineHeight : number "Display Small — 44dp"
        @DisplaySmallTracking : number "Display Small — 0 letter-spacing"
        @HeadlineLargeFont : string "Headline Large — brand typeface"
        @HeadlineLargeWeight : FontWeight "Headline Large — Regular"
        @HeadlineLargeSize : number "Headline Large — 32dp"
        @HeadlineLargeLineHeight : number "Headline Large — 40dp"
        @HeadlineLargeTracking : number "Headline Large — 0 letter-spacing"
        @HeadlineMediumFont : string "Headline Medium — brand typeface"
        @HeadlineMediumWeight : FontWeight "Headline Medium — Regular"
        @HeadlineMediumSize : number "Headline Medium — 28dp"
        @HeadlineMediumLineHeight : number "Headline Medium — 36dp"
        @HeadlineMediumTracking : number "Headline Medium — 0 letter-spacing"
        @HeadlineSmallFont : string "Headline Small — brand typeface"
        @HeadlineSmallWeight : FontWeight "Headline Small — Regular"
        @HeadlineSmallSize : number "Headline Small — 24dp"
        @HeadlineSmallLineHeight : number "Headline Small — 32dp"
        @HeadlineSmallTracking : number "Headline Small — 0 letter-spacing"
        @TitleLargeFont : string "Title Large — brand typeface"
        @TitleLargeWeight : FontWeight "Title Large — Regular"
        @TitleLargeSize : number "Title Large — 22dp"
        @TitleLargeLineHeight : number "Title Large — 28dp"
        @TitleLargeTracking : number "Title Large — 0 letter-spacing"
        @TitleMediumFont : string "Title Medium — plain typeface"
        @TitleMediumWeight : FontWeight "Title Medium — Medium"
        @TitleMediumSize : number "Title Medium — 16dp"
        @TitleMediumLineHeight : number "Title Medium — 24dp"
        @TitleMediumTracking : number "Title Medium — 0.15 letter-spacing"
        @TitleSmallFont : string "Title Small — plain typeface"
        @TitleSmallWeight : FontWeight "Title Small — Medium"
        @TitleSmallSize : number "Title Small — 14dp"
        @TitleSmallLineHeight : number "Title Small — 20dp"
        @TitleSmallTracking : number "Title Small — 0.1 letter-spacing"
        @BodyLargeFont : string "Body Large — plain typeface"
        @BodyLargeWeight : FontWeight "Body Large — Regular"
        @BodyLargeSize : number "Body Large — 16dp"
        @BodyLargeLineHeight : number "Body Large — 24dp"
        @BodyLargeTracking : number "Body Large — 0.5 letter-spacing"
        @BodyMediumFont : string "Body Medium — plain typeface"
        @BodyMediumWeight : FontWeight "Body Medium — Regular"
        @BodyMediumSize : number "Body Medium — 14dp"
        @BodyMediumLineHeight : number "Body Medium — 20dp"
        @BodyMediumTracking : number "Body Medium — 0.25 letter-spacing"
        @BodySmallFont : string "Body Small — plain typeface"
        @BodySmallWeight : FontWeight "Body Small — Regular"
        @BodySmallSize : number "Body Small — 12dp"
        @BodySmallLineHeight : number "Body Small — 16dp"
        @BodySmallTracking : number "Body Small — 0.4 letter-spacing"
        @LabelLargeFont : string "Label Large — plain typeface"
        @LabelLargeWeight : FontWeight "Label Large — Medium"
        @LabelLargeSize : number "Label Large — 14dp"
        @LabelLargeLineHeight : number "Label Large — 20dp"
        @LabelLargeTracking : number "Label Large — 0.1 letter-spacing"
        @LabelMediumFont : string "Label Medium — plain typeface"
        @LabelMediumWeight : FontWeight "Label Medium — Medium"
        @LabelMediumSize : number "Label Medium — 12dp"
        @LabelMediumLineHeight : number "Label Medium — 16dp"
        @LabelMediumTracking : number "Label Medium — 0.5 letter-spacing"
        @LabelSmallFont : string "Label Small — plain typeface"
        @LabelSmallWeight : FontWeight "Label Small — Medium"
        @LabelSmallSize : number "Label Small — 11dp"
        @LabelSmallLineHeight : number "Label Small — 16dp"
        @LabelSmallTracking : number "Label Small — 0.5 letter-spacing"
        // KEEP (§18.7 audit) — non-M3 framework extension (not in the M3
        // spec). Drives the Explorer-style marquee-selection adorner via
        // marquee-selection-behavior.ts (dynamic TryFindResource lookup, so
        // theme swaps re-paint live; a code-side fallback covers theme-less
        // hosts). Intentional first-class token, not pre-M3 cruft.
        @MarqueeFill : Brush "Marquee-selection rectangle fill"
        @MarqueeStroke : Brush "Marquee-selection rectangle stroke"
        @ElevationLevel0 : Effect "M3 elevation level 0 — flat (no shadow)"
        @ElevationLevel1 : Effect "M3 elevation level 1 — text buttons, search bars"
        @ElevationLevel2 : Effect "M3 elevation level 2 — cards, raised popups"
        @ElevationLevel3 : Effect "M3 elevation level 3 — FAB, app bars"
        @ElevationLevel4 : Effect "M3 elevation level 4 — navigation drawers"
        @ElevationLevel5 : Effect "M3 elevation level 5 — dialogs, modal sheets"
        // KEEP (§18.7 audit) — legacy naming aliases for @ElevationLevel1-5,
        // still referenced by 20+ call sites across framework templates
        // (@Elevation2 dominates: formatting, menu, ribbon, list, tooltips).
        // Migrating every site to @ElevationLevel* is a mechanical follow-up;
        // until then these keep one-milestone back-compat. Prefer
        // @ElevationLevel* in new code.
        @Elevation1 : Effect "Alias for @ElevationLevel1 (legacy)"
        @Elevation2 : Effect "Alias for @ElevationLevel2 (legacy)"
        @Elevation3 : Effect "Alias for @ElevationLevel3 (legacy)"
        @Elevation4 : Effect "Alias for @ElevationLevel4 (legacy)"
        @Elevation5 : Effect "Alias for @ElevationLevel5 (legacy)"
        @MotionDuration50 : number "50ms"
        @MotionDuration100 : number "100ms"
        @MotionDuration150 : number "150ms"
        @MotionDuration200 : number "200ms"
        @MotionDuration250 : number "250ms"
        @MotionDuration300 : number "300ms"
        @MotionDuration350 : number "350ms"
        @MotionDuration400 : number "400ms"
        @MotionDuration450 : number "450ms"
        @MotionDuration500 : number "500ms"
        @MotionDuration550 : number "550ms"
        @MotionDuration600 : number "600ms"
        @MotionDuration700 : number "700ms"
        @MotionDuration800 : number "800ms"
        @MotionDuration900 : number "900ms"
        @MotionDuration1000 : number "1000ms"
        @MotionEasingLinear : EasingFunction "Linear (cubic 0,0,1,1)"
        @MotionEasingStandard : EasingFunction "Standard (cubic 0.2,0,0,1)"
        @MotionEasingStandardAccelerate : EasingFunction "Standard Accelerate (cubic 0.3,0,1,1)"
        @MotionEasingStandardDecelerate : EasingFunction "Standard Decelerate (cubic 0,0,0,1)"
        @MotionEasingEmphasized : EasingFunction "Emphasized (cubic 0.2,0,0,1)"
        @MotionEasingEmphasizedAccelerate : EasingFunction "Emphasized Accelerate (cubic 0.3,0,0.8,0.15)"
        @MotionEasingEmphasizedDecelerate : EasingFunction "Emphasized Decelerate (cubic 0.05,0.7,0.1,1)"
    }
    // ── Primary tier ────────────────────────────────────────────

    // ── Secondary tier ──────────────────────────────────────────

    // ── Tertiary tier ───────────────────────────────────────────

    // ── Error tier ──────────────────────────────────────────────

    // ── Background / surface ────────────────────────────────────

    // ── M3 surface containers (elevation tinting) ───────────────

    // ── Outline ─────────────────────────────────────────────────

    // ── Inverse / overlays ──────────────────────────────────────

    // ── Surface tint — composited over Surface at the elevation
    //                    level the chrome wants to suggest. M3 uses
    //                    Primary at a tone to encode height; mural
    //                    consumers can composite manually if they
    //                    want the M3 tinting without a real shadow.

    // ── Scrim / shadow / state overlays ─────────────────────────

    // ── State-layer raw opacities ───────────────────────────────
    // M3 spec: hover 8%, focus 12%, press 12%, drag 16%. The
    // pre-composed @State*Overlay brushes above bake OnSurface at
    // these alphas; the raw numbers here let templates layer the
    // overlay over an arbitrary base (e.g., OnPrimary instead of
    // OnSurface) without re-deriving the alpha.

    // ── Per-ink-role state-layer brushes ────────────────────────
    // Strict M3 state-layer chrome composites a translucent overlay
    // whose colour matches the foreground (ink) over the base
    // container. Variant templates inject a `PART_StateLayer` Border
    // whose Background flips through these tokens on hover/press —
    // the visual result is the M3 reference implementation's
    // "Primary container + OnPrimary @ 8%" stack rather than the
    // legacy pre-composed `@PrimaryHover` single-brush approximation.

    // ── Spacing scale — M3 4dp grid ─────────────────────────────
    // M3 component specs are written against a 4dp baseline. These
    // tokens replace literal numbers inside Padding / Margin tuples
    // so a theme that wants tighter or looser global rhythm can
    // re-bind the whole scale at the dictionary level. Naming follows
    // the dp-step convention used by Material Symbols and Web M3.

    // ── List row heights — M3 list spec ─────────────────────────
    // Per https://m3.material.io/components/lists/specs the M3 list
    // row is 56dp at the "comfortable" 1-line variant; mural's
    // tightened defaults stay 32dp at Regular density so existing
    // demos don't grow vertically without consent. Density triggers
    // on each row template lerp through the four heights.

    // ── Disabled state opacities — M3 spec ──────────────────────
    // M3 disabled-state guidance: container ink dims to 12%, content
    // ink (text + leading/trailing icons) dims to 38%. Templates
    // apply these via `when (not IsEnabled)` triggers that drop the
    // Opacity on the relevant Visual. Tokens keep the values
    // overridable per-theme.

    // ── Shape ───────────────────────────────────────────────────

    // ── Typography family ───────────────────────────────────────

    // ── Typography type-scale atoms (15 roles × 5 atoms = 75) ───
    // Atoms let a template author override one slot (e.g. flip the
    // body family without restating the size and line-height) by
    // re-binding the matching @-token. The role Styles in
    // typography.mu read these via @-lookup so a single token swap
    // ripples through every consumer.

    // ── Selection / marquee colors ──────────────────────────────

    // ── Elevation (composed by scheme via MaterialElevationEffect)
    // M3 v2024 numbering: Level0 is "resting / flat" (no shadow),
    // Level5 is the deepest. Existing @Elevation1-@Elevation5
    // aliases below keep one-milestone backwards compat.

    // ── Motion durations (16 ms steps) ──────────────────────────
    // M3 spec lists 50ms-1000ms ramps to cover micro-interactions
    // (50-200ms), state changes (200-500ms), and full screen
    // transitions (500-1000ms). All identical across light/dark.

    // ── Motion easings (M3 standard + emphasized curve families) ─
}
