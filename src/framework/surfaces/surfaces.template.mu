// Default theme entries for the surfaces family — container and
// popup-type surfaces. Mix of in-flow containers (Card, ScrollViewer,
// GroupItem) and overlay-mounted surfaces (BottomSheet, Drawer,
// Dialog) that all share the "host other content inside a shaped
// chrome" pattern.
//
// GroupItem has no default Style — it's a structural ItemsControl
// subclass with consumer-supplied chrome via GroupStyle.HeaderTemplate.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Surfaces {
    // ── Card: M3 content container ─────────────────────────────────
    // Three variants — Filled / Elevated / Outlined. Each ships a
    // PART_Border container with the variant's resting chrome and a
    // PART_StateLayer overlay that composites @StateHoverOverlay /
    // @StatePressOverlay on hover / press. All three share the same
    // @ShapeMedium corner radius and the same 16dp content padding;
    // they differ in Background, BorderThickness, and resting Effect.
    //
    // Hover behaviour (all variants): elevation bumps one level above
    // the resting value (Filled / Outlined go Level0 → Level1, Elevated
    // goes Level1 → Level2) and the state layer composites a translucent
    // @OnSurface tint over the container. Press composites the slightly
    // stronger @StatePressOverlay and lowers Effect back to the resting
    // value — the M3 "press = recession" cue.
    //
    // IsMouseOver / IsPressed flip generically through InputManager's
    // hit-target write path (no Click protocol required), so Card gets
    // the press / hover state from any pointer interaction without
    // having to extend Button.

    // Filled — @SurfaceContainerHighest, no border, no resting Effect.
    Template x:key="DefaultFilledCard" [TargetType = Card] {
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerHighest,
              BorderThickness = (0),
              CornerRadius    = @ShapeMedium ] {
            Border x:name="PART_StateLayer"
                [ Background   = #00000000,
                  CornerRadius = @ShapeMedium,
                  Padding      = (16,16,16,16) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Background = @StateHoverOverlay;
            PART_Border.Effect = @ElevationLevel1;
        }
        when ( IsPressed ) { PART_StateLayer.Background = @StatePressOverlay; }
    }

    // Elevated — @SurfaceContainerLow, no border, resting Level1.
    Template x:key="DefaultElevatedCard" [TargetType = Card] {
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerLow,
              BorderThickness = (0),
              CornerRadius    = @ShapeMedium,
              Effect          = @ElevationLevel1 ] {
            Border x:name="PART_StateLayer"
                [ Background   = #00000000,
                  CornerRadius = @ShapeMedium,
                  Padding      = (16,16,16,16) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Background = @StateHoverOverlay;
            PART_Border.Effect = @ElevationLevel2;
        }
        when ( IsPressed ) {
            PART_StateLayer.Background = @StatePressOverlay;
            PART_Border.Effect = @ElevationLevel1;
        }
    }

    // Outlined — @Surface, 1-DIP @Outline border, no resting Effect.
    Template x:key="DefaultOutlinedCard" [TargetType = Card] {
        Border x:name="PART_Border"
            [ Background      = @Surface,
              BorderBrush     = @Outline,
              BorderThickness = (1),
              CornerRadius    = @ShapeMedium ] {
            Border x:name="PART_StateLayer"
                [ Background   = #00000000,
                  CornerRadius = @ShapeMedium,
                  Padding      = (15,15,15,15) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver ) {
            PART_StateLayer.Background = @StateHoverOverlay;
            PART_Border.Effect = @ElevationLevel1;
        }
        when ( IsPressed ) { PART_StateLayer.Background = @StatePressOverlay; }
        when ( ThemeManager.PrefersContrast = More ) { PART_Border.BorderThickness = (2); }
    }

    // Default Style — picks Template by Variant. Filled is the baseline
    // (the Setter); Elevated / Outlined each ride their own trigger.
    Style [TargetType = Card] {
        Template = @DefaultFilledCard;
        when ( Variant = Elevated ) { Template = @DefaultElevatedCard; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedCard; }
    }

    // ── ScrollViewer ────────────────────────────────────────────────
    // ScrollViewerLayout is a custom panel that hands its
    // ArrangeOverride back to the host ScrollViewer (which carries the
    // gutter / placement math). PART_ContentSite is the
    // ScrollContentPresenter (extends ContentPresenter, so consumer
    // Content lands here automatically via the template's first-
    // ContentPresenter slot resolution). PART_VerticalScrollBar /
    // PART_HorizontalScrollBar are the default scrollbars — re-template
    // to swap them or move their position; the host fishes them out by
    // PART name.
    Template x:key="DefaultScrollViewer" [TargetType = ScrollViewer] {
        ScrollViewerLayout x:name="PART_Layout" {
            ScrollContentPresenter x:name="PART_ContentSite"
            ScrollBar x:name="PART_VerticalScrollBar"
            ScrollBar x:name="PART_HorizontalScrollBar"
        }
    }
    Style [TargetType = ScrollViewer] {
        Template = @DefaultScrollViewer;
    }

    // ── Drawer (in-flow pane) ───────────────────────────────────────
    // Shared by Permanent / Persistent / Temporary variants. The
    // Temporary variant re-parents this same pane onto the overlay
    // host (see DefaultDrawerOverlay) — no duplicate pane is built.
    // Drawer has TWO templates (pane + overlay) — both keyed; the
    // ctor reads them explicitly.
    //
    // M3 spec deltas closed by this template:
    //   * Background: @SurfaceContainerLow (M3 Standard / Modal).
    //   * Padding:    (0,12,0,0) — M3's 12dp top inset baked in.
    //   * Elevation:  @ElevationLevel1 when Variant=Temporary (M3 Modal
    //                 floats over content with a shadow ramp; Permanent
    //                 / Persistent stay at Level0 per M3 Standard /
    //                 Dismissible).
    //
    // M3 spec deltas NOT yet closed (documented gap):
    //   * Trailing-edge corner radius (M3 Modal has @ShapeLargeEnd on
    //     the trailing corners — 16dp on the edge furthest from the
    //     screen edge). Needs Anchor-aware corner-radius computation
    //     mural's template DSL doesn't support yet.
    Template x:key="DefaultDrawerPane" [TargetType = Drawer] {
        Border x:name="PART_Pane"
            [ Background      = @SurfaceContainerLow,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1),
              Padding         = (@Spacing0,@Spacing3,@Spacing0,@Spacing0) ] {
            ContentPresenter
        }
        when ( Variant = Temporary ) { PART_Pane.Effect = @ElevationLevel1; }
        // Disabled — dim the entire drawer pane. Drawer doesn't have
        // hover / focus / press semantics (it's a container, not an
        // interactive surface), so the state ladder collapses to
        // resting + disabled at the template level.
        when ( IsEnabled = false ) { PART_Pane.Opacity = @DisabledContentOpacity; }
    }

    // ── Drawer (overlay host for the Temporary variant) ─────────────
    // Applied lazily — only when a Temporary Drawer first transitions
    // to IsOpen=true. The pane is NOT a child of this template; Drawer
    // AddVisualChilds it after Apply so the same pane instance can flip
    // between in-flow and overlay hosting without being rebuilt.
    Template x:key="DefaultDrawerOverlay" [TargetType = Drawer] {
        TemporaryOverlayHost x:name="PART_OverlayHost" {
            ScrimSurface x:name="PART_Scrim" [ BorderThickness = (0) ]
        }
    }

    // ── Dialog: M3 modal dialog ────────────────────────────────────
    // ExtraLarge corner radius (M3 spec) + Elevation3 + @Surface
    // resting background. Title + Content + Actions stack vertically.
    // The modal scrim is OUTSIDE the dialog template — Dialog mounts
    // onto the PresentationTarget's OverlayLayer and that surface
    // owns the scrim. The dialog template just paints the floating
    // surface itself.
    Template x:key="DefaultDialog" [TargetType = Dialog] {
        Border x:name="PART_Dialog"
            [ Background      = @Surface,
              BorderBrush     = #00000000,
              BorderThickness = (0),
              CornerRadius    = @ShapeExtraLarge,
              Effect          = @Elevation3,
              Padding         = (@Spacing6,@Spacing6,@Spacing6,@Spacing6) ] {
            DockPanel [ LastChildFill = true ] {
                TextBlock x:name="PART_Title"
                    [ DockPanel.Dock = Top,
                      Text           = $Title,
                      Foreground     = @OnSurface,
                      FontFamily     = @HeadlineSmallFont,
                      FontWeight     = @HeadlineSmallWeight,
                      FontSize       = @HeadlineSmallSize,
                      LineHeight     = @HeadlineSmallLineHeight,
                      LetterSpacing  = @HeadlineSmallTracking,
                      Margin         = (0,0,0,@Spacing4) ]
                ContentPresenter
                    [ DockPanel.Dock      = Bottom,
                      Content             = $Actions,
                      HorizontalAlignment = Right,
                      Margin              = (0,@Spacing4,0,0) ]
                ContentPresenter
            }
        }
    }
    Style [TargetType = Dialog] {
        Template = @DefaultDialog;
    }

    // ── BottomSheet: M3 bottom-anchored sheet ──────────────────────
    // M3 spec: top corners rounded at ExtraLarge (28dp), bottom edges
    // square so the sheet sits flush against the screen edge. The
    // asymmetric corners ride the (TL, TR, BR, BL) CornerRadius tuple
    // — the compiler routes tuples in a CornerRadius= position to
    // `new CornerRadius(...)` rather than the default Thickness shape.
    Template x:key="DefaultBottomSheet" [TargetType = BottomSheet] {
        Border x:name="PART_Sheet"
            [ Background      = @Surface,
              BorderBrush     = #00000000,
              BorderThickness = (0),
              CornerRadius    = (@ShapeExtraLarge,@ShapeExtraLarge,0,0),
              Effect          = @Elevation1,
              Padding         = (@Spacing4,@Spacing4,@Spacing4,@Spacing4) ] {
            ContentPresenter
        }
    }
    Style [TargetType = BottomSheet] {
        Template = @DefaultBottomSheet;
    }
}
