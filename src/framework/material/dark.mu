// Material 3 dark-mode token palette.
//
// Mirror of light.mu — same keys, dark-scheme values. See light.mu for
// the rationale on token names and brush identity. Swapping this
// dictionary in for the light one via Material.SetTheme('dark')
// flips every dependent template through the `@key` DynamicResource
// bindings.

resources DarkPalette {

    // ── Primary tier ────────────────────────────────────────────────
    @Primary              = #D0BCFF
    @OnPrimary            = #381E72
    @PrimaryContainer     = #4F378B
    @OnPrimaryContainer   = #EADDFF
    // Precomputed Primary + OnPrimary state layers (8% / 12%) —
    // see light.mu Primary block for the rationale.
    @PrimaryHover         = #C4AFF4
    @PrimaryPress         = #BEA9EE

    // ── Secondary tier ──────────────────────────────────────────────
    @Secondary            = #CCC2DC
    @OnSecondary          = #332D41
    @SecondaryContainer   = #4A4458
    @OnSecondaryContainer = #E8DEF8

    // ── Tertiary tier ───────────────────────────────────────────────
    @Tertiary             = #EFB8C8
    @OnTertiary           = #492532
    @TertiaryContainer    = #633B48
    @OnTertiaryContainer  = #FFD8E4

    // ── Error tier ──────────────────────────────────────────────────
    @Error                = #F2B8B5
    @OnError              = #601410
    @ErrorContainer       = #8C1D18
    @OnErrorContainer     = #F9DEDC

    // ── Background / Surface ────────────────────────────────────────
    @Background           = #1C1B1F
    @OnBackground         = #E6E1E5
    @Surface              = #1C1B1F
    @OnSurface            = #E6E1E5
    @SurfaceVariant       = #49454F
    @OnSurfaceVariant     = #CAC4D0

    // ── M3 Surface containers (elevation tinting) ───────────────────
    @SurfaceContainerLowest  = #0F0D13
    @SurfaceContainerLow     = #1D1B20
    @SurfaceContainer        = #211F26
    @SurfaceContainerHigh    = #2B2930
    @SurfaceContainerHighest = #36343B

    // ── Outline / dividers ──────────────────────────────────────────
    @Outline              = #938F99
    @OutlineVariant       = #49454F

    // ── Inverse / dark-on-light overlays ────────────────────────────
    @InverseSurface       = #E6E1E5
    @InverseOnSurface     = #313033
    @InversePrimary       = #6750A4

    // ── Scrim / shadow tint ─────────────────────────────────────────
    // See light.mu for the @Scrim contract — 50% black for now.
    @Scrim                = #00000080
    @Shadow               = #000000

    // ── State-layer overlay colours ─────────────────────────────────
    // Dark scheme uses OnSurface (light ink) over the surface, same
    // opacities as light.
    @StateHoverOverlay    = #E6E1E514   // OnSurface @ 8%
    @StateFocusOverlay    = #E6E1E51F   // OnSurface @ 12%
    @StatePressOverlay    = #E6E1E51F   // OnSurface @ 12%

    // ── Shape (corner radii — identical across schemes) ─────────────
    // See light.mu for the @ShapeFull contract.
    @ShapeExtraSmall      = 4
    @ShapeSmall           = 8
    @ShapeMedium          = 12
    @ShapeLarge           = 16
    @ShapeExtraLarge      = 28
    @ShapeFull            = CornerRadius.Full

    // ── Typography family (identical across schemes) ────────────────
    @FontFamily           = "system-ui, sans-serif"

    // ── Selection / marquee colors ──────────────────────────────────
    // See light.mu for the consumer wiring. Dark-mode keeps the same
    // M3 cyan accent for now; can specialise later if M3 publishes a
    // dark-specific accent for marquee tooling.
    @MarqueeFill          = #3699cc33
    @MarqueeStroke        = #3699cc
}
