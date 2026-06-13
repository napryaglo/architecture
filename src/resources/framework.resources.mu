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

    // ── MenuButton: trigger button ─────────────────────────────────
    // The visible inline part of a MenuButton — a Button with a header
    // text label. MenuButton's ctor wires Click on PART_Trigger to flip
    // IsOpen; OnPropertyChanged keeps PART_HeaderText.Text in sync with
    // the Header DP, and rebuilds the inner stack when Icon changes.
    // The trigger Button is a regular framework Button so its chrome
    // (state-layer ladder + variant family + density triggers) rides
    // through Button's default Style transitively — no audit work
    // duplicated here. PART_HeaderText is the only knob the trigger
    // template owns; LabelLarge is the M3 menu-button label role.
    Template x:key="DefaultMenuButtonTrigger" [TargetType=MenuButton]{
        Button x:name="PART_Trigger"{
            StackPanel x:name="PART_TriggerStack" [Orientation = Horizontal]{
                TextBlock x:name="PART_HeaderText"
                         [ Foreground          = @OnPrimary,
                           FontFamily          = @LabelLargeFont,
                           FontWeight          = @LabelLargeWeight,
                           FontSize             = @LabelLargeSize,
                           LineHeight           = @LabelLargeLineHeight,
                           LetterSpacing        = @LabelLargeTracking ]
            }
        }
    }

    // ── MenuButton: popup overlay ──────────────────────────────────
    // Mounted onto the PresentationTarget's OverlayLayer when IsOpen
    // flips true; unmounted on close. PART_Scrim absorbs outside clicks,
    // PART_PopupContainer is the chrome around an ItemsPresenter that
    // hosts MenuButton's ItemsPanel (vertical StackPanel by default).
    // MenuButton's ctor sets PART_PopupHost.anchor to PART_Trigger so
    // the popup positions itself just below the trigger.
    //
    // This template is plugged into the Style below as MenuButton's
    // ItemsControl.Template. MenuButton then immediately DETACHES the
    // resulting templateRoot from itself so the only in-tree child is
    // the trigger Button; mountPopup() re-attaches it onto the
    // OverlayLayer when IsOpen flips true.
    Template x:key="DefaultMenuButtonPopup" [TargetType=MenuButton]{
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
            Border x:name="PART_PopupContainer"
                  [Background      = @SurfaceContainerHigh,
                   BorderBrush     = @OutlineVariant,
                   BorderThickness = (1),
                   CornerRadius    = @ShapeExtraSmall,
                   Effect          = @Elevation2,
                   Padding         = (0)]{
                ItemsPresenter
            }
        }
    }

    // ── MenuButton: default Style ──────────────────────────────────
    // Pins the axis defaults so the MenuButton sizes to its trigger's
    // natural width rather than stretching, AND wires both templates
    // the control needs:
    //   * Template        — the popup chrome (with ItemsPresenter)
    //   * TriggerTemplate — the inline visible Button. Read by the
    //                       ctor via the DP getter; the trigger and
    //                       the popup must live in two separate
    //                       templates because Template's
    //                       ItemsPresenter has to host items inside
    //                       the popup, not inline.
    //   * ItemsPanel      — vertical stack for the materialised rows
    Style [TargetType=MenuButton] {
        HorizontalAlignment = Left;
        VerticalAlignment   = Top;
        Template            = @DefaultMenuButtonPopup;
        TriggerTemplate     = @DefaultMenuButtonTrigger;
        ItemsPanel          = @DefaultMenuItemsPanel;
    }

    // ── ContextMenu: popup overlay ─────────────────────────────────
    // Same shape as the MenuButton popup, minus the anchor — ContextMenu
    // positions the popup at a fixed host-coords point set by OpenAt().
    // ContextMenu IS an ItemsControl whose ControlTemplate is this
    // popup chrome: when OpenAt mounts the ContextMenu on the
    // PresentationTarget's OverlayLayer, this template subtree renders.
    // The ItemsPresenter slots in ContextMenu's ItemsPanel, which
    // materialises the MenuItem rows.
    Template x:key="DefaultContextMenuPopup" [TargetType=ContextMenu]{
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
            Border x:name="PART_PopupContainer"
                  [Background      = @SurfaceContainerHigh,
                   BorderBrush     = @OutlineVariant,
                   BorderThickness = (1),
                   CornerRadius    = @ShapeExtraSmall,
                   Effect          = @Elevation2,
                   Padding         = (0)]{
                ItemsPresenter
            }
        }
    }

    // ── ContextMenu: default Style ─────────────────────────────────
    // Wires the popup template + the vertical-stack ItemsPanel that
    // materialises into the template's ItemsPresenter slot.
    Style [TargetType=ContextMenu] {
        Template   = @DefaultContextMenuPopup;
        ItemsPanel = @DefaultMenuItemsPanel;
    }

    // ── Vertical-stack items panel ─────────────────────────────────
    // Shared by ContextMenu, MenuButton, and MenuItem's submenu popup.
    // The bordered chrome around items comes from each control's own
    // popup ControlTemplate; this just provides the StackPanel that
    // materialises into the ItemsPresenter slot.
    ItemsPanelTemplate x:key="DefaultMenuItemsPanel" {
        StackPanel [Orientation = Vertical]
    }

    // ── MenuSeparator: chrome tokens ───────────────────────────────
    // MenuSeparator paints its own thin line via RenderOverride —
    // the Style just tunes the default size and LineBrush so the
    // default visual flips with the theme palette without forcing
    // each consumer to set LineBrush explicitly.
    Style [TargetType=MenuSeparator] {
        Height    = 9;
        MinWidth  = 16;
        LineBrush = @OutlineVariant;
    }

    // ── MenuItem: row chrome ───────────────────────────────────────
    // The row is a single PART_Row Border hosting a horizontal stack
    // with four columns: icon / header / gesture / chevron. Each
    // column's Visual is named so MenuItem's ctor can grab it via
    // FindName for content updates (the Header / Icon /
    // InputGestureText DPs feed the Text / Child slots imperatively,
    // and the chevron column auto-hides when there's no submenu).
    //
    // State chrome is fully declarative:
    //   * IsMouseOver / IsPressed swap PART_Row.Background through
    //     the SurfaceContainer ramp (matches the M3 menu-item
    //     hover / pressed surface).
    //   * IsChecked and IsSubmenuOpen both tint the row
    //     @SecondaryContainer — same token the default ListBoxItem
    //     selection state uses.
    //
    // Mural's TriggerValue tier sits ABOVE LocalValue (see
    // effective-value.ts), so the trigger Background writes win over
    // the row's factory defaults even when authors re-skin via a
    // child Style.
    //
    // This template is applied IMPERATIVELY by MenuItem's ctor (via
    // resolveSurfaceTemplate + Apply(this)) and attached as
    // visualChildren[0]. MenuItem's primary ControlTemplate (the one
    // ItemsControl wires) is the submenu popup chrome below.
    Template x:key="DefaultMenuItemRow" [TargetType=MenuItem] {
        Border x:name="PART_Row"
              [ Padding = (@Spacing2, @Spacing1, @Spacing2, @Spacing1) ] {
            StackPanel [Orientation = Horizontal] {
                // Icon column reserves 24dp for an M3-spec leading
                // icon. Width / MinWidth stay inline as a column-grid
                // constant — the M3 menu spec calls for a 24dp icon
                // slot specifically (not a generic spacing token).
                Border    x:name="PART_Icon"    [Width = 24, MinWidth = 24]
                TextBlock x:name="PART_Label"
                         [ Margin              = (@Spacing2, 0, @Spacing4, 0),
                           MinWidth            = 80,
                           Foreground          = @OnSurface,
                           FontFamily          = @LabelLargeFont,
                           FontWeight          = @LabelLargeWeight,
                           FontSize            = @LabelLargeSize,
                           LineHeight          = @LabelLargeLineHeight,
                           LetterSpacing       = @LabelLargeTracking ]
                TextBlock x:name="PART_Gesture"
                         [ Margin              = (0, 0, @Spacing4, 0),
                           Foreground          = @OnSurfaceVariant,
                           FontFamily          = @LabelMediumFont,
                           FontWeight          = @LabelMediumWeight,
                           FontSize            = @LabelMediumSize,
                           LineHeight          = @LabelMediumLineHeight,
                           LetterSpacing       = @LabelMediumTracking ]
                TextBlock x:name="PART_Chevron" [Width = 12,
                                                 Foreground = @OnSurfaceVariant]
            }
        }
        // M3 state-layer tokens — semi-transparent OnSurface tints over
        // whatever surface the popup chrome paints. Using a solid token
        // like @SurfaceContainerHigh here would be invisible — the
        // ContextMenu / MenuButton popup chrome IS @SurfaceContainerHigh.
        when ( IsMouseOver )       { PART_Row.Background = @StateHoverOverlay; }
        when ( IsFocused )         { PART_Row.Background = @StateFocusOverlay; }
        when ( IsPressed )         { PART_Row.Background = @StatePressOverlay; }
        when ( IsChecked )         { PART_Row.Background = @SecondaryContainer; }
        when ( IsSubmenuOpen )     { PART_Row.Background = @SecondaryContainer; }
        when ( IsEnabled = false ) { PART_Row.Opacity    = @DisabledContentOpacity; }

        // M3 density variants — tighter Padding on Compact, looser on
        // Comfortable. Matches the same shape ListBoxItem / ComboBox use.
        when ( ThemeManager.Density = Compact )     { PART_Row.Padding = (@Spacing2, @Spacing0, @Spacing2, @Spacing0); }
        when ( ThemeManager.Density = Comfortable ) { PART_Row.Padding = (@Spacing2, @Spacing2, @Spacing2, @Spacing2); }
        when ( ThemeManager.Pointer = Coarse )      { PART_Row.Padding = (@Spacing3, @Spacing3, @Spacing3, @Spacing3); }
    }

    // ── MenuItem: submenu popup chrome ─────────────────────────────
    // Mounted onto the PresentationTarget's OverlayLayer when
    // IsSubmenuOpen flips true; unmounted on close. PART_Scrim absorbs
    // outside clicks, PART_PopupContainer is the chrome around the
    // ItemsPresenter that hosts MenuItem's items panel (submenu rows).
    // MenuItem's ctor sets PART_PopupHost.anchor to its own row so the
    // submenu positions itself just below the parent row.
    //
    // This is MenuItem's ItemsControl.Template — wired in the Style
    // below. MenuItem's ctor DETACHES the templateRoot from itself so
    // it can be mounted on the overlay without dual-parent errors.
    Template x:key="DefaultMenuItemSubmenu" [TargetType=MenuItem] {
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
            Border x:name="PART_PopupContainer"
                  [Background      = @SurfaceContainerHigh,
                   BorderBrush     = @OutlineVariant,
                   BorderThickness = (1),
                   CornerRadius    = @ShapeExtraSmall,
                   Effect          = @Elevation2,
                   Padding         = (0)]{
                ItemsPresenter
            }
        }
    }

    Style [TargetType=MenuItem] {
        Template     = @DefaultMenuItemSubmenu;
        ItemsPanel   = @DefaultMenuItemsPanel;
        RowTemplate  = @DefaultMenuItemRow;
    }

    // ── MenuStripItem: stripped row chrome ─────────────────────────
    // Top-level row inside a MenuStrip. Same Border + state triggers
    // as the standard row, but the icon / gesture / chevron columns
    // collapse to zero width — only the header is visible. The
    // submenu popup mechanic (defined by MenuItem's primary Template)
    // still applies, so clicking a top-level item opens its submenu
    // popup below.
    Template x:key="DefaultMenuStripItemRow" [TargetType=MenuItem] {
        Border x:name="PART_Row"
              [ Padding = (@Spacing3, @Spacing1, @Spacing3, @Spacing1) ] {
            StackPanel [Orientation = Horizontal] {
                Border    x:name="PART_Icon"    [Width = 0, MinWidth = 0]
                TextBlock x:name="PART_Label"
                         [ MinWidth            = 0,
                           Foreground          = @OnSurface,
                           FontFamily          = @LabelLargeFont,
                           FontWeight          = @LabelLargeWeight,
                           FontSize            = @LabelLargeSize,
                           LineHeight          = @LabelLargeLineHeight,
                           LetterSpacing       = @LabelLargeTracking ]
                TextBlock x:name="PART_Gesture" [Width = 0,
                                                 Foreground = @OnSurfaceVariant]
                TextBlock x:name="PART_Chevron" [Width = 0,
                                                 Foreground = @OnSurfaceVariant]
            }
        }
        // State-layer tokens — see DefaultMenuItemRow above for why.
        when ( IsMouseOver )       { PART_Row.Background = @StateHoverOverlay; }
        when ( IsFocused )         { PART_Row.Background = @StateFocusOverlay; }
        when ( IsPressed )         { PART_Row.Background = @StatePressOverlay; }
        when ( IsSubmenuOpen )     { PART_Row.Background = @SecondaryContainer; }
        when ( IsEnabled = false ) { PART_Row.Opacity    = @DisabledContentOpacity; }

        when ( ThemeManager.Density = Compact )     { PART_Row.Padding = (@Spacing3, @Spacing0, @Spacing3, @Spacing0); }
        when ( ThemeManager.Density = Comfortable ) { PART_Row.Padding = (@Spacing3, @Spacing2, @Spacing3, @Spacing2); }
        when ( ThemeManager.Pointer = Coarse )      { PART_Row.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
    }

    // Style for MenuStrip top-level rows — applied via
    // MenuStrip.ItemContainerStyle so each container MenuItem gets
    // the stripped chrome. The ItemContainerStyle factory is in
    // surface-resources; this Style is keyed (not implicit-by-type)
    // to keep nested MenuItems on their default row.
    Style x:key="MenuStripItemStyle" [TargetType=MenuItem] {
        RowTemplate = @DefaultMenuStripItemRow;
    }

    // ── MenuStrip: horizontal panel default ────────────────────────
    ItemsPanelTemplate x:key="DefaultMenuStripPanel" {
        StackPanel [Orientation = Horizontal]
    }
    Style [TargetType=MenuStrip] {
        Background         = @SurfaceContainerLow;
        Padding            = (4,2,4,2);
        ItemsPanel         = @DefaultMenuStripPanel;
        ItemContainerStyle = @MenuStripItemStyle;
    }

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
    Template x:key="DefaultFilledIconButton" [TargetType=IconButton] {
        Border x:name="PART_Border"
              [ Background          = @Primary,
                BorderThickness     = (0),
                CornerRadius        = @ShapeFull,
                Width               = 40,
                Height              = 40,
                TextBlock.Foreground = @OnPrimary ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )                    { PART_StateLayer.Background = @OnPrimaryHoverLayer; }
        when ( IsPressed   )                    { PART_StateLayer.Background = @OnPrimaryPressLayer; }
        when ( ThemeManager.Pointer = Coarse )  { PART_Border.Width  = 48;
                                                  PART_Border.Height = 48; }
    }

    // Tonal — SecondaryContainer, OnSecondaryContainer glyph.
    Template x:key="DefaultTonalIconButton" [TargetType=IconButton] {
        Border x:name="PART_Border"
              [ Background          = @SecondaryContainer,
                BorderThickness     = (0),
                CornerRadius        = @ShapeFull,
                Width               = 40,
                Height              = 40,
                TextBlock.Foreground = @OnSecondaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )                    { PART_StateLayer.Background = @OnSecondaryContainerHoverLayer; }
        when ( IsPressed   )                    { PART_StateLayer.Background = @OnSecondaryContainerPressLayer; }
        when ( ThemeManager.Pointer = Coarse )  { PART_Border.Width  = 48;
                                                  PART_Border.Height = 48; }
    }

    // Outlined — transparent, 1-DIP outline, OnSurfaceVariant glyph.
    Template x:key="DefaultOutlinedIconButton" [TargetType=IconButton] {
        Border x:name="PART_Border"
              [ Background          = #00000000,
                BorderBrush         = @Outline,
                BorderThickness     = (1),
                CornerRadius        = @ShapeFull,
                Width               = 40,
                Height              = 40,
                TextBlock.Foreground = @OnSurfaceVariant ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )                          { PART_StateLayer.Background  = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   )                          { PART_StateLayer.Background  = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse )        { PART_Border.Width           = 48;
                                                        PART_Border.Height          = 48; }
        when ( ThemeManager.PrefersContrast = More )  { PART_Border.BorderThickness = (2); }
    }

    // Standard — fully transparent at rest, OnSurfaceVariant glyph.
    // The low-emphasis default for toolbar-style icon buttons.
    Template x:key="DefaultStandardIconButton" [TargetType=IconButton] {
        Border x:name="PART_Border"
              [ Background          = #00000000,
                BorderThickness     = (0),
                CornerRadius        = @ShapeFull,
                Width               = 40,
                Height              = 40,
                TextBlock.Foreground = @OnSurfaceVariant ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )                    { PART_StateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   )                    { PART_StateLayer.Background = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse )  { PART_Border.Width  = 48;
                                                  PART_Border.Height = 48; }
    }

    // Default Style — picks the template by Variant via property
    // triggers. Filled is the baseline; the other three variants ride
    // their own triggers. Mirrors the Button Style structure in
    // basic.resources.mu (with Standard added for the chrome-less case).
    Style [TargetType=IconButton] {
        Template = @DefaultFilledIconButton;
        when ( Variant = Tonal    ) { Template = @DefaultTonalIconButton; }
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
    Template x:key="DefaultFilledIconButtonToggle" [TargetType=IconButtonToggle] {
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHighest,
                BorderThickness = (0),
                CornerRadius    = @ShapeFull,
                Width           = 40,
                Height          = 40 ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked   )                    { PART_Border.Background     = @Primary; }
        when ( IsMouseOver )                    { PART_StateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   )                    { PART_StateLayer.Background = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse )  { PART_Border.Width  = 48;
                                                  PART_Border.Height = 48; }
    }

    // Tonal Toggle — unchecked = SurfaceContainerHighest, checked = SecondaryContainer.
    Template x:key="DefaultTonalIconButtonToggle" [TargetType=IconButtonToggle] {
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHighest,
                BorderThickness = (0),
                CornerRadius    = @ShapeFull,
                Width           = 40,
                Height          = 40 ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked   )                    { PART_Border.Background     = @SecondaryContainer; }
        when ( IsMouseOver )                    { PART_StateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   )                    { PART_StateLayer.Background = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse )  { PART_Border.Width  = 48;
                                                  PART_Border.Height = 48; }
    }

    // Outlined Toggle — unchecked = transparent + outline,
    // checked = InverseSurface (no border).
    Template x:key="DefaultOutlinedIconButtonToggle" [TargetType=IconButtonToggle] {
        Border x:name="PART_Border"
              [ Background      = #00000000,
                BorderBrush     = @Outline,
                BorderThickness = (1),
                CornerRadius    = @ShapeFull,
                Width           = 40,
                Height          = 40 ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked   )                          { PART_Border.Background      = @InverseSurface;
                                                        PART_Border.BorderThickness = (0); }
        when ( IsMouseOver )                          { PART_StateLayer.Background  = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   )                          { PART_StateLayer.Background  = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse )        { PART_Border.Width           = 48;
                                                        PART_Border.Height          = 48; }
        when ( ThemeManager.PrefersContrast = More )  { PART_Border.BorderThickness = (2); }
    }

    // Standard Toggle — unchecked = transparent / OnSurfaceVariant,
    // checked = transparent / Primary. No container colour change; the
    // Style-level Foreground trigger is the only visible cue.
    Template x:key="DefaultStandardIconButtonToggle" [TargetType=IconButtonToggle] {
        Border x:name="PART_Border"
              [ Background      = #00000000,
                BorderThickness = (0),
                CornerRadius    = @ShapeFull,
                Width           = 40,
                Height          = 40 ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeFull,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )                    { PART_StateLayer.Background = @OnSurfaceVariantHoverLayer; }
        when ( IsPressed   )                    { PART_StateLayer.Background = @OnSurfaceVariantPressLayer; }
        when ( ThemeManager.Pointer = Coarse )  { PART_Border.Width  = 48;
                                                  PART_Border.Height = 48; }
    }

    // IconButtonToggle Style — picks Template by Variant and writes
    // TextBlock.Foreground on the templated parent for both states
    // (unchecked = OnSurfaceVariant per M3, checked = per-variant
    // "selected" ink). Multi-condition `Variant=X and IsChecked` triggers
    // give us 4 distinct checked-state foregrounds without needing the
    // 3-segment template-trigger LHS the compiler rejects.
    Style [TargetType=IconButtonToggle] {
        Template             = @DefaultFilledIconButtonToggle;
        TextBlock.Foreground = @OnSurfaceVariant;
        TextBlock.FontWeight = @TypefaceWeightMedium;
        when ( Variant = Tonal    ) { Template = @DefaultTonalIconButtonToggle; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedIconButtonToggle; }
        when ( Variant = Standard ) { Template = @DefaultStandardIconButtonToggle; }
        when ( IsChecked and Variant = Filled   ) { TextBlock.Foreground = @OnPrimary; }
        when ( IsChecked and Variant = Tonal    ) { TextBlock.Foreground = @OnSecondaryContainer; }
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
    // flips Background to @OnPrimaryContainerHoverLayer /
    // @OnPrimaryContainerPressLayer on hover / press. Elevation is bumped
    // on hover via PART_Border.Effect in the same trigger body.

    // Default FAB — 56dp icon-only.
    Template x:key="DefaultFab" [TargetType=FloatingActionButton] {
        Border x:name="PART_Border"
              [ Background          = @PrimaryContainer,
                BorderThickness     = (0),
                CornerRadius        = @ShapeLarge,
                Width               = 56,
                Height              = 56,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeLarge,
                    Padding      = (16,16,16,16) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @OnPrimaryContainerHoverLayer;
                                PART_Border.Effect          = @ElevationLevel4; }
        when ( IsPressed   )  { PART_StateLayer.Background = @OnPrimaryContainerPressLayer; }
    }

    // FAB Small — 40dp icon-only, @ShapeMedium corners.
    Template x:key="DefaultFabSmall" [TargetType=FloatingActionButton] {
        Border x:name="PART_Border"
              [ Background          = @PrimaryContainer,
                BorderThickness     = (0),
                CornerRadius        = @ShapeMedium,
                Width               = 40,
                Height              = 40,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeMedium,
                    Padding      = (8,8,8,8) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @OnPrimaryContainerHoverLayer;
                                PART_Border.Effect          = @ElevationLevel4; }
        when ( IsPressed   )  { PART_StateLayer.Background = @OnPrimaryContainerPressLayer; }
    }

    // FAB Large — 96dp icon-only, @ShapeExtraLarge corners.
    Template x:key="DefaultFabLarge" [TargetType=FloatingActionButton] {
        Border x:name="PART_Border"
              [ Background          = @PrimaryContainer,
                BorderThickness     = (0),
                CornerRadius        = @ShapeExtraLarge,
                Width               = 96,
                Height              = 96,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeExtraLarge,
                    Padding      = (30,30,30,30) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @OnPrimaryContainerHoverLayer;
                                PART_Border.Effect          = @ElevationLevel4; }
        when ( IsPressed   )  { PART_StateLayer.Background = @OnPrimaryContainerPressLayer; }
    }

    // Extended FAB — 56dp tall, content-driven width, @ShapeLarge corners.
    // The content slot expects icon-then-label (typically a horizontal
    // StackPanel). Padding is asymmetric per M3: 16dp leading (icon side)
    // and 20dp trailing (label side); we apply 16dp uniform here and let
    // the consumer's StackPanel space the gap between icon and label.
    // No explicit Width — Border auto-sizes to the content's measured width.
    Template x:key="DefaultFabExtended" [TargetType=FloatingActionButton] {
        Border x:name="PART_Border"
              [ Background          = @PrimaryContainer,
                BorderThickness     = (0),
                CornerRadius        = @ShapeLarge,
                Height              = 56,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer,
                TextBlock.FontFamily = @LabelLargeFont,
                TextBlock.FontWeight = @LabelLargeWeight,
                TextBlock.FontSize   = @LabelLargeSize ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeLarge,
                    Padding      = (16,0,20,0) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @OnPrimaryContainerHoverLayer;
                                PART_Border.Effect          = @ElevationLevel4; }
        when ( IsPressed   )  { PART_StateLayer.Background = @OnPrimaryContainerPressLayer; }
    }

    // Default Style — picks Template by Size. Default (56dp) is the
    // baseline; Small / Large / Extended each ride their own trigger.
    Style [TargetType=FloatingActionButton] {
        Template = @DefaultFab;
        when ( Size = Small    ) { Template = @DefaultFabSmall; }
        when ( Size = Large    ) { Template = @DefaultFabLarge; }
        when ( Size = Extended ) { Template = @DefaultFabExtended; }
    }

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
    Template x:key="DefaultFilledCard" [TargetType=Card] {
        Border x:name="PART_Border"
              [ Background     = @SurfaceContainerHighest,
                BorderThickness = (0),
                CornerRadius   = @ShapeMedium ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeMedium,
                    Padding      = (16,16,16,16) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @StateHoverOverlay;
                                PART_Border.Effect          = @ElevationLevel1; }
        when ( IsPressed   )  { PART_StateLayer.Background = @StatePressOverlay; }
    }

    // Elevated — @SurfaceContainerLow, no border, resting Level1.
    Template x:key="DefaultElevatedCard" [TargetType=Card] {
        Border x:name="PART_Border"
              [ Background     = @SurfaceContainerLow,
                BorderThickness = (0),
                CornerRadius   = @ShapeMedium,
                Effect         = @ElevationLevel1 ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeMedium,
                    Padding      = (16,16,16,16) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @StateHoverOverlay;
                                PART_Border.Effect          = @ElevationLevel2; }
        when ( IsPressed   )  { PART_StateLayer.Background = @StatePressOverlay;
                                PART_Border.Effect          = @ElevationLevel1; }
    }

    // Outlined — @Surface, 1-DIP @Outline border, no resting Effect.
    Template x:key="DefaultOutlinedCard" [TargetType=Card] {
        Border x:name="PART_Border"
              [ Background     = @Surface,
                BorderBrush    = @Outline,
                BorderThickness = (1),
                CornerRadius   = @ShapeMedium ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeMedium,
                    Padding      = (15,15,15,15) ] {
                ContentPresenter
            }
        }
        when ( IsMouseOver )                          { PART_StateLayer.Background  = @StateHoverOverlay;
                                                        PART_Border.Effect           = @ElevationLevel1; }
        when ( IsPressed   )                          { PART_StateLayer.Background  = @StatePressOverlay; }
        when ( ThemeManager.PrefersContrast = More )  { PART_Border.BorderThickness = (2); }
    }

    // Default Style — picks Template by Variant. Filled is the baseline
    // (the Setter); Elevated / Outlined each ride their own trigger.
    Style [TargetType=Card] {
        Template = @DefaultFilledCard;
        when ( Variant = Elevated ) { Template = @DefaultElevatedCard; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedCard; }
    }

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

    // ── Switch: M3 binary toggle (track + sliding thumb) ───────────
    // 52 × 32 dp pill track with a thumb that slides between the left
    // and right edges as IsChecked flips. The Margin-based positioning
    // hooks into Visual's implicit-transition engine — Thickness is one
    // of the types the engine interpolates — so the off/on flip
    // animates smoothly without a Storyboard.
    //
    // M3 spec colours:
    //   * off — track @SurfaceContainerHighest, thumb @Outline (16dp).
    //   * on  — track @Primary, thumb @OnPrimary (24dp). Thumb growth
    //           reads as the M3 "selected handle" affordance.
    //
    // State-layer triggers tint the thumb on hover / focus / press,
    // mirroring the Button family ladder. The press-state thumb size
    // bumps to 28dp (M3 "pressed" handle) but that requires the same
    // Margin trick as IsChecked — folded into the IsPressed trigger
    // below.
    Template x:key="DefaultSwitch" [TargetType=Switch] {
        Border x:name="PART_Track"
              [ Background      = @SurfaceContainerHighest,
                BorderBrush     = @Outline,
                BorderThickness = (2),
                CornerRadius    = @ShapeFull ] {
            // Thumb is a circle (ShapeFull) inside an absolutely-sized
            // 32dp track. Margin (Left, Top, Right, Bottom) anchors it
            // to the left edge with a 4dp inset top/bottom — the
            // resulting render size is 16×24 dp (24dp inner track
            // height, 16dp Width fixed below). The IsChecked trigger
            // shifts to right-anchored + 24dp width.
            Border x:name="PART_Thumb"
                  [ Background          = @Outline,
                    CornerRadius        = @ShapeFull,
                    BorderThickness     = (0),
                    Width               = 16,
                    Height              = 16,
                    VerticalAlignment   = Center,
                    HorizontalAlignment = Left,
                    Margin              = (8, 0, 0, 0) ]
        }
        // IsChecked — track + thumb both flip palette; the thumb grows
        // and re-anchors to the right edge.
        when ( IsChecked ) { PART_Track.Background    = @Primary;
                             PART_Track.BorderBrush   = @Primary;
                             PART_Thumb.Background    = @OnPrimary;
                             PART_Thumb.Width         = 24;
                             PART_Thumb.Height        = 24;
                             PART_Thumb.Margin        = (24, 0, 0, 0); }
        // State-layer ladder. Hover / focus / press tint the thumb at
        // the Primary state-layer opacities so the affordance reads
        // even when the track is unchecked.
        when ( IsMouseOver )       { PART_Thumb.Background = @OnSurface; }
        when ( IsFocused )         { PART_Thumb.Background = @OnSurface; }
        when ( IsPressed )         { PART_Thumb.Width      = 28;
                                     PART_Thumb.Height     = 28; }
        when ( IsEnabled = false ) { PART_Track.Opacity    = @DisabledContentOpacity; }
    }
    Style [TargetType=Switch] {
        Template = @DefaultSwitch;
    }

    // ── Checkbox: M3 18 × 18 dp square toggle ──────────────────────
    // Unchecked — empty box with @OnSurfaceVariant 2dp border. Checked
    // — solid @Primary fill with an @OnPrimary checkmark glyph. The
    // glyph is always present in the visual tree but its Opacity flips
    // from 0 → 1 on the IsChecked trigger so the implicit-transition
    // engine on Visual fades it in / out without a Storyboard (Opacity
    // is a number — one of the types the engine knows how to
    // interpolate).
    //
    // No tri-state (indeterminate) chrome — see Checkbox.ts for the
    // why-deferred rationale.
    Template x:key="DefaultCheckbox" [TargetType=Checkbox] {
        Border x:name="PART_Box"
              [ Background      = #00000000,
                BorderBrush     = @OnSurfaceVariant,
                BorderThickness = (2),
                CornerRadius    = @ShapeExtraSmall ] {
            TextBlock x:name="PART_Mark"
                     [ Text                = "✓",
                       FontFamily          = @LabelSmallFont,
                       FontWeight          = @TypefaceWeightBold,
                       FontSize             = 14,
                       Foreground           = @OnPrimary,
                       HorizontalAlignment  = Center,
                       VerticalAlignment    = Center,
                       Opacity              = 0 ]
        }
        // IsChecked — fill the box and reveal the glyph.
        when ( IsChecked )         { PART_Box.Background     = @Primary;
                                     PART_Box.BorderBrush    = @Primary;
                                     PART_Mark.Opacity       = 1; }
        // State-layer ladder. Hover / focus / press tint the box's
        // border (unchecked path) or pump the fill toward a press
        // tint (checked path). Disabled dims the whole control.
        when ( IsMouseOver )       { PART_Box.BorderBrush    = @OnSurface; }
        when ( IsFocused )         { PART_Box.BorderBrush    = @Primary; }
        when ( IsPressed )         { PART_Box.BorderBrush    = @Primary; }
        when ( IsEnabled = false ) { PART_Box.Opacity        = @DisabledContentOpacity; }
    }
    Style [TargetType=Checkbox] {
        Template = @DefaultCheckbox;
    }

    // ── RadioButton: M3 20 × 20 dp circular toggle ─────────────────
    // Outer ring + inner dot. The dot is always present (a 10dp filled
    // circle inset by 5dp) but its Opacity flips from 0 → 1 on
    // IsChecked, so the implicit-transition engine fades it in / out
    // without a Storyboard. The outer ring re-tints to @Primary when
    // checked, matching the M3 affordance.
    //
    // Mutual exclusivity rides on the RadioButton class's
    // OnPropertyChanged hook — set `GroupName=foo` on multiple radios
    // and any sibling sharing that name in the same visual tree
    // automatically clears when this one is checked. See radio-
    // button.ts for the walker.
    Template x:key="DefaultRadioButton" [TargetType=RadioButton] {
        Border x:name="PART_Ring"
              [ Background      = #00000000,
                BorderBrush     = @OnSurfaceVariant,
                BorderThickness = (2),
                CornerRadius    = @ShapeFull ] {
            Border x:name="PART_Dot"
                  [ Background          = @Primary,
                    CornerRadius        = @ShapeFull,
                    BorderThickness     = (0),
                    Width               = 10,
                    Height              = 10,
                    HorizontalAlignment = Center,
                    VerticalAlignment   = Center,
                    Opacity             = 0 ]
        }
        when ( IsChecked )         { PART_Ring.BorderBrush = @Primary;
                                     PART_Dot.Opacity      = 1; }
        when ( IsMouseOver )       { PART_Ring.BorderBrush = @OnSurface; }
        when ( IsFocused )         { PART_Ring.BorderBrush = @Primary; }
        when ( IsPressed )         { PART_Ring.BorderBrush = @Primary; }
        when ( IsEnabled = false ) { PART_Ring.Opacity     = @DisabledContentOpacity; }
    }
    Style [TargetType=RadioButton] {
        Template = @DefaultRadioButton;
    }

    // ── Chip: M3 compact attribute / filter / input / suggestion ───
    // 32dp tall pill chrome with leading + trailing slots and a
    // ContentPresenter for the label. Kind-aware triggers tint the
    // chrome per variant:
    //   * Assist     — outlined surface, neutral OnSurface label.
    //   * Filter     — outlined surface at rest; flips to filled
    //                  @SecondaryContainer when IsChecked (the
    //                  selectable filter affordance).
    //   * Input      — outlined surface; trailing slot conventionally
    //                  carries a remove icon (consumer-supplied).
    //   * Suggestion — outlined surface; same chrome as Assist, the
    //                  semantic difference is consumer-side.
    //
    // The Kind variants all share base chrome — the variant-specific
    // triggers below override only the bits that differ. Filter is the
    // only variant that observes IsChecked at the template level; the
    // other variants ignore it entirely (the consumer can still toggle
    // IsChecked programmatically through ToggleButton, no chrome
    // change).
    Template x:key="DefaultChip" [TargetType=Chip] {
        Border x:name="PART_Chip"
              [ Background      = @Surface,
                BorderBrush     = @OutlineVariant,
                BorderThickness = (1),
                CornerRadius    = @ShapeSmall,
                Padding         = (@Spacing3, @Spacing1, @Spacing3, @Spacing1),
                Height          = 32 ] {
            DockPanel [LastChildFill=true] {
                Border x:name="PART_LeadingSlot"
                      [ DockPanel.Dock     = Left,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0),
                        Margin              = (0, 0, @Spacing1, 0) ]
                Border x:name="PART_TrailingSlot"
                      [ DockPanel.Dock     = Right,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0),
                        Margin              = (@Spacing1, 0, 0, 0) ]
                ContentPresenter [ VerticalAlignment = Center ]
            }
        }
        // Filter — selected fills with @SecondaryContainer; the
        // outline reads as the M3 "input" indicator. The derived
        // IsFilterSelected DP combines Kind=Filter and IsChecked
        // because ControlTemplate triggers don't compose multi-term
        // conjuncts; the class recomputes it on every Kind / IsChecked
        // edge.
        when ( IsFilterSelected ) {
            PART_Chip.Background     = @SecondaryContainer;
            PART_Chip.BorderBrush    = @SecondaryContainer;
        }

        // State-layer ladder — translucent OnSurface overlays over
        // whatever variant background is currently active. Ordered
        // BEFORE the Filter-selected trigger so a hovered selected
        // filter chip stays in its @SecondaryContainer tint (the
        // state-layer overlay would otherwise wash it back to neutral).
        when ( IsMouseOver )       { PART_Chip.Background = @StateHoverOverlay; }
        when ( IsFocused )         { PART_Chip.Background = @StateFocusOverlay; }
        when ( IsPressed )         { PART_Chip.Background = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Chip.Opacity    = @DisabledContentOpacity; }
    }
    Style [TargetType=Chip] {
        Template = @DefaultChip;
        Foreground = @OnSurface;
        FontFamily = @LabelLargeFont;
        FontWeight = @LabelLargeWeight;
        FontSize   = @LabelLargeSize;
    }

    // ── SegmentedButton: M3 connected-segment selection row ──────────
    // Items panel is a horizontal StackPanel; per-segment chrome lives
    // on DefaultSegmentedItem. SegmentedButton itself is a thin shell
    // — the outline + corner-rounding story is owned by the per-item
    // template since each segment's corners depend on Position
    // (Single / Start / Middle / End), which SegmentedButton stamps
    // onto each container after items change.
    Template x:key="DefaultSegmentedButton" [TargetType=SegmentedButton] {
        ItemsPresenter
    }
    ItemsPanelTemplate x:key="DefaultSegmentedButtonPanel" {
        StackPanel [Orientation=Horizontal]
    }
    Style [TargetType=SegmentedButton] {
        Template   = @DefaultSegmentedButton;
        ItemsPanel = @DefaultSegmentedButtonPanel;
    }

    // ── SegmentedItem: per-segment chrome ────────────────────────────
    // Corner radius selection: Single rounds all four corners; Start
    // rounds left only; End rounds right only; Middle stays square.
    // BorderThickness sheds the right edge on Start / Middle so the
    // following segment's left edge becomes the visible divider —
    // the row reads as one continuous outline rather than a stack of
    // independent boxes.
    //
    // Selection chrome: filled with @SecondaryContainer; M3 spec uses
    // the same fill for both single- and multi-select segmented
    // variants. State-layer ladder (hover / focus / press) overlays
    // @SecondaryContainer on the selected case and @Surface otherwise.
    Template x:key="DefaultSegmentedItem" [TargetType=SegmentedItem] {
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @Outline,
                BorderThickness = (1, 1, 0, 1),
                CornerRadius    = (0),
                Padding         = (@Spacing3, @Spacing1, @Spacing3, @Spacing1),
                Height          = 40 ] {
            ContentPresenter [VerticalAlignment=Center, HorizontalAlignment=Center]
        }

        // ── Position triggers — corner / border shape ────────────────
        when ( Position = Single ) { PART_Border.CornerRadius    = @ShapeFull;
                                     PART_Border.BorderThickness = (1, 1, 1, 1); }
        when ( Position = Start )  { PART_Border.CornerRadius    = (@ShapeFull, 0, 0, @ShapeFull);
                                     PART_Border.BorderThickness = (1, 1, 0, 1); }
        when ( Position = Middle ) { PART_Border.CornerRadius    = (0);
                                     PART_Border.BorderThickness = (1, 1, 0, 1); }
        when ( Position = End )    { PART_Border.CornerRadius    = (0, @ShapeFull, @ShapeFull, 0);
                                     PART_Border.BorderThickness = (1, 1, 1, 1); }

        // ── Selection chrome ────────────────────────────────────────
        when ( IsSelected ) { PART_Border.Background = @SecondaryContainer; }

        // ── State layers (ordered after Position + Selected so the
        // pressed/hover tint overlays whichever resting fill applied) ──
        when ( IsMouseOver )       { PART_Border.Background = @StateHoverOverlay; }
        when ( IsFocused )         { PART_Border.Background = @StateFocusOverlay; }
        when ( IsPressed )         { PART_Border.Background = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Border.Opacity    = @DisabledContentOpacity; }
    }
    Style [TargetType=SegmentedItem] {
        Template   = @DefaultSegmentedItem;
        Foreground = @OnSurface;
        FontFamily = @LabelLargeFont;
        FontWeight = @LabelLargeWeight;
        FontSize   = @LabelLargeSize;
    }

    // ── TabControl: M3 horizontal tab strip + content area ────────
    // ItemsPresenter on top renders each TabItem's header surface;
    // ContentPresenter below shows the selected TabItem's Content.
    // Selection comes from the Selector base (TabControl extends
    // Selector); the content area binds to SelectedItem so any data-
    // driven swap reflects automatically.
    //
    // The active-indicator line — the 2dp @Primary underline that
    // tracks under the selected tab in M3 spec — is rendered per
    // TabItem (DefaultTabItem template below) rather than as a
    // separately-animated indicator. The simpler shape skips the
    // cross-tab animation but keeps the spec affordance.
    ItemsPanelTemplate x:key="DefaultTabControlPanel" {
        StackPanel [Orientation = Horizontal]
    }
    Template x:key="DefaultTabControl" [TargetType=TabControl] {
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @OutlineVariant,
                BorderThickness = (0,0,0,1) ] {
            DockPanel [LastChildFill=true] {
                ItemsPresenter x:name="PART_ItemsPresenter"
                              [ DockPanel.Dock = Top ]
                ContentPresenter x:name="PART_ContentSlot"
                                [ Content = $SelectedItem ]
            }
        }
    }
    Style [TargetType=TabControl] {
        Template   = @DefaultTabControl;
        ItemsPanel = @DefaultTabControlPanel;
    }

    // ── TabItem: M3 tab header ─────────────────────────────────────
    // 48dp tall header surface — Label centred, 2dp active-indicator
    // line at the bottom edge that's transparent until IsSelected.
    // State-layer overlays fire on hover / focus / press over the
    // resting @Surface background.
    Template x:key="DefaultTabItem" [TargetType=TabItem] {
        Border x:name="PART_Tab"
              [ Background      = #00000000,
                BorderBrush     = #00000000,
                BorderThickness = (0,0,0,2),
                Padding         = (@Spacing4, @Spacing2, @Spacing4, @Spacing2),
                Height          = 48 ] {
            TextBlock x:name="PART_Label"
                     [ Text                 = $Header,
                       Foreground           = @OnSurfaceVariant,
                       FontFamily           = @TitleSmallFont,
                       FontWeight           = @TitleSmallWeight,
                       FontSize             = @TitleSmallSize,
                       LineHeight           = @TitleSmallLineHeight,
                       LetterSpacing        = @TitleSmallTracking,
                       HorizontalAlignment  = Center,
                       VerticalAlignment    = Center ]
        }
        when ( IsSelected )        { PART_Tab.BorderBrush = @Primary;
                                     PART_Label.Foreground = @Primary; }
        when ( IsMouseOver )       { PART_Tab.Background = @StateHoverOverlay; }
        when ( IsFocused )         { PART_Tab.Background = @StateFocusOverlay; }
        when ( IsPressed )         { PART_Tab.Background = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Tab.Opacity    = @DisabledContentOpacity; }
    }
    Style [TargetType=TabItem] {
        Template = @DefaultTabItem;
    }

    // ── SearchBar: M3 search-field wrapper around TextBox ──────────
    // Same DockPanel anatomy as ListBoxItem (leading | content | trailing)
    // but the centre column hosts the inherited TextBox's ScrollViewer +
    // TextEditorSurface instead of a ContentPresenter. The leading +
    // trailing slots are class-managed Borders (see search-bar.ts) so
    // findFirstContentPresenter doesn't need to walk past them — TextBox
    // doesn't use the ContentPresenter slot, so there's no contest.
    //
    // ShapeFull gives the M3 stadium-shape SearchBar look; the resting
    // background is @SurfaceContainerHigh so the field reads as
    // elevated against neutral surrounding chrome.
    Template x:key="DefaultSearchBar" [TargetType=SearchBar]{
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHigh,
                BorderBrush     = #00000000,
                BorderThickness = (0),
                CornerRadius    = @ShapeFull,
                Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2),
                Height          = 56 ] {
            DockPanel [LastChildFill=true] {
                Border x:name="PART_LeadingSlot"
                      [ DockPanel.Dock     = Left,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0),
                        Margin              = (0, 0, @Spacing2, 0) ]
                Border x:name="PART_TrailingSlot"
                      [ DockPanel.Dock     = Right,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0),
                        Margin              = (@Spacing2, 0, 0, 0) ]
                ScrollViewer x:name="PART_Scroll"{
                    TextEditorSurface x:name="PART_Editor"
                }
            }
        }
        when ( IsMouseOver )       { PART_Border.Background = @SurfaceContainerHighest; }
        when ( IsFocused )         { PART_Border.Background = @SurfaceContainerHighest; }
        when ( IsEnabled = false ) { PART_Border.Opacity    = @DisabledContentOpacity; }
    }
    // ── Divider: M3 1dp rule, horizontal or vertical ───────────────
    // Two templates — one per Orientation — because mural's CornerRadius
    // / BorderThickness DPs are uniform across the control instance, so
    // a single template with a trigger that just flips Orientation
    // would still produce a 1dp box around the rule rather than a 1dp
    // line. The Style picks the matching template based on Orientation.
    Template x:key="DefaultHorizontalDivider" [TargetType=Divider] {
        Border x:name="PART_Rule"
              [ Background          = @OutlineVariant,
                Height              = 1,
                HorizontalAlignment = Stretch,
                BorderThickness     = (0) ]
    }
    Template x:key="DefaultVerticalDivider" [TargetType=Divider] {
        Border x:name="PART_Rule"
              [ Background        = @OutlineVariant,
                Width             = 1,
                VerticalAlignment = Stretch,
                BorderThickness   = (0) ]
    }
    Style [TargetType=Divider] {
        Template = @DefaultHorizontalDivider;
        when ( Orientation = Vertical ) { Template = @DefaultVerticalDivider; }
    }

    // ── Badge: M3 dot / numeric flag ───────────────────────────────
    // Two templates — one per Variant. Variant=Dot ships a 6×6dp
    // filled circle; Variant=Numeric ships a pill carrying the Count
    // bound via a $-binding. Both use @Error / @OnError per the M3
    // spec; consumers wanting a non-error tint re-template.
    Template x:key="DefaultDotBadge" [TargetType=Badge] {
        Border x:name="PART_Dot"
              [ Background      = @Error,
                CornerRadius    = @ShapeFull,
                BorderThickness = (0),
                Width           = 6,
                Height          = 6 ]
    }
    Template x:key="DefaultNumericBadge" [TargetType=Badge] {
        Border x:name="PART_Pill"
              [ Background      = @Error,
                CornerRadius    = @ShapeFull,
                BorderThickness = (0),
                Padding         = (@Spacing1, @Spacing0, @Spacing1, @Spacing0),
                MinWidth        = 16,
                Height          = 16 ] {
            TextBlock [ Text                 = $Count,
                        Foreground           = @OnError,
                        FontFamily           = @LabelSmallFont,
                        FontWeight           = @LabelSmallWeight,
                        FontSize              = @LabelSmallSize,
                        LineHeight            = @LabelSmallLineHeight,
                        LetterSpacing         = @LabelSmallTracking,
                        HorizontalAlignment   = Center,
                        VerticalAlignment     = Center ]
        }
    }
    Style [TargetType=Badge] {
        Template = @DefaultNumericBadge;
        when ( Variant = Dot ) { Template = @DefaultDotBadge; }
    }

    // ── Tooltip: M3 Plain tooltip ──────────────────────────────────
    // Single-line opaque tooltip — @InverseSurface fill (M3's spec
    // calls for a dark surface that inverts against the host theme
    // so the tooltip stays legible regardless of background) with
    // @InverseOnSurface ink for the label. ExtraSmall corner radius
    // matches the spec.
    Template x:key="DefaultTooltip" [TargetType=Tooltip] {
        Border x:name="PART_Tooltip"
              [ Background      = @InverseSurface,
                BorderBrush     = #00000000,
                BorderThickness = (0),
                CornerRadius    = @ShapeExtraSmall,
                Padding         = (@Spacing2, @Spacing1, @Spacing2, @Spacing1) ] {
            TextBlock [ Text                 = $Text,
                        Foreground           = @InverseOnSurface,
                        FontFamily           = @BodySmallFont,
                        FontWeight           = @BodySmallWeight,
                        FontSize              = @BodySmallSize,
                        LineHeight            = @BodySmallLineHeight,
                        LetterSpacing         = @BodySmallTracking ]
        }
    }
    Style [TargetType=Tooltip] {
        Template = @DefaultTooltip;
    }

    // ── ProgressIndicator: M3 Linear progress ──────────────────────
    // Determinate Linear progress — 4dp track + fill ride above one
    // another with a CornerRadius=2 ramp (matches Slider track and M3
    // spec). The fill's width is consumer-driven; the simple
    // determinate path uses a Width binding to Value (0..1 expressed
    // as a 0..100% pill width via Margin or an outer scaling layer).
    // Mural's binding DSL doesn't yet emit unit-conversion converters
    // declaratively, so this v0 template ships a fixed-width fill that
    // the consumer scales via a class-level handler; the binding
    // pipeline lands when the converter syntax does.
    Template x:key="DefaultLinearProgressIndicator" [TargetType=ProgressIndicator] {
        Border x:name="PART_Track"
              [ Background      = @SurfaceContainerHighest,
                CornerRadius    = 2,
                BorderThickness = (0),
                Height          = 4 ] {
            Border x:name="PART_Fill"
                  [ Background          = @Primary,
                    CornerRadius        = 2,
                    BorderThickness     = (0),
                    HorizontalAlignment = Left,
                    Height              = 4 ]
        }
        when ( IsEnabled = false ) { PART_Track.Opacity = @DisabledContentOpacity; }
    }
    // Circular variant — 40dp ring (M3 spec) with the active progress
    // sweep traced by PART_Fill (Arc). PART_Track is a full-circle Arc
    // at @SurfaceContainerHighest behind PART_Fill at @Primary; the
    // Fill's EndAngle is bound to the consumer's Value via a class-
    // level handler in ProgressIndicator (Value 0..1 → EndAngle
    // StartAngle..StartAngle+360). The simple v0 template ships a
    // 360° fill so the consumer either sets EndAngle directly or
    // wires up a Value→EndAngle binding-converter in their app code.
    Template x:key="DefaultCircularProgressIndicator" [TargetType=ProgressIndicator] {
        Border x:name="PART_OuterFrame"
              [ Background      = #00000000,
                BorderThickness = (0),
                Width           = 40,
                Height          = 40 ] {
            // Two overlapping Arc Visuals — track underneath, fill on
            // top. Both start at -90° (top of the circle) so any
            // sweep reads "filling clockwise from 12 o'clock", the
            // M3 affordance.
            Arc x:name="PART_Track"
                [ StartAngle      = -90,
                  EndAngle        = 270,
                  Stroke          = @SurfaceContainerHighest,
                  StrokeThickness = 4,
                  Width           = 40,
                  Height          = 40 ]
            Arc x:name="PART_Fill"
                [ StartAngle      = -90,
                  EndAngle        = 270,
                  Stroke          = @Primary,
                  StrokeThickness = 4,
                  Width           = 40,
                  Height          = 40 ]
        }
        when ( IsEnabled = false ) { PART_OuterFrame.Opacity = @DisabledContentOpacity; }
    }
    Style [TargetType=ProgressIndicator] {
        Template = @DefaultLinearProgressIndicator;
        when ( Variant = Circular ) { Template = @DefaultCircularProgressIndicator; }
    }

    // ── Banner: M3 in-flow alert / message strip ───────────────────
    // Leading icon | headline+supporting | trailing actions —
    // same DockPanel shape as ListBoxItem's anatomy. Banner doesn't
    // ship Leading / Actions class-level slot wiring (the consumer
    // sets DP values; the template's PART_LeadingSlot is a
    // ContentPresenter binding directly via $Leading). M3 spec uses
    // @Surface as the resting fill with no border by default; the
    // trailing actions row anchors right.
    Template x:key="DefaultBanner" [TargetType=Banner] {
        Border x:name="PART_Banner"
              [ Background      = @Surface,
                BorderBrush     = @OutlineVariant,
                BorderThickness = (0, 0, 0, 1),
                Padding         = (@Spacing4, @Spacing3, @Spacing4, @Spacing3) ] {
            DockPanel [LastChildFill=true] {
                ContentPresenter [ DockPanel.Dock     = Left,
                                   Content             = $Leading,
                                   VerticalAlignment   = Center,
                                   Margin              = (0, 0, @Spacing3, 0) ]
                ContentPresenter [ DockPanel.Dock     = Right,
                                   Content             = $Actions,
                                   VerticalAlignment   = Center,
                                   Margin              = (@Spacing3, 0, 0, 0) ]
                ContentPresenter [ VerticalAlignment = Center ]
            }
        }
    }
    Style [TargetType=Banner] {
        Template      = @DefaultBanner;
        Foreground    = @OnSurface;
        FontFamily    = @BodyMediumFont;
        FontWeight    = @BodyMediumWeight;
        FontSize      = @BodyMediumSize;
        LineHeight    = @BodyMediumLineHeight;
        LetterSpacing = @BodyMediumTracking;
    }

    // ── Snackbar: M3 transient message ─────────────────────────────
    // @InverseSurface fill, @InverseOnSurface ink (M3 inverts the
    // snackbar against host theme so it stays legible regardless of
    // backdrop). ExtraSmall corner radius matches the spec.
    Template x:key="DefaultSnackbar" [TargetType=Snackbar] {
        Border x:name="PART_Snackbar"
              [ Background      = @InverseSurface,
                BorderBrush     = #00000000,
                BorderThickness = (0),
                CornerRadius    = @ShapeExtraSmall,
                Effect          = @Elevation3,
                Padding         = (@Spacing4, @Spacing3, @Spacing2, @Spacing3) ] {
            DockPanel [LastChildFill=true] {
                ContentPresenter [ DockPanel.Dock     = Right,
                                   Content             = $Actions,
                                   VerticalAlignment   = Center,
                                   Margin              = (@Spacing4, 0, 0, 0) ]
                ContentPresenter [ VerticalAlignment = Center ]
            }
        }
    }
    Style [TargetType=Snackbar] {
        Template      = @DefaultSnackbar;
        Foreground    = @InverseOnSurface;
        FontFamily    = @BodyMediumFont;
        FontWeight    = @BodyMediumWeight;
        FontSize      = @BodyMediumSize;
        LineHeight    = @BodyMediumLineHeight;
        LetterSpacing = @BodyMediumTracking;
    }

    // ── Dialog: M3 modal dialog ────────────────────────────────────
    // ExtraLarge corner radius (M3 spec) + Elevation3 + @Surface
    // resting background. Title + Content + Actions stack vertically.
    // The modal scrim is OUTSIDE the dialog template — Dialog mounts
    // onto the PresentationTarget's OverlayLayer and that surface
    // owns the scrim. The dialog template just paints the floating
    // surface itself.
    Template x:key="DefaultDialog" [TargetType=Dialog] {
        Border x:name="PART_Dialog"
              [ Background      = @Surface,
                BorderBrush     = #00000000,
                BorderThickness = (0),
                CornerRadius    = @ShapeExtraLarge,
                Effect          = @Elevation3,
                Padding         = (@Spacing6, @Spacing6, @Spacing6, @Spacing6) ] {
            DockPanel [LastChildFill=true] {
                TextBlock x:name="PART_Title"
                         [ DockPanel.Dock = Top,
                           Text                  = $Title,
                           Foreground            = @OnSurface,
                           FontFamily            = @HeadlineSmallFont,
                           FontWeight            = @HeadlineSmallWeight,
                           FontSize               = @HeadlineSmallSize,
                           LineHeight             = @HeadlineSmallLineHeight,
                           LetterSpacing          = @HeadlineSmallTracking,
                           Margin                 = (0, 0, 0, @Spacing4) ]
                ContentPresenter [ DockPanel.Dock = Bottom,
                                   Content         = $Actions,
                                   HorizontalAlignment = Right,
                                   Margin              = (0, @Spacing4, 0, 0) ]
                ContentPresenter
            }
        }
    }
    Style [TargetType=Dialog] {
        Template = @DefaultDialog;
    }

    // ── BottomSheet: M3 bottom-anchored sheet ──────────────────────
    // M3 spec: top corners rounded at ExtraLarge (28dp), bottom edges
    // square so the sheet sits flush against the screen edge. The
    // asymmetric corners ride the (TL, TR, BR, BL) CornerRadius tuple
    // — the compiler routes tuples in a CornerRadius= position to
    // `new CornerRadius(...)` rather than the default Thickness shape.
    Template x:key="DefaultBottomSheet" [TargetType=BottomSheet] {
        Border x:name="PART_Sheet"
              [ Background      = @Surface,
                BorderBrush     = #00000000,
                BorderThickness = (0),
                CornerRadius    = (@ShapeExtraLarge, @ShapeExtraLarge, 0, 0),
                Effect          = @Elevation1,
                Padding         = (@Spacing4, @Spacing4, @Spacing4, @Spacing4) ] {
            ContentPresenter
        }
    }
    Style [TargetType=BottomSheet] {
        Template = @DefaultBottomSheet;
    }

    Style [TargetType=SearchBar] {
        Template       = @DefaultSearchBar;
        Foreground     = @OnSurface;
        SelectionBrush = @SecondaryContainer;
        CaretBrush     = @OnSurface;
        FontFamily     = @BodyLargeFont;
        FontWeight     = @BodyLargeWeight;
        FontSize       = @BodyLargeSize;
        LineHeight     = @BodyLargeLineHeight;
        LetterSpacing  = @BodyLargeTracking;
    }

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
            TextBlock [Text = "Aa", Foreground = @OnPrimary, FontSize = 14,
                       VerticalAlignment = Center, Margin = (4,0,4,0)]
            Border x:name="PART_ThemeComboWrap"
                  [Width = 0, MinWidth = 0, Opacity = 0, Padding = (4,0,4,0)] {
                ComboBox x:name="PART_ThemeCombo" [Width = 140, ThemeManager.Density = Compact]
            }

            TextBlock [Text = "◐", Foreground = @OnPrimary, FontSize = 14,
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
}
