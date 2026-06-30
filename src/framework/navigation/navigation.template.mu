// Default theme entries for the navigation family — NavigationItem
// (the destination row), NavigationRail (vertical strip),
// NavigationBar (horizontal bottom strip), and the two items
// panels they share.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Navigation {
    // ── NavigationRail / NavigationBar items panels ────────────────
    // Mural's ItemsPanelTemplate uses the keyed-resource pattern (the
    // inline `ItemsPanel = ItemsPanelTemplate { … }` form isn't
    // accepted by the markup compiler). Each panel template emits one
    // fresh Panel instance per ItemsControl realisation.
    ItemsPanelTemplate x:key="DefaultNavigationRailPanel" {
        StackPanel [ Orientation = Vertical ]
    }

    ItemsPanelTemplate x:key="DefaultNavigationBarPanel" {
        UniformGrid [ Rows = 1 ]
    }

    // ── NavigationItem: a single rail/bar destination row ──────────
    // Anatomy per M3 spec:
    //   * Icon container — 56dp × 32dp pill (CornerRadius=@ShapeFull).
    //     Background flips @SecondaryContainer when selected, transparent
    //     at rest. Houses PART_IconSlot, the consumer's Icon Visual.
    //   * Label — single-line text below the icon container with the
    //     @LabelMedium typography role. Ink: @OnSurfaceVariant at rest,
    //     @OnSurface (Medium weight) when selected.
    //
    // State layer overlay (Standard M3 pattern): a transparent inner
    // Border whose Background composites @OnSurfaceVariantHoverLayer /
    // @OnSurfaceVariantPressLayer on hover / press.
    //
    // 56dp item height matches M3 Rail spec; Bar can override Height in
    // the bar template if it wants the slightly taller 80dp Bar item.
    Template x:key="DefaultNavigationItem" [TargetType = NavigationItem] {
        Border x:name="PART_Outer"
            [ Background          = #00000000,
              Padding             = (4,12,4,12),
              HorizontalAlignment = Stretch ] {
            // 12dp top/bottom matches the M3 spec for nav-rail item
            // padding (icon container has its own 8dp gap below, set
            // by PART_LabelText.Margin). 4dp left/right keeps the
            // 56dp pill centred within the 80dp rail with breathing
            // room on each side.
            StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                Border x:name="PART_IconContainer"
                    [ Background          = #00000000,
                      CornerRadius        = @ShapeFull,
                      Width               = 56,
                      Height              = 32,
                      HorizontalAlignment = Center ] {
                    Border x:name="PART_IconStateLayer"
                        [ Background   = #00000000,
                          CornerRadius = @ShapeFull ] {
                        // PART_IconSlot is locked to the M3-spec 24×24dp
                        // icon box (centred inside the 56×32dp pill).
                        // Fixing the slot size matters because some
                        // icon fonts (Material Symbols among them) report
                        // a larger em-height than the visible glyph —
                        // the font's typo descender carries whitespace
                        // the icon doesn't fill, and a shrink-wrapped
                        // slot would inherit that height and overflow
                        // the 32dp pill, anchoring the glyph at the top.
                        // The explicit 24dp box pins layout to the
                        // glyph's actual visible extent and lets the
                        // Center alignment in both axes land it dead-
                        // centre.
                        ContentPresenter x:name="PART_IconSlot"
                            [ Width               = 24,
                              Height              = 24,
                              HorizontalAlignment = Center,
                              VerticalAlignment   = Center ]
                    }
                }
                TextBlock x:name="PART_LabelText"
                    [ FontFamily          = @LabelMediumFont,
                      FontWeight          = @LabelMediumWeight,
                      FontSize            = @LabelMediumSize,
                      LineHeight          = @LabelMediumLineHeight,
                      LetterSpacing       = @LabelMediumTracking,
                      Foreground          = @OnSurfaceVariant,
                      HorizontalAlignment = Stretch,
                      TextAlignment       = Center,
                      TextWrapping        = Wrap,
                      Margin              = (0,4,0,0) ]
                // Wrap so longer labels (e.g. "Styles & Triggers"
                // in the platform demo) flow onto a second line
                // rather than getting clipped at the rail's 80dp
                // edge. Stretch + TextAlignment=Center keeps the
                // wrapped lines centred under the icon pill.
            }
        }
        when ( IsSelected ) {
            PART_IconContainer.Background = @SecondaryContainer;
            PART_LabelText.Foreground = @OnSurface;
            PART_LabelText.FontWeight = @TypefaceWeightMedium;
        }
        when ( IsMouseOver ) { PART_IconStateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_IconStateLayer.Background = @OnSurfaceVariantPressLayer; }
    }

    // The NavigationItem Style just installs the default template.
    // Icon / Label DP → template-part sync runs in the class itself
    // (NavigationItem.OnPropertyChanged finds PART_IconSlot /
    // PART_LabelText and writes through them). Class-level sync chosen
    // over Style triggers because the compiler's `when (X != "")` form
    // isn't supported — the trigger DSL only accepts `=` equality
    // comparisons today.
    Style [TargetType = NavigationItem] {
        Template = @DefaultNavigationItem;
        // Reactive ink for the SLOTTED icon. The consumer's icon Visual
        // (a Material-Symbols TextBlock) carries no Foreground of its own,
        // so it would otherwise fall back to the non-reactive render-time
        // default and freeze on the scheme active at first paint. Setting
        // TextBlock.Foreground on the templated parent (DynamicResource,
        // reactive) cascades into the icon — @OnSurfaceVariant at rest,
        // @OnSecondaryContainer on the active pill, mirroring the M3 icon
        // roles. PART_LabelText sets its own Foreground (Local tier) so
        // this cascade reaches only the icon, not the label.
        TextBlock.Foreground = @OnSurfaceVariant;
        when ( IsSelected ) { TextBlock.Foreground = @OnSecondaryContainer; }
    }

    // ── NavigationRail: vertical destination strip ─────────────────
    // M3 spec: 80dp wide, full-height. Header (optional FAB-or-branding)
    // sits at top; items stack vertically in the middle; Footer
    // (optional secondary action) anchors at the bottom.
    //
    // PART_HeaderSlot / PART_FooterSlot are ContentPresenters bound to
    // the rail's Header / Footer DPs via the Style triggers below.
    // Items render through PART_ItemsPresenter — ItemsPanel defaults to
    // vertical StackPanel.
    Template x:key="DefaultNavigationRail" [TargetType = NavigationRail] {
        Border x:name="PART_Border"
            [ Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (0,0,1,0),
              Width           = 80 ] {
            DockPanel [ LastChildFill = true ] {
                ContentPresenter x:name="PART_HeaderSlot"
                    [ DockPanel.Dock      = Top,
                      HorizontalAlignment = Center,
                      Margin              = (0,12,0,12) ]
                ContentPresenter x:name="PART_FooterSlot"
                    [ DockPanel.Dock      = Bottom,
                      HorizontalAlignment = Center,
                      Margin              = (0,8,0,8) ]
                ItemsPresenter x:name="PART_ItemsPresenter" [ VerticalAlignment = Top ]
            }
        }
    }

    // Style installs the template + the vertical-stack ItemsPanel.
    // Header / Footer DP → PART_HeaderSlot / PART_FooterSlot sync is
    // handled in NavigationRail.OnPropertyChanged (compiler doesn't
    // support `when (X != $null)` triggers).
    Style [TargetType = NavigationRail] {
        Template = @DefaultNavigationRail;
        ItemsPanel = @DefaultNavigationRailPanel;
    }

    // ── NavigationBar: horizontal bottom tab strip ─────────────────
    // M3 spec: 80dp tall, full-width. Items distribute evenly across
    // the width via a horizontal UniformGrid (every item gets the same
    // share regardless of label length).
    //
    // No Header / Footer slots — the Bar pattern doesn't carry them in
    // M3 (only Rail does).
    Template x:key="DefaultNavigationBar" [TargetType = NavigationBar] {
        Border x:name="PART_Border"
            [ Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (0,1,0,0),
              Height          = 80 ] {
            ItemsPresenter x:name="PART_ItemsPresenter" [ VerticalAlignment = Center ]
        }
    }

    Style [TargetType = NavigationBar] {
        Template = @DefaultNavigationBar;
        ItemsPanel = @DefaultNavigationBarPanel;
    }
}
