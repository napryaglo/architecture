// Default theme entries for the top-app-bar family — TopAppBar
// (M3 screen-header strip, 4 variants: Small / CenterAligned /
// Medium / Large).
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources TopAppBars {
    // ── TopAppBar: M3 screen-header strip ──────────────────────────
    // Four variants — Small / CenterAligned / Medium / Large. Single
    // row (64dp) for Small + CenterAligned; two-row layouts (112dp /
    // 152dp) for Medium + Large with the title on the second row.
    //
    // Every template ships three named parts the TopAppBar class
    // binds against:
    //   * PART_NavSlot      — a Border whose Child the class swaps to
    //                          the current NavigationIcon DP value.
    //   * PART_TitleText    — a TextBlock whose Text the class syncs
    //                          from the Title DP. Typography is wired
    //                          per-variant (TitleLarge for the single-
    //                          row variants, HeadlineSmall / Medium
    //                          for the two-row ones).
    //   * PART_ActionsStack — a horizontal StackPanel the class
    //                          mirrors the Actions ObservableCollection
    //                          into via Subscribe.
    //
    // Container colour is @Surface across all four variants; M3's
    // scroll-tint behaviour (Surface → SurfaceContainer when content
    // scrolls under the bar) isn't wired yet because mural has no
    // scroll-position signal to gate it on.

    // Small — single row, leading-aligned title. 3-column Grid layout
    // (Auto / * / Auto) — nav and actions take their natural width,
    // the title column fills the remaining space.
    Template x:key="DefaultSmallTopAppBar" [TargetType = TopAppBar] {
        Border x:name="PART_Border" [ Background = @Surface, Height = 64 ] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [ Width = GridLength.Auto ]
                    ColumnDefinition [ Width = GridLength.Star ]
                    ColumnDefinition [ Width = GridLength.Auto ]
                }
                Border x:name="PART_NavSlot"
                    [ Grid.Column         = 0,
                      Width               = 48,
                      Height              = 48,
                      Margin              = (4,8,4,8),
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Center ]
                TextBlock x:name="PART_TitleText"
                    [ Grid.Column         = 1,
                      Style               = @TitleLarge,
                      Foreground          = @OnSurface,
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Left,
                      Margin              = (12,0,12,0) ]
                StackPanel x:name="PART_ActionsStack"
                    [ Grid.Column       = 2,
                      Orientation       = Horizontal,
                      VerticalAlignment = Center,
                      Margin            = (4,8,4,8) ]
            }
        }
        // M3 scroll-tint — when the bound ScrollSource flips IsScrolled
        // true (the user has scrolled content under the bar), the
        // container colour switches from @Surface to @SurfaceContainer
        // for differentiation. ScrollSource undefined leaves the bar
        // at @Surface (IsScrolled stays false).
        when ( IsScrolled ) { PART_Border.Background = @SurfaceContainer; }
        // Density — the bar HEIGHT is M3-spec-fixed (64dp), and the nav /
        // actions are 48dp slots that delegate their own touch targets, so
        // the density response is the title's horizontal inset only.
        when ( ThemeManager.Density = Compact ) { PART_TitleText.Margin = (8,0,8,0); }
        when ( ThemeManager.Density = Comfortable ) { PART_TitleText.Margin = (16,0,16,0); }
    }

    // CenterAligned — single row, absolute-centred title. The trick is
    // a 3-column layout where the OUTER columns are equally-weighted
    // stars (so they take the same width regardless of nav / actions
    // intrinsic size), with nav + actions floated within their cell at
    // the bar's edges. The title sits in an Auto-sized centre column
    // that naturally lands on the bar's geometric centre.
    //
    // This was previously deferred (centring within the remaining
    // DockPanel slot rather than the absolute centre) because the .mu
    // compiler didn't accept `ColumnDefinitions { … }` collection-child
    // syntax — that limitation is now lifted.
    Template x:key="DefaultCenterAlignedTopAppBar" [TargetType = TopAppBar] {
        Border x:name="PART_Border" [ Background = @Surface, Height = 64 ] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [ Width = GridLength.Star ]
                    ColumnDefinition [ Width = GridLength.Auto ]
                    ColumnDefinition [ Width = GridLength.Star ]
                }
                Border x:name="PART_NavSlot"
                    [ Grid.Column         = 0,
                      Width               = 48,
                      Height              = 48,
                      Margin              = (4,8,4,8),
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Left ]
                TextBlock x:name="PART_TitleText"
                    [ Grid.Column         = 1,
                      Style               = @TitleLarge,
                      Foreground          = @OnSurface,
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Center,
                      Margin              = (12,0,12,0) ]
                StackPanel x:name="PART_ActionsStack"
                    [ Grid.Column         = 2,
                      Orientation         = Horizontal,
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Right,
                      Margin              = (4,8,4,8) ]
            }
        }
        when ( IsScrolled ) { PART_Border.Background = @SurfaceContainer; }
        // Density — title inset only; bar height + 48dp slots stay fixed.
        when ( ThemeManager.Density = Compact ) { PART_TitleText.Margin = (8,0,8,0); }
        when ( ThemeManager.Density = Comfortable ) { PART_TitleText.Margin = (16,0,16,0); }
    }

    // Medium — two-row, 112dp tall. Row 1 (64dp) carries nav + actions;
    // Row 2 carries the larger title bottom-aligned.
    Template x:key="DefaultMediumTopAppBar" [TargetType = TopAppBar] {
        Border x:name="PART_Border" [ Background = @Surface, Height = 112 ] {
            DockPanel [ LastChildFill = true ] {
                DockPanel [ DockPanel.Dock = Top, Height = 64, LastChildFill = true ] {
                    Border x:name="PART_NavSlot"
                        [ DockPanel.Dock      = Left,
                          Width               = 48,
                          Height              = 48,
                          Margin              = (4,8,4,8),
                          VerticalAlignment   = Center,
                          HorizontalAlignment = Center ]
                    StackPanel x:name="PART_ActionsStack"
                        [ DockPanel.Dock    = Right,
                          Orientation       = Horizontal,
                          VerticalAlignment = Center,
                          Margin            = (4,8,4,8) ]
                    // Empty filler — DockPanel needs a last child to
                    // satisfy LastChildFill. The title is in row 2.
                    Border [ Background = #00000000 ]
                }
                Border [ Padding = (16,0,16,16) ] {
                    TextBlock x:name="PART_TitleText"
                        [ Style               = @HeadlineSmall,
                          Foreground          = @OnSurface,
                          VerticalAlignment   = Bottom,
                          HorizontalAlignment = Left ]
                }
            }
        }
        when ( IsScrolled ) { PART_Border.Background = @SurfaceContainer; }
    }

    // Large — two-row, 152dp tall. Same shape as Medium with a taller
    // title row and HeadlineMedium typography on the title.
    Template x:key="DefaultLargeTopAppBar" [TargetType = TopAppBar] {
        Border x:name="PART_Border" [ Background = @Surface, Height = 152 ] {
            DockPanel [ LastChildFill = true ] {
                DockPanel [ DockPanel.Dock = Top, Height = 64, LastChildFill = true ] {
                    Border x:name="PART_NavSlot"
                        [ DockPanel.Dock      = Left,
                          Width               = 48,
                          Height              = 48,
                          Margin              = (4,8,4,8),
                          VerticalAlignment   = Center,
                          HorizontalAlignment = Center ]
                    StackPanel x:name="PART_ActionsStack"
                        [ DockPanel.Dock    = Right,
                          Orientation       = Horizontal,
                          VerticalAlignment = Center,
                          Margin            = (4,8,4,8) ]
                    Border [ Background = #00000000 ]
                }
                Border [ Padding = (16,0,16,20) ] {
                    TextBlock x:name="PART_TitleText"
                        [ Style               = @HeadlineMedium,
                          Foreground          = @OnSurface,
                          VerticalAlignment   = Bottom,
                          HorizontalAlignment = Left ]
                }
            }
        }
        when ( IsScrolled ) { PART_Border.Background = @SurfaceContainer; }
    }

    // Default Style — picks Template by EffectiveVariant (a derived
    // read-only DP on TopAppBar that equals Variant except when scroll-
    // collapse is engaged, in which case it falls to Small for Medium /
    // Large bars). Small is the baseline.
    //
    // Why EffectiveVariant rather than Variant directly? The Style
    // trigger pipeline holds a single TriggerValue per DP. A multi-
    // condition trigger like `when (IsScrolled and Variant = Large)`
    // overriding `when (Variant = Large)` would not correctly resume
    // the Variant value on IsScrolled releasing — ClearTriggerValue
    // would empty the tier entirely, falling through to the Setter
    // (Small). Driving EffectiveVariant as the trigger key sidesteps
    // that constraint because only one Variant trigger matches the
    // current EffectiveVariant at a time.
    Style [TargetType = TopAppBar] {
        Template = @DefaultSmallTopAppBar;
        when ( EffectiveVariant = CenterAligned ) { Template = @DefaultCenterAlignedTopAppBar; }
        when ( EffectiveVariant = Medium ) { Template = @DefaultMediumTopAppBar; }
        when ( EffectiveVariant = Large ) { Template = @DefaultLargeTopAppBar; }
    }
}
