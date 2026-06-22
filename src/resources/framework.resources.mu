// Default theme entries for the command-surface controls — ToggleButton
// / ToolBar / Menu / MenuButton / ContextMenu. Kept separate from
// `basic.resources.mu` because the surface bundle's `extends Button`
// declarations would TDZ on the not-yet-initialised Button binding if
// they were pulled in through Button's own static block path.
//
// Themes pull this bundle in by listing `MuralFramework` in their
// `dictionaries:` header (see Material's `material.mu`).
//
// MenuButton and ContextMenu each ship TWO keyed templates (trigger +
// popup for MenuButton; just popup for ContextMenu) because they need
// to materialise two visual subtrees with different lifetimes — the
// trigger sits inline in the tree, while the popup is mounted onto the
// PresentationTarget's OverlayLayer when IsOpen flips true. WPF's
// MenuButton / ContextMenu carry an analogous split in their default
// styles; ComboBox + Drawer use the same dual-template shape (see
// `basic.resources.mu`).

resources MuralFramework {

    // ── Per-family dictionaries ────────────────────────────────────
    // Each family's Styles + ControlTemplates live next to its
    // controls under src/framework/<family>/<family>.template.mu.
    // The compiler folds every imported dictionary's entries into
    // this one at Clone() time, so MuralFramework is the single
    // composed handle that material.mu lists in its `dictionaries:`
    // header. New families: drop a .template.mu next to the .ts
    // files and add one import here.
    import Buttons       from "../framework/buttons/buttons.template.mu.js"
    import ButtonGroups  from "../framework/button-groups/button-groups.template.mu.js"
    import Formatting    from "../framework/formatting/formatting.template.mu.js"
    import Markers       from "../framework/markers/markers.template.mu.js"
    import Menus         from "../framework/menu/menu.template.mu.js"
    import Notifications from "../framework/notifications/notifications.template.mu.js"
    import SearchBars    from "../framework/search-bar/search-bar.template.mu.js"
    import Surfaces      from "../framework/surfaces/surfaces.template.mu.js"
    import Tabs          from "../framework/tabs/tabs.template.mu.js"
    import Toggles       from "../framework/toggles/toggles.template.mu.js"
    import Tooltips      from "../framework/tooltips/tooltips.template.mu.js"

    // ── ContentControl: bare-bones content host ────────────────────
    // ContentControl is the base for Button, ToggleButton, IconButton,
    // FAB, Card, … — each of those installs its own default Style via
    // Application._defaultStyle. But a *bare* ContentControl used as a
    // standalone primitive (e.g. when a consumer wants DataTemplate
    // dispatch by Content's type without any decorative chrome — the
    // "render this VM through its DataTemplate, please" idiom) needs
    // a Template too. Without one, the control has no visual children
    // and renders nothing, even when Content is set.
    //
    // The minimal default: a single ContentPresenter that hosts the
    // resolved Content visual. Matches WPF's bare ContentControl. Any
    // derived class with its own Style overrides this without conflict.
    Template x:key="DefaultContentControlTemplate" [TargetType=ContentControl] {
        ContentPresenter
    }
    Style [TargetType=ContentControl] {
        Template = @DefaultContentControlTemplate;
    }

    // ── Menu family (MenuStrip / MenuButton / MenuItem /
    //    MenuSeparator / MenuStripItem / ContextMenu) ──────────────
    // Promoted to src/framework/menu/menu.template.mu.

    // ── ToolBarButton: connected-bar chrome ────────────────────────
    // A ToolBarButton lives inside a ToolBar's inline strip alongside
    // peer buttons and ToolBarSeparators. The strip is meant to read as
    // one connected bar (Google Docs / Material 3 toolbar look), not a
    // row of disconnected pill buttons — so the default CornerRadius is
    // 0 (square), and the owning ToolBar rewrites the button's Position
    // DP after each layout pass to surface where it sits in its group:
    //
    //   * Position = Only   — sole button in its group → fully pill
    //   * Position = First  — leftmost in a multi-button group →
    //                          outer-left corners rounded, inner right
    //                          corners square (flush with the next
    //                          button).
    //   * Position = Last   — rightmost in a multi-button group → mirror
    //                          of First.
    //   * Position = Middle — interior of a group → every corner square.
    //   * Position = None   — standalone (no owning ToolBar) or in the
    //                          overflow popup → square corners.
    //
    // Padding is the M3 icon-button spec (4-square padding around a 24px
    // glyph); a ToolBarButton with `ShowText=true` carries enough room
    // for the label via the inner StackPanel's margin (set by
    // rebuildContent in tool-bar-items.ts).
    Template x:key="DefaultToolBarButton" [TargetType=ToolBarButton] {
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHigh,
                BorderThickness = (0),
                CornerRadius    = 0,
                Padding         = (12,8,12,8) ] {
            ContentPresenter
        }
        // Opaque steps on the M3 SurfaceContainer ladder — going UP
        // for hover gives the button visibly more emphasis vs. the
        // surrounding @Surface toolbar, going DOWN for press signals
        // the "depressed" tap feedback. Using @StateHoverOverlay /
        // @StatePressOverlay here would be barely visible because
        // those tokens are translucent OnSurface tints; REPLACING the
        // resting @SurfaceContainerHigh with a translucent overlay
        // shows the toolbar's @Surface bleeding through, making hover
        // look LESS opaque than rest. MenuItem rows can use the
        // overlays because they're transparent at rest — see the
        // comment on DefaultMenuItemRow.
        when ( IsMouseOver )           { PART_Border.Background   = @SurfaceContainerHighest; }
        when ( IsPressed )             { PART_Border.Background   = @SurfaceContainer; }
        when ( Position = Only  )      { PART_Border.CornerRadius = CornerRadius.Full; }
        when ( Position = First )      { PART_Border.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last  )      { PART_Border.CornerRadius = CornerRadius.RightRounded; }
        // Adaptive layout — tighter in Compact, larger touch target
        // on coarse-pointer devices.
        when ( ThemeManager.Density = Compact )     { PART_Border.Padding = (8,4,8,4); }
        when ( ThemeManager.Density = Comfortable ) { PART_Border.Padding = (16,10,16,10); }
        when ( ThemeManager.Pointer = Coarse )      { PART_Border.Padding = (16,14,16,14); }
    }

    Style [TargetType=ToolBarButton] {
        Template = @DefaultToolBarButton;
    }

    // ── IconButton / IconButtonToggle / FloatingActionButton ─────────
    // Promoted to src/framework/buttons/buttons.template.mu.

    // ── Card ───────────────────────────────────────────────────────
    // Promoted to src/framework/surfaces/surfaces.template.mu.

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
    Template x:key="DefaultSmallTopAppBar" [TargetType=TopAppBar] {
        Border x:name="PART_Border"
              [ Background = @Surface,
                Height     = 64 ] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                    ColumnDefinition [Width=GridLength.Auto]
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
                           FontFamily          = @TitleLargeFont,
                           FontWeight          = @TitleLargeWeight,
                           FontSize            = @TitleLargeSize,
                           LineHeight          = @TitleLargeLineHeight,
                           LetterSpacing       = @TitleLargeTracking,
                           Foreground          = @OnSurface,
                           VerticalAlignment   = Center,
                           HorizontalAlignment = Left,
                           Margin              = (12,0,12,0) ]
                StackPanel x:name="PART_ActionsStack"
                          [ Grid.Column      = 2,
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
    Template x:key="DefaultCenterAlignedTopAppBar" [TargetType=TopAppBar] {
        Border x:name="PART_Border"
              [ Background = @Surface,
                Height     = 64 ] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Star]
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
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
                           FontFamily          = @TitleLargeFont,
                           FontWeight          = @TitleLargeWeight,
                           FontSize            = @TitleLargeSize,
                           LineHeight          = @TitleLargeLineHeight,
                           LetterSpacing       = @TitleLargeTracking,
                           Foreground          = @OnSurface,
                           VerticalAlignment   = Center,
                           HorizontalAlignment = Center,
                           Margin              = (12,0,12,0) ]
                StackPanel x:name="PART_ActionsStack"
                          [ Grid.Column      = 2,
                            Orientation       = Horizontal,
                            VerticalAlignment = Center,
                            HorizontalAlignment = Right,
                            Margin            = (4,8,4,8) ]
            }
        }
        when ( IsScrolled ) { PART_Border.Background = @SurfaceContainer; }
    }

    // Medium — two-row, 112dp tall. Row 1 (64dp) carries nav + actions;
    // Row 2 carries the larger title bottom-aligned.
    Template x:key="DefaultMediumTopAppBar" [TargetType=TopAppBar] {
        Border x:name="PART_Border"
              [ Background = @Surface,
                Height     = 112 ] {
            DockPanel [LastChildFill=true] {
                DockPanel [DockPanel.Dock=Top, Height=64, LastChildFill=true] {
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
                    Border [Background = #00000000]
                }
                Border [Padding=(16,0,16,16)] {
                    TextBlock x:name="PART_TitleText"
                             [ FontFamily          = @HeadlineSmallFont,
                               FontWeight          = @HeadlineSmallWeight,
                               FontSize            = @HeadlineSmallSize,
                               LineHeight          = @HeadlineSmallLineHeight,
                               LetterSpacing       = @HeadlineSmallTracking,
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
    Template x:key="DefaultLargeTopAppBar" [TargetType=TopAppBar] {
        Border x:name="PART_Border"
              [ Background = @Surface,
                Height     = 152 ] {
            DockPanel [LastChildFill=true] {
                DockPanel [DockPanel.Dock=Top, Height=64, LastChildFill=true] {
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
                    Border [Background = #00000000]
                }
                Border [Padding=(16,0,16,20)] {
                    TextBlock x:name="PART_TitleText"
                             [ FontFamily          = @HeadlineMediumFont,
                               FontWeight          = @HeadlineMediumWeight,
                               FontSize            = @HeadlineMediumSize,
                               LineHeight          = @HeadlineMediumLineHeight,
                               LetterSpacing       = @HeadlineMediumTracking,
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
    Style [TargetType=TopAppBar] {
        Template = @DefaultSmallTopAppBar;
        when ( EffectiveVariant = CenterAligned ) { Template = @DefaultCenterAlignedTopAppBar; }
        when ( EffectiveVariant = Medium        ) { Template = @DefaultMediumTopAppBar; }
        when ( EffectiveVariant = Large         ) { Template = @DefaultLargeTopAppBar; }
    }

    // ── NavigationRail / NavigationBar items panels ────────────────
    // Mural's ItemsPanelTemplate uses the keyed-resource pattern (the
    // inline `ItemsPanel = ItemsPanelTemplate { … }` form isn't
    // accepted by the markup compiler). Each panel template emits one
    // fresh Panel instance per ItemsControl realisation.
    ItemsPanelTemplate x:key="DefaultNavigationRailPanel" {
        StackPanel [Orientation=Vertical]
    }

    ItemsPanelTemplate x:key="DefaultNavigationBarPanel" {
        UniformGrid [Rows=1]
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
    Template x:key="DefaultNavigationItem" [TargetType=NavigationItem] {
        Border x:name="PART_Outer"
              [ Background       = #00000000,
                // 12dp top/bottom matches the M3 spec for nav-rail item
                // padding (icon container has its own 8dp gap below, set
                // by PART_LabelText.Margin). 4dp left/right keeps the
                // 56dp pill centred within the 80dp rail with breathing
                // room on each side.
                Padding          = (4,12,4,12),
                HorizontalAlignment = Stretch ] {
            StackPanel [Orientation=Vertical, HorizontalAlignment=Center] {
                Border x:name="PART_IconContainer"
                      [ Background   = #00000000,
                        CornerRadius = @ShapeFull,
                        Width        = 56,
                        Height       = 32,
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
                                         [Width  = 24,
                                          Height = 24,
                                          HorizontalAlignment = Center,
                                          VerticalAlignment   = Center]
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
                           // Wrap so longer labels (e.g. "Styles & Triggers"
                           // in the platform demo) flow onto a second line
                           // rather than getting clipped at the rail's 80dp
                           // edge. Stretch + TextAlignment=Center keeps the
                           // wrapped lines centred under the icon pill.
                           TextWrapping        = Wrap,
                           Margin              = (0,4,0,0) ]
            }
        }
        when ( IsSelected )  { PART_IconContainer.Background = @SecondaryContainer;
                               PART_LabelText.Foreground     = @OnSurface;
                               PART_LabelText.FontWeight     = @TypefaceWeightMedium; }
        when ( IsMouseOver ) { PART_IconStateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   ) { PART_IconStateLayer.Background = @OnSurfaceVariantPressLayer; }
    }

    // The NavigationItem Style just installs the default template.
    // Icon / Label DP → template-part sync runs in the class itself
    // (NavigationItem.OnPropertyChanged finds PART_IconSlot /
    // PART_LabelText and writes through them). Class-level sync chosen
    // over Style triggers because the compiler's `when (X != "")` form
    // isn't supported — the trigger DSL only accepts `=` equality
    // comparisons today.
    Style [TargetType=NavigationItem] {
        Template = @DefaultNavigationItem;
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
    Template x:key="DefaultNavigationRail" [TargetType=NavigationRail] {
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @OutlineVariant,
                BorderThickness = (0,0,1,0),
                Width           = 80 ] {
            DockPanel [LastChildFill=true] {
                ContentPresenter x:name="PART_HeaderSlot"
                                [DockPanel.Dock=Top,
                                 HorizontalAlignment=Center,
                                 Margin=(0,12,0,12)]
                ContentPresenter x:name="PART_FooterSlot"
                                [DockPanel.Dock=Bottom,
                                 HorizontalAlignment=Center,
                                 Margin=(0,8,0,8)]
                ItemsPresenter x:name="PART_ItemsPresenter"
                              [VerticalAlignment=Top]
            }
        }
    }

    // Style installs the template + the vertical-stack ItemsPanel.
    // Header / Footer DP → PART_HeaderSlot / PART_FooterSlot sync is
    // handled in NavigationRail.OnPropertyChanged (compiler doesn't
    // support `when (X != $null)` triggers).
    Style [TargetType=NavigationRail] {
        Template   = @DefaultNavigationRail;
        ItemsPanel = @DefaultNavigationRailPanel;
    }

    // ── NavigationBar: horizontal bottom tab strip ─────────────────
    // M3 spec: 80dp tall, full-width. Items distribute evenly across
    // the width via a horizontal UniformGrid (every item gets the same
    // share regardless of label length).
    //
    // No Header / Footer slots — the Bar pattern doesn't carry them in
    // M3 (only Rail does).
    Template x:key="DefaultNavigationBar" [TargetType=NavigationBar] {
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @OutlineVariant,
                BorderThickness = (0,1,0,0),
                Height          = 80 ] {
            ItemsPresenter x:name="PART_ItemsPresenter"
                          [VerticalAlignment=Center]
        }
    }

    Style [TargetType=NavigationBar] {
        Template   = @DefaultNavigationBar;
        ItemsPanel = @DefaultNavigationBarPanel;
    }

    // ── Switch / Checkbox / RadioButton ─────────────────────────────
    // Promoted to src/framework/toggles/toggles.template.mu.

    // ── Chip ────────────────────────────────────────────────────────
    // Promoted to src/framework/markers/markers.template.mu.

    // ── SegmentedButton / SegmentedItem / SplitButton ───────────────
    // Promoted to src/framework/button-groups/button-groups.template.mu.

    // ── TabControl / TabItem ────────────────────────────────────────
    // Promoted to src/framework/tabs/tabs.template.mu.

    // ── SearchBar ───────────────────────────────────────────────────
    // Promoted to src/framework/search-bar/search-bar.template.mu.
    // ── Divider / Badge ─────────────────────────────────────────────
    // Promoted to src/framework/markers/markers.template.mu.

    // ── ProgressIndicator / Banner / Snackbar ───────────────────────
    // Promoted to src/framework/notifications/notifications.template.mu.

    // ── Dialog / BottomSheet ───────────────────────────────────────
    // Promoted to src/framework/surfaces/surfaces.template.mu.

    // ── ToolBarToggleButton: connected-bar chrome ──────────────────
    // Same shape as ToolBarButton but with an IsChecked trigger on top —
    // the chrome reads as "Filled Tonal" while checked so a sticky
    // toggle (Bold, Italic, …) stays visible against the surrounding
    // square buttons. The position triggers ride on top of IsChecked
    // because they target a different DP (CornerRadius vs Background).
    Template x:key="DefaultToolBarToggleButton" [TargetType=ToolBarToggleButton] {
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHigh,
                BorderThickness = (0),
                CornerRadius    = 0,
                Padding         = (12,8,12,8) ] {
            ContentPresenter
        }
        // Same SurfaceContainer-ladder pattern as DefaultToolBarButton
        // (see the comment there for why opaque steps beat overlays
        // for this template). IsChecked is declared LAST so its
        // @SecondaryContainer setter outranks hover / press when the
        // toggle is checked — matches the "checked beats hover" intent
        // the previous template carried.
        when ( IsMouseOver )       { PART_Border.Background  = @SurfaceContainerHighest; }
        when ( IsPressed )         { PART_Border.Background  = @SurfaceContainer; }
        when ( IsChecked )         { PART_Border.Background  = @SecondaryContainer; }
        when ( Position = Only  )  { PART_Border.CornerRadius = CornerRadius.Full; }
        when ( Position = First )  { PART_Border.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last  )  { PART_Border.CornerRadius = CornerRadius.RightRounded; }
        // Adaptive layout (§ 17.7) — match DefaultToolBarButton's
        // density / pointer triggers so the connected-bar group stays
        // visually consistent when one button is a toggle.
        when ( ThemeManager.Density = Compact )      { PART_Border.Padding = (8,4,8,4); }
        when ( ThemeManager.Density = Comfortable )  { PART_Border.Padding = (16,10,16,10); }
        when ( ThemeManager.Pointer = Coarse )       { PART_Border.Padding = (16,14,16,14); }
    }

    Style [TargetType=ToolBarToggleButton] {
        Template = @DefaultToolBarToggleButton;
    }

    // ── ToolBarSeparator (vertical divider) ────────────────────────
    // 1-px line painted by the class's RenderOverride. The Style
    // supplies Width / MinHeight / LineBrush so divider tints follow
    // the active theme. Same shape MenuSeparator / StatusBarSeparator
    // use — the imperative `LineBrush ?? Theme.fieldBorder` fallback
    // is gone now that the DP default rides through DynamicResource.
    Style [TargetType=ToolBarSeparator] {
        Width     = 9;
        MinHeight = 16;
        LineBrush = @Outline;
    }

    // ── ToolBar: inline chrome ─────────────────────────────────────
    // Border + DockPanel + chevron + ItemsPresenter. ToolBar's ctor
    // calls applyDefaultStyle, then FindNames each PART_ — the chevron
    // gets its click handler wired here, the popup is materialised
    // separately via @DefaultToolBarPopup.
    //
    // The chevron is a plain Button (Filled variant — gets its M3 pill
    // chrome from the basic theme). Its width is toggled between
    // Number.NaN (auto) and 0 by ToolBar.applyChevronVisibility based
    // on whether any items have overflowed.
    Template x:key="DefaultToolBar" [TargetType=ToolBar] {
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @Outline,
                BorderThickness = (1),
                Padding         = (4) ] {
            DockPanel x:name="PART_Layout" [LastChildFill=true] {
                Button x:name="PART_Chevron" [DockPanel.Dock=Right] {
                    TextBlock [Text="⋯"]
                }
                ItemsPresenter x:name="PART_ItemsPresenter"
            }
        }
    }

    // ── ToolBar: overflow popup ────────────────────────────────────
    // Mounted onto the PresentationTarget's OverlayLayer when
    // IsOverflowOpen flips true. PART_PopupList is an internal
    // ItemsControl bound to ToolBar._overflowedItems (the items that
    // moved off the inline strip because they wouldn't fit).
    // PART_PopupHost.anchor is wired to the chevron in ToolBar's ctor.
    Template x:key="DefaultToolBarPopup" [TargetType=ToolBar] {
        ToolBarPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness=(0)]
            Border x:name="PART_PopupContainer"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    Padding         = (4) ] {
                ToolBarOverflowItemsControl x:name="PART_PopupList"
            }
        }

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
    }

    Style [TargetType=ToolBar] {
        Template      = @DefaultToolBar;
        PopupTemplate = @DefaultToolBarPopup;
    }

    // ── StatusBar: bottom strip ────────────────────────────────────
    // ItemsControl wrapping each item in a StatusBarItem. The default
    // ItemsPanel is a DockPanel with LastChildFill=true so authors can
    // dock left/right cells via `DockPanel.Dock` on each item and put a
    // stretchy middle one last. Chrome is a single Border on top of
    // @SurfaceContainerLow.
    Template x:key="DefaultStatusBar" [TargetType=StatusBar] {
        Border [ Background      = @SurfaceContainerLow,
                 BorderBrush     = @OutlineVariant,
                 BorderThickness = (0,1,0,0),
                 Padding         = (4,2,4,2) ] {
            ItemsPresenter
        }
    }

    // ── StatusBar: DockPanel items panel ───────────────────────────
    // Dockable cells out of the box. Setting DockPanel.Dock on a
    // StatusBarItem in markup pins it to the corresponding edge; the
    // last un-docked cell fills the residue.
    ItemsPanelTemplate x:key="DefaultStatusBarPanel" {
        DockPanel [LastChildFill = true]
    }

    Style [TargetType=StatusBar] {
        Template   = @DefaultStatusBar;
        ItemsPanel = @DefaultStatusBarPanel;
    }

    // ── StatusBarItem (one cell) ───────────────────────────────────
    // Padded ContentPresenter. No state triggers — status cells are
    // read-only chrome, not interactive surfaces, so they don't react
    // to IsMouseOver / IsPressed.
    //
    // No Foreground / FontSize setters here: those DPs live on TextBlock,
    // not on Visual / Control / ContentControl, so a Style setter targeting
    // the StatusBarItem type would be silently dropped by apply_setter.
    // Consumers set Foreground / FontSize on the TextBlock they place
    // inside the Content (bound to @OnSurfaceVariant so theme switches
    // re-tint).
    Template x:key="DefaultStatusBarItem" [TargetType=StatusBarItem] {
        Border [ Padding = (8,2,8,2) ] {
            ContentPresenter
        }
    }
    Style [TargetType=StatusBarItem] {
        Template = @DefaultStatusBarItem;
    }

    // ── StatusBarSeparator (vertical divider) ──────────────────────
    // 1-px line painted by the class's RenderOverride. The Style
    // supplies Width / MinHeight / LineBrush so the divider tints
    // follow the active theme.
    Style [TargetType=StatusBarSeparator] {
        Width     = 9;
        MinHeight = 16;
        LineBrush = @OutlineVariant;
    }

    // ── ThemeSelector (theme + scheme picker) ──────────────────────
    // Two icon-toggle + ComboBox pairs in a horizontal row. Each icon
    // is a Text-variant Button (no chrome — paints just the glyph);
    // clicking it flips the matching IsXxxPickerOpen DP on the
    // ThemeSelector, which the template triggers below pick up to
    // expand the sibling ComboBox from Width=0 / Opacity=0 to its
    // resting width.
    //
    // The ComboBox lives wrapped in a Border whose Width is what the
    // open/closed trigger toggles. Keeping the toggle on the wrapper
    // (not the ComboBox itself) means the ComboBox's natural measure
    // pass is undisturbed when it's open — width is just the wrapper
    // clipping it down to zero when closed.
    //
    // ThemeSelector's ctor finds PART_ThemeToggle / PART_ThemeCombo /
    // PART_SchemeToggle / PART_SchemeCombo and wires click + selection
    // listeners. Items + SelectedItem on both ComboBoxes are written
    // imperatively from syncFromThemeManager — the bound list is
    // derived from ThemeManager state, not authored declaratively.
    Template x:key="DefaultThemeSelector" [TargetType=ThemeSelector] {
        StackPanel x:name="PART_Layout" [Orientation = Horizontal] {
            // Always-visible icon affordances. TextBlock Foreground is
            // tinted to @OnPrimary so the icons stay legible on the top
            // app bar; hosts hanging the ThemeSelector on a different
            // surface should re-template and pick their own Foreground.
            TextBlock [Style = @LabelLarge, Text = "Aa", Foreground = @OnPrimary,
                       VerticalAlignment = Center, Margin = (4,0,4,0)]
            Border x:name="PART_ThemeComboWrap"
                  [Width = 0, MinWidth = 0, Opacity = 0, Padding = (4,0,4,0)] {
                ComboBox x:name="PART_ThemeCombo" [Width = 140, ThemeManager.Density = Compact]
            }

            TextBlock [Style = @LabelLarge, Text = "◐", Foreground = @OnPrimary,
                       VerticalAlignment = Center, Margin = (4,0,4,0)]
            Border x:name="PART_SchemeComboWrap"
                  [Width = 0, MinWidth = 0, Opacity = 0, Padding = (4,0,4,0)] {
                ComboBox x:name="PART_SchemeCombo" [Width = 140, ThemeManager.Density = Compact]
            }
        }

        // Slide-in reveal driven by hover. The IsMouseOver trigger
        // fires off the ThemeSelector's own hover state (each trigger's
        // default source is the templated parent). The parallel
        // PART_xxxCombo.IsDropDownOpen trigger carries the same body —
        // it keeps the combo visible while its dropdown popup is open,
        // since opening the popup moves the cursor onto the
        // OverlayLayer-mounted popup and would otherwise drop
        // IsMouseOver to false and retract the combo out from under
        // the pointer. Trigger semantics make this safe: both triggers
        // write the same property/value pair, so concurrent activation
        // is idempotent. Closed state (neither trigger active) is the
        // resting Width=0 / Opacity=0 baked into the template above.
        //
        // The compiler's ControlTemplate trigger system accepts only
        // single-term `when()` conditions today, so we duplicate the
        // body across two triggers rather than spelling `IsMouseOver or
        // PART_xxxCombo.IsDropDownOpen`.
        when ( IsMouseOver )                  { PART_ThemeComboWrap.Width   = 148;
                                                 PART_ThemeComboWrap.Opacity = 1; }
        when ( PART_ThemeCombo.IsDropDownOpen ){ PART_ThemeComboWrap.Width   = 148;
                                                 PART_ThemeComboWrap.Opacity = 1; }
        when ( IsMouseOver )                  { PART_SchemeComboWrap.Width   = 148;
                                                 PART_SchemeComboWrap.Opacity = 1; }
        when ( PART_SchemeCombo.IsDropDownOpen ){ PART_SchemeComboWrap.Width   = 148;
                                                  PART_SchemeComboWrap.Opacity = 1; }
    }

    Style [TargetType=ThemeSelector] {
        Template = @DefaultThemeSelector;
    }

    // ── ColorPicker / BrushPicker / PenEditor / FillEditor /
    //    ShapeFormatControl ────────────────────────────────────────
    // Promoted to src/framework/formatting/formatting.template.mu.

    // ── Tooltip + CommandBase DataTemplate ──────────────────────────
    // Promoted to src/framework/tooltips/tooltips.template.mu.
}
