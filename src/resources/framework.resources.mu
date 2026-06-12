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
    Template x:key="DefaultMenuButtonTrigger" [TargetType=MenuButton]{
        Button x:name="PART_Trigger"{
            StackPanel x:name="PART_TriggerStack" [Orientation = Horizontal]{
                TextBlock x:name="PART_HeaderText" [Foreground = @OnPrimary]
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
        Border x:name="PART_Row" [Padding = (8,6,8,6)] {
            StackPanel [Orientation = Horizontal] {
                Border    x:name="PART_Icon"    [Width = 24, MinWidth = 24]
                TextBlock x:name="PART_Label"   [Margin = (8,0,16,0),
                                                 MinWidth = 80,
                                                 Foreground = @OnSurface]
                TextBlock x:name="PART_Gesture" [Margin = (0,0,16,0),
                                                 Foreground = @OnSurfaceVariant]
                TextBlock x:name="PART_Chevron" [Width = 12,
                                                 Foreground = @OnSurfaceVariant]
            }
        }
        // M3 state-layer tokens: semi-transparent OnSurface tints over
        // whatever surface the popup chrome paints. Using a solid token
        // like @SurfaceContainerHigh here would be invisible — the
        // ContextMenu / MenuButton popup chrome IS @SurfaceContainerHigh.
        when ( IsMouseOver )   { PART_Row.Background = @StateHoverOverlay; }
        when ( IsPressed )     { PART_Row.Background = @StatePressOverlay; }
        when ( IsChecked )     { PART_Row.Background = @SecondaryContainer; }
        when ( IsSubmenuOpen ) { PART_Row.Background = @SecondaryContainer; }
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
        Border x:name="PART_Row" [Padding = (12,6,12,6)] {
            StackPanel [Orientation = Horizontal] {
                Border    x:name="PART_Icon"    [Width = 0, MinWidth = 0]
                TextBlock x:name="PART_Label"   [MinWidth = 0,
                                                 Foreground = @OnSurface]
                TextBlock x:name="PART_Gesture" [Width = 0,
                                                 Foreground = @OnSurfaceVariant]
                TextBlock x:name="PART_Chevron" [Width = 0,
                                                 Foreground = @OnSurfaceVariant]
            }
        }
        // State-layer tokens — see DefaultMenuItemRow above for why.
        when ( IsMouseOver )   { PART_Row.Background = @StateHoverOverlay; }
        when ( IsPressed )     { PART_Row.Background = @StatePressOverlay; }
        when ( IsSubmenuOpen ) { PART_Row.Background = @SecondaryContainer; }
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
