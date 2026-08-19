// Default theme entries for the buttons family — the primary
// click-surface set: Button (the M3 baseline, 5 variants),
// IconButton (square 40×40 glyph button, 4 variants),
// IconButtonToggle (IconButton + IsChecked, 4 variants),
// FloatingActionButton (4 sizes), plus the chrome-less
// ToggleButton and FabMenu (which composes FAB instances).
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Buttons {
    // ── Button: variant-driven Material 3 chrome ───────────────────
    // Five M3 button variants, one ControlTemplate per variant. The
    // default Button Style sets the Filled template as a baseline,
    // then a property-trigger chain on the Variant DP swaps in the
    // variant-specific template. The IsMouseOver / IsPressed colour
    // swaps live INSIDE each template (each variant has its own
    // state colours), so the trigger graph stays one level deep.
    //
    // PART_Border is the rounded surface; ContentPresenter is
    // discovered by ControlTemplate.Apply's first-presenter walk.
    // Tokens come from the Material palette merged onto
    // Application.Resources at startup; SetTheme('light'|'dark') swaps
    // every dependent colour through the DynamicResource bindings.

    // Filled — the M3 baseline, also the historical mural default.
    // Resting: @Primary container + @OnPrimary ink (LabelLarge, weight
    // Medium = 500).
    // State layer: a translucent @OnPrimary overlay composited via
    // PART_StateLayer (the inner Border). Hover = @OnPrimaryHoverLayer
    // (8% alpha), pressed = @OnPrimaryPressLayer (12%) — matches the
    // M3 reference implementation pattern (container colour stays
    // constant; the ink-colour overlay carries the state tint).
    // TextBlock.Foreground / FontWeight are cross-class attached writes
    // on PART_Border that cascade down to the descendant TextBlock in
    // the Content via the standard inheritance walk.
    Template x:key="DefaultFilledButton" [TargetType = Button] {
        Border x:name="PART_Border"
            [ Fill           = @Primary,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              TextBlock.Foreground = @OnPrimary,
              TextBlock.FontFamily = @LabelLargeFont,
              TextBlock.FontWeight = @LabelLargeWeight,
              TextBlock.FontSize = @LabelLargeSize,
              TextBlock.LineHeight = @LabelLargeLineHeight,
              TextBlock.LetterSpacing = @LabelLargeTracking ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (24,10,24,10) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnPrimaryHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnPrimaryPressLayer; }
        // Adaptive layout — Compact tightens, Comfortable loosens,
        // Coarse pointer bumps the touch target. Padding lives on the
        // state layer so its hit area matches the painted chrome.
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (16,6,16,6); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (28,12,28,12); }
        when ( ThemeManager.Pointer = Coarse ) { PART_StateLayer.Padding = (24,14,24,14); }
    }

    // Elevated — surface-tinted base, @Primary text, elevation Level1
    // at rest. Hover bumps to Level2; pressed lowers to Level1 so the
    // press feedback is recession + colour both. The state layer is
    // tinted @Primary (the ink) per M3 spec.
    Template x:key="DefaultElevatedButton" [TargetType = Button] {
        Border x:name="PART_Border"
            [ Fill           = @SurfaceContainerLow,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              Effect               = @ElevationLevel1,
              TextBlock.Foreground = @Primary,
              TextBlock.FontFamily = @LabelLargeFont,
              TextBlock.FontWeight = @LabelLargeWeight,
              TextBlock.FontSize = @LabelLargeSize,
              TextBlock.LineHeight = @LabelLargeLineHeight,
              TextBlock.LetterSpacing = @LabelLargeTracking ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (24,10,24,10) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Fill = @PrimaryHoverLayer;
            PART_Border.Effect = @ElevationLevel2;
        }
        when ( IsPressed ) {
            PART_StateLayer.Fill = @PrimaryPressLayer;
            PART_Border.Effect = @ElevationLevel1;
        }
    }

    // Tonal (Filled Tonal) — @SecondaryContainer base, @OnSecondaryContainer
    // text. Sits between Filled (high emphasis) and Outlined (low) in
    // the M3 emphasis hierarchy. State layer tinted @OnSecondaryContainer.
    Template x:key="DefaultTonalButton" [TargetType = Button] {
        Border x:name="PART_Border"
            [ Fill           = @SecondaryContainer,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              TextBlock.Foreground = @OnSecondaryContainer,
              TextBlock.FontFamily = @LabelLargeFont,
              TextBlock.FontWeight = @LabelLargeWeight,
              TextBlock.FontSize = @LabelLargeSize,
              TextBlock.LineHeight = @LabelLargeLineHeight,
              TextBlock.LetterSpacing = @LabelLargeTracking ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (24,10,24,10) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSecondaryContainerHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSecondaryContainerPressLayer; }
    }

    // Outlined — transparent surface, 1-DIP outline, @Primary text.
    // State layer is @Primary-tinted (matches the ink) so the press
    // feedback reads as the button's own colour pulse, not a generic
    // surface tint.
    Template x:key="DefaultOutlinedButton" [TargetType = Button] {
        Border x:name="PART_Border"
            [ Fill           = #00000000,
              Stroke          = Pen [ Brush = @Outline ],
              BorderThickness      = (1),
              CornerRadius         = $$CornerRadius,
              TextBlock.Foreground = @Primary,
              TextBlock.FontFamily = @LabelLargeFont,
              TextBlock.FontWeight = @LabelLargeWeight,
              TextBlock.FontSize = @LabelLargeSize,
              TextBlock.LineHeight = @LabelLargeLineHeight,
              TextBlock.LetterSpacing = @LabelLargeTracking ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (23,9,23,9) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @PrimaryHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @PrimaryPressLayer; }
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (15,5,15,5); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (27,11,27,11); }
        when ( ThemeManager.Pointer = Coarse ) { PART_StateLayer.Padding = (23,13,23,13); }
        // High-contrast a11y — thicker outline so the chrome reads
        // even when the surface tint is muted.
        when ( ThemeManager.PrefersContrast = More ) { PART_Border.BorderThickness = (2); }
    }

    // Text — fully transparent base, no chrome at rest, @Primary text.
    // State layer is @Primary-tinted. Tighter padding than the other
    // variants matches the M3 spec.
    Template x:key="DefaultTextButton" [TargetType = Button] {
        Border x:name="PART_Border"
            [ Fill           = #00000000,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              TextBlock.Foreground = @Primary,
              TextBlock.FontFamily = @LabelLargeFont,
              TextBlock.FontWeight = @LabelLargeWeight,
              TextBlock.FontSize = @LabelLargeSize,
              TextBlock.LineHeight = @LabelLargeLineHeight,
              TextBlock.LetterSpacing = @LabelLargeTracking ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (12,10,12,10) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @PrimaryHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @PrimaryPressLayer; }
    }

    // Default Style — picks the template by Variant via property
    // triggers. Filled is the baseline (the Setter); each non-Filled
    // variant rides its own trigger to swap Template. Setting Variant
    // at construction time or via a later set both flow through the
    // same trigger pipeline.
    Style [TargetType = Button] {
        // Rounded-rect default (@ShapeSmall = 8dp), theme-token driven (a
        // theme can retune the shape family). Templates TemplateBind
        // PART_Border.CornerRadius to this via `$$CornerRadius`; a per-instance
        // Local set (e.g. a segmented bank's left/right-rounded halves)
        // overrides it.
        CornerRadius = @ShapeSmall;
        Template = @DefaultFilledButton;
        when ( Variant = Elevated ) { Template = @DefaultElevatedButton; }
        when ( Variant = Tonal ) { Template = @DefaultTonalButton; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedButton; }
        when ( Variant = Text ) { Template = @DefaultTextButton; }
    }

    // ── IconButton: 40×40 chrome with M3 variant-driven skinning ────
    // Four M3 variants — Filled (Primary container), Tonal
    // (SecondaryContainer), Outlined (1-DIP outline), Standard (no
    // chrome at rest). The glyph rides through the inherited Content
    // path; TextBlock.Foreground writes on PART_Border cascade to a
    // TextBlock Content so authors can drop in `IconButton{ TextBlock
    // [Text="×"] }` without restating the icon colour.
    //
    // 40×40 baseline (Coarse pointer bumps to 48×48); padding stays at
    // 8dp on all sides to leave a 24dp inner glyph slot. @ShapeFull
    // clamps to 20dp at render, so each variant reads as a circle.

    // Filled — Primary container, OnPrimary glyph. State layer composites
    // OnPrimary at 8% / 12% over Primary per M3 strict spec.
    Template x:key="DefaultFilledIconButton" [TargetType = IconButton] {
        Border x:name="PART_Border"
            [ Fill           = @Primary,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              Width                = 40,
              Height               = 40,
              TextBlock.Foreground = @OnPrimary ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnPrimaryHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnPrimaryPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
    }

    // Tonal — SecondaryContainer, OnSecondaryContainer glyph.
    Template x:key="DefaultTonalIconButton" [TargetType = IconButton] {
        Border x:name="PART_Border"
            [ Fill           = @SecondaryContainer,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              Width                = 40,
              Height               = 40,
              TextBlock.Foreground = @OnSecondaryContainer ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSecondaryContainerHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSecondaryContainerPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
    }

    // Outlined — transparent, 1-DIP outline, OnSurfaceVariant glyph.
    Template x:key="DefaultOutlinedIconButton" [TargetType = IconButton] {
        Border x:name="PART_Border"
            [ Fill           = #00000000,
              Stroke          = Pen [ Brush = @Outline ],
              BorderThickness      = (1),
              CornerRadius         = $$CornerRadius,
              Width                = 40,
              Height               = 40,
              TextBlock.Foreground = @OnSurfaceVariant ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
        when ( ThemeManager.PrefersContrast = More ) { PART_Border.BorderThickness = (2); }
    }

    // Standard — fully transparent at rest, OnSurfaceVariant glyph.
    // The low-emphasis default for toolbar-style icon buttons.
    Template x:key="DefaultStandardIconButton" [TargetType = IconButton] {
        Border x:name="PART_Border"
            [ Fill           = #00000000,
              BorderThickness      = (0),
              CornerRadius         = $$CornerRadius,
              Width                = 40,
              Height               = 40,
              TextBlock.Foreground = @OnSurfaceVariant ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = $$CornerRadius,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
    }

    // Default Style — picks the template by Variant via property
    // triggers. Filled is the baseline; the other three variants ride
    // their own triggers. Mirrors the Button Style structure in
    // basic.resources.mu (with Standard added for the chrome-less case).
    Style [TargetType = IconButton] {
        // M3 pill default — @ShapeFull clamps to min(W,H)/2 = 20dp on the
        // 40×40 chrome, so every variant reads as a circle at rest. The
        // four templates TemplateBind PART_Border / PART_StateLayer
        // CornerRadius to this via `$$CornerRadius`, so a per-instance
        // Local set reshapes the chrome without a new template — e.g.
        // `IconButton [CornerRadius = @ShapeMedium]` for a rounded
        // rectangle. Mirrors the Button Style's CornerRadius contract.
        CornerRadius = @ShapeFull;
        Template = @DefaultFilledIconButton;
        when ( Variant = Tonal ) { Template = @DefaultTonalIconButton; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedIconButton; }
        when ( Variant = Standard ) { Template = @DefaultStandardIconButton; }
    }

    // ── IconButtonToggle: IconButton with an IsChecked state flip ───
    // Four templates mirror the IconButton variants. Each ships a
    // resting (unchecked) chrome whose colours match the M3 "unselected"
    // role, then a `when ( IsChecked )` trigger swaps to the variant's
    // "selected" role pair. Hover / press tints layer on top of either
    // state — checked + hover composes as expected because the trigger
    // graph stays one level deep (IsChecked sets the base; IsMouseOver
    // / IsPressed re-tints).

    // Filled Toggle — unchecked = SurfaceContainerHighest, checked = Primary.
    // State layer overlay uses the unchecked ink (OnSurfaceVariant) at
    // 8/12% for all hover/press states. Strict M3 would swap the
    // overlay colour to OnPrimary on checked hover/press, but
    // ControlTemplate triggers don't currently accept the multi-term
    // `when (IsChecked and IsMouseOver)` form (only Style triggers do).
    // Visual delta is minimal because the alpha is low.
    Template x:key="DefaultFilledIconButtonToggle" [TargetType = IconButtonToggle] {
        Border x:name="PART_Border"
            [ Fill      = @SurfaceContainerHighest,
              BorderThickness = (0),
              CornerRadius    = @ShapeFull,
              Width           = 40,
              Height          = 40 ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeFull,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked ) { PART_Border.Fill = @Primary; }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
    }

    // Tonal Toggle — unchecked = SurfaceContainerHighest, checked = SecondaryContainer.
    Template x:key="DefaultTonalIconButtonToggle" [TargetType = IconButtonToggle] {
        Border x:name="PART_Border"
            [ Fill      = @SurfaceContainerHighest,
              BorderThickness = (0),
              CornerRadius    = @ShapeFull,
              Width           = 40,
              Height          = 40 ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeFull,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked ) { PART_Border.Fill = @SecondaryContainer; }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
    }

    // Outlined Toggle — unchecked = transparent + outline,
    // checked = InverseSurface (no border).
    Template x:key="DefaultOutlinedIconButtonToggle" [TargetType = IconButtonToggle] {
        Border x:name="PART_Border"
            [ Fill      = #00000000,
              Stroke     = Pen [ Brush = @Outline ],
              BorderThickness = (1),
              CornerRadius    = @ShapeFull,
              Width           = 40,
              Height          = 40 ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeFull,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked ) {
            PART_Border.Fill = @InverseSurface;
            PART_Border.BorderThickness = (0);
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
        when ( ThemeManager.PrefersContrast = More ) { PART_Border.BorderThickness = (2); }
    }

    // Standard Toggle — unchecked = transparent / OnSurfaceVariant,
    // checked = transparent / Primary. No container colour change; the
    // Style-level Foreground trigger is the only visible cue.
    Template x:key="DefaultStandardIconButtonToggle" [TargetType = IconButtonToggle] {
        Border x:name="PART_Border"
            [ Fill      = #00000000,
              BorderThickness = (0),
              CornerRadius    = @ShapeFull,
              Width           = 40,
              Height          = 40 ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeFull,
                  Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Width = 48;
            PART_Border.Height = 48;
        }
    }

    // IconButtonToggle Style — picks Template by Variant and writes
    // TextBlock.Foreground on the templated parent for both states
    // (unchecked = OnSurfaceVariant per M3, checked = per-variant
    // "selected" ink). Multi-condition `Variant=X and IsChecked` triggers
    // give us 4 distinct checked-state foregrounds without needing the
    // 3-segment template-trigger LHS the compiler rejects.
    Style [TargetType = IconButtonToggle] {
        Template = @DefaultFilledIconButtonToggle;
        TextBlock.Foreground = @OnSurfaceVariant;
        TextBlock.FontWeight = @TypefaceWeightMedium;
        when ( Variant = Tonal ) { Template = @DefaultTonalIconButtonToggle; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedIconButtonToggle; }
        when ( Variant = Standard ) { Template = @DefaultStandardIconButtonToggle; }
        when ( IsChecked and Variant = Filled ) { TextBlock.Foreground = @OnPrimary; }
        when ( IsChecked and Variant = Tonal ) { TextBlock.Foreground = @OnSecondaryContainer; }
        when ( IsChecked and Variant = Outlined ) { TextBlock.Foreground = @InverseOnSurface; }
        when ( IsChecked and Variant = Standard ) { TextBlock.Foreground = @Primary; }
    }

    // ── FloatingActionButton: M3 primary screen-action surface ─────
    // Four templates pick chrome by the Size DP — Small (40dp),
    // Default (56dp), Large (96dp), Extended (56dp tall, content-driven
    // width with an icon+label slot). All four share the same colour
    // wiring (@PrimaryContainer container, @OnPrimaryContainer ink,
    // @ElevationLevel3 at rest with a hover bump to @ElevationLevel4),
    // so the only per-size deltas are Width / Height / CornerRadius
    // and (for Extended) the Padding around the content slot.
    //
    // State-layer overlay follows the same strict-M3 pattern as the
    // Button family: PART_StateLayer is a transparent inner Border that
    // flips Fill to @OnPrimaryContainerHoverLayer /
    // @OnPrimaryContainerPressLayer on hover / press. Elevation is bumped
    // on hover via PART_Border.Effect in the same trigger body.

    // Default FAB — 56dp icon-only.
    //
    // MinWidth / MinHeight pin the M3 baseline chrome size while
    // letting the Border grow when a consumer slots a glyph that
    // overflows the 24×24 inner cell (e.g. a 32px ligature). An
    // explicit Width / Height would clip the larger glyph against
    // the chrome.
    //
    // ContentPresenter is centered both ways so the slotted icon
    // (typically a TextBlock with a glyph that's narrower than the
    // 24×24 inner slot) renders dead-centre on the chrome. Without
    // explicit Center alignment, the presenter inherits Stretch and
    // the TextBlock fills the slot, painting its glyph at top-left
    // of the stretched cell (text Y is `i * lineHeight`, default
    // TextAlignment=Left). Plain Button doesn't show the same drift
    // because its Border has no Min size and hugs content + padding,
    // leaving no extra space.
    Template x:key="DefaultFab" [TargetType = FloatingActionButton] {
        Border x:name="PART_Border"
            [ Fill           = @PrimaryContainer,
              BorderThickness      = (0),
              CornerRadius         = @ShapeLarge,
              MinWidth             = 56,
              MinHeight            = 56,
              Effect               = @ElevationLevel3,
              TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeLarge,
                  Padding      = (16,16,16,16) ] {
                // Icon slot pinned to the M3 24dp spec — same trick the
                // NavigationItem template uses ([framework.resources.mu:1127]).
                // Without explicit Width/Height, the TextBlock's reported
                // DesiredSize is the FONT line box (Material Symbols at 24px
                // reports ~28dp tall via fontBoundingBox ascender + descender
                // whitespace the icon doesn't fill), the line box overflows
                // the 24dp inner slot, and ContentPresenter's Center alignment
                // collapses to top-anchored — pushing the visible glyph above
                // the chrome's centre. Explicit 24×24 clamps RenderSize to the
                // icon's visible em box; the font itself centres the glyph
                // within that box.
                ContentPresenter
                    [ Width               = 24,
                      Height              = 24,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center ]
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Fill = @OnPrimaryContainerHoverLayer;
            PART_Border.Effect = @ElevationLevel4;
        }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnPrimaryContainerPressLayer; }
    }

    // FAB Small — 40dp icon-only, @ShapeMedium corners.
    Template x:key="DefaultFabSmall" [TargetType = FloatingActionButton] {
        Border x:name="PART_Border"
            [ Fill           = @PrimaryContainer,
              BorderThickness      = (0),
              CornerRadius         = @ShapeMedium,
              MinWidth             = 40,
              MinHeight            = 40,
              Effect               = @ElevationLevel3,
              TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeMedium,
                  Padding      = (8,8,8,8) ] {
                // Icon slot pinned to M3's 24dp icon spec — see DefaultFab
                // for the rationale on why MS Outlined's line box needs
                // explicit clamping.
                ContentPresenter
                    [ Width               = 24,
                      Height              = 24,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center ]
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Fill = @OnPrimaryContainerHoverLayer;
            PART_Border.Effect = @ElevationLevel4;
        }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnPrimaryContainerPressLayer; }
    }

    // FAB Large — 96dp icon-only, @ShapeExtraLarge corners.
    Template x:key="DefaultFabLarge" [TargetType = FloatingActionButton] {
        Border x:name="PART_Border"
            [ Fill           = @PrimaryContainer,
              BorderThickness      = (0),
              CornerRadius         = @ShapeExtraLarge,
              MinWidth             = 96,
              MinHeight            = 96,
              Effect               = @ElevationLevel3,
              TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeExtraLarge,
                  Padding      = (30,30,30,30) ] {
                // M3 Large FAB icon spec is 36dp (not the 24dp baseline of
                // Small / Default). Pinned with explicit Width/Height for
                // the same line-box-overflow reason as DefaultFab.
                ContentPresenter
                    [ Width               = 36,
                      Height              = 36,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center ]
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Fill = @OnPrimaryContainerHoverLayer;
            PART_Border.Effect = @ElevationLevel4;
        }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnPrimaryContainerPressLayer; }
    }

    // Extended FAB — 56dp tall, content-driven width, @ShapeLarge corners.
    // The content slot expects icon-then-label (typically a horizontal
    // StackPanel). Padding is asymmetric per M3: 16dp leading (icon side)
    // and 20dp trailing (label side); we apply 16dp uniform here and let
    // the consumer's StackPanel space the gap between icon and label.
    // No explicit Width — Border auto-sizes to the content's measured width.
    Template x:key="DefaultFabExtended" [TargetType = FloatingActionButton] {
        Border x:name="PART_Border"
            [ Fill           = @PrimaryContainer,
              BorderThickness      = (0),
              CornerRadius         = @ShapeLarge,
              MinHeight            = 56,
              Effect               = @ElevationLevel3,
              TextBlock.Foreground = @OnPrimaryContainer,
              TextBlock.FontFamily = @LabelLargeFont,
              TextBlock.FontWeight = @LabelLargeWeight,
              TextBlock.FontSize   = @LabelLargeSize,
              TextBlock.LineHeight = @LabelLargeLineHeight,
              TextBlock.LetterSpacing = @LabelLargeTracking ] {
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeLarge,
                  Padding      = (16,0,20,0) ] {
                ContentPresenter [ HorizontalAlignment = Center, VerticalAlignment = Center ]
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Fill = @OnPrimaryContainerHoverLayer;
            PART_Border.Effect = @ElevationLevel4;
        }
        when ( IsPressed ) { PART_StateLayer.Fill = @OnPrimaryContainerPressLayer; }
    }

    // Default Style — picks Template by Size. Default (56dp) is the
    // baseline; Small / Large / Extended each ride their own trigger.
    //
    // HorizontalAlignment / VerticalAlignment default to Center so the
    // FAB stays at its intrinsic MinSize-floored chrome and doesn't
    // inherit the base Visual.Stretch behaviour. Without this, a FAB
    // dropped into a parent slot taller than its 40/56/96 dp floor
    // (e.g. a Horizontal StackPanel arranges every child at the panel's
    // full height — Small + Default siblings of a Large FAB end up
    // stretched to 96 dp tall) would balloon vertically. The icon would
    // still centre within the stretched cell, but the chrome shape
    // (rounded rectangle with explicit CornerRadius) would read as a
    // tall pill rather than the M3 round-ish chip. M3 FABs are
    // intrinsically sized — the parent positions them, but the chrome
    // itself doesn't stretch.
    Style [TargetType = FloatingActionButton] {
        Template = @DefaultFab;
        HorizontalAlignment = Center;
        VerticalAlignment = Center;
        when ( Size = Small ) { Template = @DefaultFabSmall; }
        when ( Size = Large ) { Template = @DefaultFabLarge; }
        when ( Size = Extended ) { Template = @DefaultFabExtended; }
    }
}
