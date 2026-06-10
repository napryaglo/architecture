// Material 3 light-mode token palette.
//
// Reference values derived from the M3 "baseline" scheme (purple seed
// at tone 40). Token names mirror the M3 spec verbatim
// (https://m3.material.io/styles/color/the-color-system/tokens) so a
// reader who knows M3 can map straight across without translation.
//
// Templates consume these via `@Primary`, `@Surface`, etc. — `@key` is
// dynamic (see compiler.ts static-resource emit), so swapping this
// dictionary out for `dark.mu` at runtime re-paints every dependent
// property without rebuilding any visual.
//
// Brush identity: each `#hex = SolidColorBrush` allocation is paid
// once at theme registration. Templates that need the brush at
// runtime (e.g. trigger-driven Background swaps) read it back through
// the same dictionary lookup, so identity is preserved across uses.

resources LightPalette {

    // ── Primary tier ────────────────────────────────────────────────
    @Primary              = #6750A4
    @OnPrimary            = #FFFFFF
    @PrimaryContainer     = #EADDFF
    @OnPrimaryContainer   = #21005D
    // Precomputed Primary + OnPrimary state layers at 8% / 12% —
    // M3 Filled Button hover / pressed colours. Used until the
    // dedicated state-layer overlay infrastructure lands; once it
    // does, these tokens move to template-side overlays driven
    // by hover/press triggers.
    @PrimaryHover         = #735EAB
    @PrimaryPress         = #7A65AF

    // ── Secondary tier ──────────────────────────────────────────────
    @Secondary            = #625B71
    @OnSecondary          = #FFFFFF
    @SecondaryContainer   = #E8DEF8
    @OnSecondaryContainer = #1D192B

    // ── Tertiary tier ───────────────────────────────────────────────
    @Tertiary             = #7D5260
    @OnTertiary           = #FFFFFF
    @TertiaryContainer    = #FFD8E4
    @OnTertiaryContainer  = #31111D

    // ── Error tier ──────────────────────────────────────────────────
    @Error                = #B3261E
    @OnError              = #FFFFFF
    @ErrorContainer       = #F9DEDC
    @OnErrorContainer     = #410E0B

    // ── Background / Surface ────────────────────────────────────────
    @Background           = #FFFBFE
    @OnBackground         = #1C1B1F
    @Surface              = #FFFBFE
    @OnSurface            = #1C1B1F
    @SurfaceVariant       = #E7E0EC
    @OnSurfaceVariant     = #49454F

    // ── M3 Surface containers (elevation tinting) ───────────────────
    @SurfaceContainerLowest  = #FFFFFF
    @SurfaceContainerLow     = #F7F2FA
    @SurfaceContainer        = #F3EDF7
    @SurfaceContainerHigh    = #ECE6F0
    @SurfaceContainerHighest = #E6E0E9

    // ── Outline / dividers ──────────────────────────────────────────
    @Outline              = #79747E
    @OutlineVariant       = #CAC4D0

    // ── Inverse / dark-on-light overlays ────────────────────────────
    @InverseSurface       = #313033
    @InverseOnSurface     = #F4EFF4
    @InversePrimary       = #D0BCFF

    // ── Scrim / shadow tint ─────────────────────────────────────────
    @Scrim                = #000000
    @Shadow               = #000000

    // ── State-layer overlay colours ─────────────────────────────────
    // Material 3 state layers tint the parent at low opacity. The
    // alpha-encoded hex values let templates reference one token per
    // state and skip the per-overlay alpha math.
    @StateHoverOverlay    = #1C1B1F14   // OnSurface @ 8%
    @StateFocusOverlay    = #1C1B1F1F   // OnSurface @ 12%
    @StatePressOverlay    = #1C1B1F1F   // OnSurface @ 12%

    // ── Shape (corner radii — M3 shape scale) ───────────────────────
    // Numeric tokens consumed via Border.CornerRadius = @ShapeMedium etc.
    // `Full` is the M3 "fully rounded" shape family — Border's render
    // path recognises CornerRadius.Full (Number.POSITIVE_INFINITY) and
    // clamps to min(width, height)/2, so a square button becomes a
    // circle and a wide one becomes a stadium / pill.
    @ShapeExtraSmall      = 4
    @ShapeSmall           = 8
    @ShapeMedium          = 12
    @ShapeLarge           = 16
    @ShapeExtraLarge      = 28
    @ShapeFull            = CornerRadius.Full

    // ── Typography family ───────────────────────────────────────────
    // Material 3 baseline is Roboto, but loading a web-font ships a
    // network request + a layout-stability hazard, so the token ships
    // the OS-system stack. Hosts that want Roboto override this token
    // at Application.Resources level (or merge a custom dict) and the
    // change reaches every TextBlock via Theme.fontFamily.
    @FontFamily           = "system-ui, sans-serif"
}
