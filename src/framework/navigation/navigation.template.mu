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
    //   * Icon container — 56dp × 32dp pill (CornerRadius=@ShapeSmall).
    //     Fill flips @SecondaryContainer when selected, transparent
    //     at rest. Houses PART_IconSlot, the consumer's Icon Visual.
    //   * Label — single-line text below the icon container with the
    //     @LabelMedium typography role. Ink: @OnSurfaceVariant at rest,
    //     @OnSurface (Medium weight) when selected.
    //
    // State layer overlay (Standard M3 pattern): a transparent inner
    // Border whose Fill composites @OnSurfaceVariantHoverLayer /
    // @OnSurfaceVariantPressLayer on hover / press.
    //
    // 56dp item height matches M3 Rail spec; Bar can override Height in
    // the bar template if it wants the slightly taller 80dp Bar item.
    Template x:key="DefaultNavigationItem" [TargetType = NavigationItem] {
        Border x:name="PART_Outer"
            [ Fill          = #00000000,
              Padding             = (4,12,4,12),
              HorizontalAlignment = Stretch ] {
            // 12dp top/bottom matches the M3 spec for nav-rail item
            // padding (icon container has its own 8dp gap below, set
            // by PART_LabelText.Margin). 4dp left/right keeps the
            // 56dp pill centred within the 80dp rail with breathing
            // room on each side.
            StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                Border x:name="PART_IconContainer"
                    [ Fill          = #00000000,
                      CornerRadius        = @ShapeSmall,
                      Width               = 56,
                      Height              = 32,
                      HorizontalAlignment = Center ] {
                    Border x:name="PART_IconStateLayer"
                        [ Fill   = #00000000,
                          CornerRadius = @ShapeSmall ] {
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
                    [ Style               = @LabelMedium,
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
            PART_IconContainer.Fill = @SecondaryContainer;
            PART_LabelText.Foreground = @OnSurface;
            PART_LabelText.FontWeight = @TypefaceWeightMedium;
        }
        when ( IsMouseOver ) { PART_IconStateLayer.Fill = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed ) { PART_IconStateLayer.Fill = @OnSurfaceVariantPressLayer; }
        // Adaptive layout — Compact tightens the item's vertical padding,
        // Comfortable loosens it, Coarse pointer enlarges the touch target
        // (wider AND taller than rest). Padding lives on PART_Outer, the
        // row's interactive extent, so the hit area tracks these retunes.
        when ( ThemeManager.Density = Compact ) { PART_Outer.Padding = (4,8,4,8); }
        when ( ThemeManager.Density = Comfortable ) { PART_Outer.Padding = (4,16,4,16); }
        when ( ThemeManager.Pointer = Coarse ) { PART_Outer.Padding = (8,16,8,16); }
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
            [ Fill      = @Surface,
              Width           = 80 ] {
            DockPanel [ LastChildFill = true ] {
                // Right edge rule (was the Border's (0,0,1,0) right edge): a
                // vertical Line docked Right draws the 1dp rail/body divider.
                Line [ DockPanel.Dock = Right, Orientation = Vertical, Stroke = (@OutlineVariant, 1) ]
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
            [ Fill      = @Surface,
              Height          = 80 ] {
            // Top edge rule (was the Border's (0,1,0,0) top edge): a horizontal
            // Line docked Top over the items row. A DockPanel wraps them so the
            // Line pins to the top and the ItemsPresenter fills the remainder.
            DockPanel [ LastChildFill = true ] {
                Line [ DockPanel.Dock = Top, Orientation = Horizontal, Stroke = (@OutlineVariant, 1) ]
                ItemsPresenter x:name="PART_ItemsPresenter" [ VerticalAlignment = Center ]
            }
        }
    }

    Style [TargetType = NavigationBar] {
        Template = @DefaultNavigationBar;
        ItemsPanel = @DefaultNavigationBarPanel;
    }

    // ── Activity bar — a VSCode-style vertical rail variant ────────────
    // A NavigationRail restyled as an editor "activity bar": a narrow
    // (48dp) column of icon-only destinations with a left selection accent,
    // driven by the shell's NavigationService (ItemsSource = $Items,
    // SelectedItem = $SelectedItem). Applied PER-INSTANCE in the EditorShell
    // template via Template = @ActivityBarRail + ItemContainerStyle =
    // @ActivityBarItem (keyed, so ordinary NavigationRails keep their M3
    // chrome). Colours are theme tokens, so the bar tracks the active scheme
    // rather than hardcoding VSCode grey.

    // A vertical-stack items panel for the header / footer action lists below.
    ItemsPanelTemplate x:key="RailActionsPanel" {
        StackPanel [ Orientation = Vertical ]
    }

    // Rail chrome — a 48dp column with header/footer action lists; items stack
    // vertically via the rail's default ItemsPanel (DefaultNavigationRailPanel).
    //
    // The header (top) and footer (bottom) present the NavigationService's
    // HeaderActions / FooterActions (a settings gear, help, account, …) as
    // ItemsControls INLINE in the template body — NOT via the rail's Header /
    // Footer content DPs. Inlining is deliberate: each rail materialises its
    // OWN action-list ItemsControls, so multiple live shells (multiple rails)
    // each parent their own. A shared keyed Visual resource slotted through the
    // Header / Footer DPs can't do that — a Visual has ONE parent, so the
    // second rail throws on attach. Their DataContext is the NavigationService
    // (inherited from the rail), so `$HeaderActions` / `$FooterActions` resolve;
    // each action renders through DataTemplate[RailAction]. Empty collections
    // render nothing, so a shell that contributes no actions shows a bare rail.
    Template x:key="ActivityBarRail" [TargetType = NavigationRail] {
        Border x:name="PART_Border"
            [ Fill      = @SurfaceContainerHigh,
              Width           = 48 ] {
            DockPanel [ LastChildFill = true ] {
                // Right edge rule (was the Border's (0,0,1,0) right edge): a
                // vertical Line docked Right draws the 1dp activity-bar divider.
                Line [ DockPanel.Dock = Right, Orientation = Vertical, Stroke = (@OutlineVariant, 1) ]
                ItemsControl x:name="PART_HeaderActions"
                    [ DockPanel.Dock     = Top,
                      HorizontalAlignment = Center,
                      Margin              = (0,8,0,8),
                      ItemsSource         = $HeaderActions,
                      ItemsPanel          = @RailActionsPanel ]
                ItemsControl x:name="PART_FooterActions"
                    [ DockPanel.Dock     = Bottom,
                      HorizontalAlignment = Center,
                      Margin              = (0,8,0,8),
                      ItemsSource         = $FooterActions,
                      ItemsPanel          = @RailActionsPanel ]
                ItemsPresenter x:name="PART_ItemsPresenter" [ VerticalAlignment = Top ]
            }
        }
    }

    // Item chrome — a 48×48 icon cell with a 2dp left selection accent. The
    // icon is the destination's Geometry, bound through the item's DataContext
    // (the NavigationDestination); empty until an icon dictionary is baked, at
    // which point glyphs appear with no template change. Rest ink
    // @OnSurfaceVariant; selected / hovered brightens to @OnSurface; the accent
    // lights @Primary when selected.
    Template x:key="ActivityBarItemTemplate" [TargetType = NavigationItem] {
        Border x:name="PART_Outer" [ Fill = #00000000, Width = 48, Height = 48 ] {
            Grid {
                Border x:name="PART_Accent"
                    [ Width               = 2,
                      HorizontalAlignment = Left,
                      VerticalAlignment   = Stretch,
                      Fill          = #00000000 ]
                // Rest: dimmed (Opacity 0.55) so idle destinations recede,
                // matching VSCode's shaded inactive activity-bar icons. Select
                // / hover restore full opacity (and brighten the ink to
                // @OnSurface) so the active/targeted icon reads as foreground.
                Shape x:name="PART_Icon"
                    [ Geometry            = $Icon,
                      Fill                = @OnSurfaceVariant,
                      Opacity             = 0.55,
                      Width               = 24,
                      Height              = 24,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center ]
            }
        }
        when ( IsSelected ) {
            PART_Accent.Fill = @Primary;
            PART_Icon.Fill        = @OnSurface;
            PART_Icon.Opacity     = 1;
        }
        when ( IsMouseOver ) {
            PART_Icon.Fill    = @OnSurface;
            PART_Icon.Opacity = 1;
        }
        when ( IsPressed )   { PART_Outer.Fill = @OnSurfaceVariantHoverLayer; }
        // Adaptive layout — the activity-bar cell is a fixed square hit
        // target (like IconButton), so density / coarse retune the cell
        // size rather than padding. Compact tightens to a denser column,
        // Comfortable and Coarse grow the cell (>= the 48dp rest) for
        // touch reach. Icon glyph stays 24dp, centred, across all sizes.
        when ( ThemeManager.Density = Compact ) {
            PART_Outer.Width = 40;
            PART_Outer.Height = 40;
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Outer.Width = 56;
            PART_Outer.Height = 56;
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Outer.Width = 56;
            PART_Outer.Height = 56;
        }
    }

    // Keyed (not implicit-by-type) so it applies only where a rail names it as
    // its ItemContainerStyle — ordinary NavigationItems keep the M3 row.
    Style x:key="ActivityBarItem" [TargetType = NavigationItem] {
        Template = @ActivityBarItemTemplate;
    }
}
