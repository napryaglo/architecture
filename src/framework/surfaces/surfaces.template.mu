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
        // Density — tighten / loosen the 16dp content padding on the 4dp
        // grid. Card is a container (no own touch target), so this is a
        // spacing response only; the interactive Content inside adapts via
        // its own controls.
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (12,12,12,12); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (24,24,24,24); }
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
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (12,12,12,12); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (24,24,24,24); }
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
        // Density — the outlined variant's resting padding is 15 (16 − 1dp
        // border), so the ladder keeps that −1 offset: 11 / 23.
        when ( ThemeManager.Density = Compact ) { PART_StateLayer.Padding = (11,11,11,11); }
        when ( ThemeManager.Density = Comfortable ) { PART_StateLayer.Padding = (23,23,23,23); }
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
                      Style          = @HeadlineSmall,
                      Margin         = (0,0,0,@Spacing4) ]
                ContentPresenter
                    [ DockPanel.Dock      = Bottom,
                      Content             = $Actions,
                      HorizontalAlignment = Right,
                      Margin              = (0,@Spacing4,0,0) ]
                ContentPresenter
            }
        }
        // Density — the modal's 24dp inset tightens / loosens ±4 on the grid
        // (@Spacing5 = 20 / @Spacing7 = 28). Container spacing only; the
        // dialog's action buttons adapt through their own templates.
        when ( ThemeManager.Density = Compact ) { PART_Dialog.Padding = (@Spacing5,@Spacing5,@Spacing5,@Spacing5); }
        when ( ThemeManager.Density = Comfortable ) { PART_Dialog.Padding = (@Spacing7,@Spacing7,@Spacing7,@Spacing7); }
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
        // Density — the sheet's 16dp inset tightens / loosens ±4 on the grid
        // (@Spacing3 = 12 / @Spacing5 = 20). Container spacing only.
        when ( ThemeManager.Density = Compact ) { PART_Sheet.Padding = (@Spacing3,@Spacing3,@Spacing3,@Spacing3); }
        when ( ThemeManager.Density = Comfortable ) { PART_Sheet.Padding = (@Spacing5,@Spacing5,@Spacing5,@Spacing5); }
    }
    Style [TargetType = BottomSheet] {
        Template = @DefaultBottomSheet;
    }

    // ── SideSheet: M3 lateral sheet (Standard + Modal) ─────────────
    // Trailing-edge (default) or leading-edge container: a header row
    // (title + close affordance) over the consumer Content. The body
    // ContentPresenter is declared FIRST so ContentControl's depth-first
    // slot walk binds Content to it (not to the header's close button),
    // then positioned into row 1 by Grid.Row. SideSheet reparents this
    // whole PART_Sheet under an overlay host for the Modal variant; the
    // Standard variant keeps it docked in-flow.
    Template x:key="DefaultSideSheet" [TargetType = SideSheet] {
        Border x:name="PART_Sheet"
            [ Background      = @SurfaceContainerLow,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1,0,0,0) ] {
            Grid {
                RowDefinitions {
                    RowDefinition [ Height = GridLength.Auto ]
                    RowDefinition [ Height = GridLength.Star ]
                }
                // Body — first ContentPresenter in the walk = the Content
                // slot; placed in row 1 (below the header).
                ContentPresenter
                    [ Grid.Row = 1,
                      Margin   = (@Spacing4,@Spacing2,@Spacing4,@Spacing4) ]
                // Header — title + close, row 0.
                Border [ Grid.Row = 0, Padding = (@Spacing4,@Spacing3,@Spacing2,@Spacing3) ] {
                    DockPanel [ LastChildFill = true ] {
                        IconButton x:name="PART_CloseButton"
                            [ Variant = Standard, DockPanel.Dock = Right ] {
                            Shape [ Geometry = @IconClose, Fill = @OnSurfaceVariant, Width = 18, Height = 18 ]
                        }
                        TextBlock x:name="PART_Title"
                            [ Text              = $$Title,
                              Style             = @TitleSmall,
                              Foreground        = @OnSurface,
                              VerticalAlignment = Center ]
                    }
                }
            }
        }
        // Leading-edge variant — flip the divider to the trailing side.
        when ( Anchor = Left ) { PART_Sheet.BorderThickness = (0,0,1,0); }
    }
    Style [TargetType = SideSheet] {
        Template = @DefaultSideSheet;
    }
}
