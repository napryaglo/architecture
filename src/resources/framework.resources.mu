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
    import ButtonGroups  from "../framework/button-groups/button-groups.template.mu.js"
    import Markers       from "../framework/markers/markers.template.mu.js"
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

        // High-contrast popup chrome — M3 accessibility spec calls for
        // thicker outlines on every elevated surface when the user has
        // opted into a more-contrast environment. Matches the same
        // pattern Button uses at [basic.resources.mu:171].
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
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

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
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

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
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
    Template x:key="DefaultFab" [TargetType=FloatingActionButton] {
        Border x:name="PART_Border"
              [ Background          = @PrimaryContainer,
                BorderThickness     = (0),
                CornerRadius        = @ShapeLarge,
                MinWidth            = 56,
                MinHeight           = 56,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
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
                ContentPresenter [ Width  = 24, Height = 24,
                                   HorizontalAlignment = Center,
                                   VerticalAlignment   = Center ]
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
                MinWidth            = 40,
                MinHeight           = 40,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeMedium,
                    Padding      = (8,8,8,8) ] {
                // Icon slot pinned to M3's 24dp icon spec — see DefaultFab
                // for the rationale on why MS Outlined's line box needs
                // explicit clamping.
                ContentPresenter [ Width  = 24, Height = 24,
                                   HorizontalAlignment = Center,
                                   VerticalAlignment   = Center ]
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
                MinWidth            = 96,
                MinHeight           = 96,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeExtraLarge,
                    Padding      = (30,30,30,30) ] {
                // M3 Large FAB icon spec is 36dp (not the 24dp baseline of
                // Small / Default). Pinned with explicit Width/Height for
                // the same line-box-overflow reason as DefaultFab.
                ContentPresenter [ Width  = 36, Height = 36,
                                   HorizontalAlignment = Center,
                                   VerticalAlignment   = Center ]
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
                MinHeight           = 56,
                Effect              = @ElevationLevel3,
                TextBlock.Foreground = @OnPrimaryContainer,
                TextBlock.FontFamily = @LabelLargeFont,
                TextBlock.FontWeight = @LabelLargeWeight,
                TextBlock.FontSize   = @LabelLargeSize ] {
            Border x:name="PART_StateLayer"
                  [ Background   = #00000000,
                    CornerRadius = @ShapeLarge,
                    Padding      = (16,0,20,0) ] {
                ContentPresenter [ HorizontalAlignment = Center,
                                   VerticalAlignment   = Center ]
            }
        }
        when ( IsMouseOver )  { PART_StateLayer.Background = @OnPrimaryContainerHoverLayer;
                                PART_Border.Effect          = @ElevationLevel4; }
        when ( IsPressed   )  { PART_StateLayer.Background = @OnPrimaryContainerPressLayer; }
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
    Style [TargetType=FloatingActionButton] {
        Template            = @DefaultFab;
        HorizontalAlignment = Center;
        VerticalAlignment   = Center;
        when ( Size = Small    ) { Template = @DefaultFabSmall; }
        when ( Size = Large    ) { Template = @DefaultFabLarge; }
        when ( Size = Extended ) { Template = @DefaultFabExtended; }
    }

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

    // ── ColorPicker: closed chrome ─────────────────────────────────
    // A ComboBox-style trigger: rounded outlined border housing a small
    // swatch (Background bound to the templated parent's SwatchBrush),
    // the current hex label, and a chevron. ColorPicker.ctor wires the
    // PointerDown / PointerUp / PointerLeave gesture on
    // PART_SelectionTrigger; on release the picker flips IsDropDownOpen
    // and mountPopup spins up the overlay popup chrome below.
    Template x:key="DefaultColorPicker" [TargetType=ColorPicker]{
        ClickableBorder x:name="PART_SelectionTrigger"
                       [ Background      = @Surface,
                         BorderBrush     = @Outline,
                         BorderThickness = (1),
                         CornerRadius    = @ShapeExtraSmall,
                         Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2) ] {
            // HorizontalAlignment=Left makes the StackPanel shrink-wrap
            // to its children's measured width inside the Border. Stops
            // a stretched parent from arranging the StackPanel at a
            // width that disagrees with the Border's wrap rect (which
            // is what was pushing the chevron outside the stroke).
            StackPanel [Orientation=Horizontal, HorizontalAlignment=Left] {
                Border [ Width        = 22,
                         Height       = 18,
                         CornerRadius = 3,
                         BorderBrush  = @OutlineVariant,
                         BorderThickness = (1),
                         Margin       = (0, 0, @Spacing3, 0),
                         Background   = $$SwatchBrush ]
                TextBlock [ Text          = $$ColorHex,
                            Foreground    = @OnSurface,
                            FontFamily    = @BodyMediumFont,
                            FontWeight    = @BodyMediumWeight,
                            FontSize      = @BodyMediumSize,
                            VerticalAlignment = Center,
                            Margin        = (0, 0, @Spacing3, 0) ]
                TextBlock [ Text          = "▾",
                            Foreground    = @OnSurfaceVariant,
                            FontSize      = @LabelLargeSize,
                            VerticalAlignment = Center ]
            }
        }

        when ( PART_SelectionTrigger.IsMouseOver ) { PART_SelectionTrigger.Background = @StateHoverOverlay; }
        when ( PART_SelectionTrigger.IsPressed   ) { PART_SelectionTrigger.Background = @StatePressOverlay; }
        when ( IsDropDownOpen )                     { PART_SelectionTrigger.BorderBrush = @Primary; }
    }

    // ── ColorPicker: HSV dropdown popup ─────────────────────────────
    // Mounted on the PresentationTarget's OverlayLayer when
    // IsDropDownOpen flips true. The PART_PaletteContainer WrapPanel is
    // populated by ColorPicker.populatePalette with Material 3 swatches;
    // the three Sliders bind two-way to Hue / Saturation / Brightness
    // via templated-parent bindings, and the TextBox round-trips the hex
    // value through ColorHex. ColorPicker.OnPropertyChanged keeps the
    // four channels (Color / ColorHex / HSV trio) in lock-step.
    Template x:key="DefaultColorPickerPopup" [TargetType=ColorPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 280 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 8)] {
                        Border [ Width        = 36,
                                 Height       = 36,
                                 CornerRadius = 4,
                                 BorderBrush  = @OutlineVariant,
                                 BorderThickness = (1),
                                 Margin       = (0, 0, 8, 0),
                                 Background   = $$SwatchBrush ]
                        TextBox x:name="PART_HexInput"
                                [ Width         = 220,
                                  VerticalAlignment = Center ]
                    }

                    WrapPanel x:name="PART_PaletteContainer"
                              [ Orientation = Horizontal,
                                Margin      = (0, 0, 0, 8) ]

                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="H", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_HSlider" [ Width=240, Minimum=0, Maximum=360, SmallChange=1, LargeChange=15 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="S", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_SSlider" [ Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="V", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_VSlider" [ Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10 ]
                    }
                }
            }
        }

        when ( ThemeManager.PrefersContrast = More ) { PART_PopupBody.BorderThickness = (2); }
    }

    // ── ColorPicker: RGB+alpha popup variant ───────────────────────
    // Same chrome as the HSV popup but with the Office-classic 2D
    // hue/saturation gradient box + brightness rail in place of the
    // palette grid, and the channel rows carry R / G / B / A sliders.
    // The Style trigger below swaps PopupTemplate to this when
    // Variant = RGB.
    Template x:key="DefaultColorPickerPopupRGB" [TargetType=ColorPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 280 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 8)] {
                        Border [ Width        = 36,
                                 Height       = 36,
                                 CornerRadius = 4,
                                 BorderBrush  = @OutlineVariant,
                                 BorderThickness = (1),
                                 Margin       = (0, 0, 8, 0),
                                 Background   = $$SwatchBrush ]
                        TextBox x:name="PART_HexInput"
                                [ Width         = 220,
                                  VerticalAlignment = Center ]
                    }

                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 12)] {
                        Canvas x:name="PART_HsBox" [Width=220, Height=140] {
                            Border x:name="PART_HsBoxHue"     [Width=220, Height=140]
                            Border x:name="PART_HsBoxOverlay" [Width=220, Height=140]
                            Border x:name="PART_HsBoxCursor"
                                  [Width=12, Height=12, CornerRadius=6,
                                   BorderBrush=#ffffff, BorderThickness=(2)]
                        }
                        Canvas x:name="PART_VRail" [Width=20, Height=140, Margin=(12, 0, 0, 0)] {
                            Border x:name="PART_VRailFill"
                                  [Width=20, Height=140, BorderBrush=@OutlineVariant, BorderThickness=(1)]
                            Border x:name="PART_VRailCursor"
                                  [Width=26, Height=4, Background=#1f2937]
                        }
                    }

                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="R", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_RSlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="G", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_GSlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="B", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_BSlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="A", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_ASlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                }
            }
        }

        when ( ThemeManager.PrefersContrast = More ) { PART_PopupBody.BorderThickness = (2); }
    }

    Style [TargetType=ColorPicker] {
        Template      = @DefaultColorPicker;
        PopupTemplate = @DefaultColorPickerPopup;
        when ( Variant = RGB ) { PopupTemplate = @DefaultColorPickerPopupRGB; }
    }

    // ── BrushPicker: closed chrome ─────────────────────────────────
    // ComboBox-style trigger like ColorPicker, but the swatch shows
    // the current Brush (not just a colour), so it previews gradients
    // and patterns alongside solid fills. The label reads the variant
    // name — "Solid", "Linear", "Radial", "Pattern" — so the closed
    // chrome conveys which brush flavour is bound without making the
    // user open the popup. BrushPicker.ctor wires PointerDown / Up /
    // Leave on PART_SelectionTrigger.
    Template x:key="DefaultBrushPicker" [TargetType=BrushPicker]{
        ClickableBorder x:name="PART_SelectionTrigger"
                       [ Background      = @Surface,
                         BorderBrush     = @Outline,
                         BorderThickness = (1),
                         CornerRadius    = @ShapeExtraSmall,
                         Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2) ] {
            StackPanel [Orientation=Horizontal] {
                Border [ Width        = 36,
                         Height       = 18,
                         CornerRadius = 3,
                         BorderBrush  = @OutlineVariant,
                         BorderThickness = (1),
                         Margin       = (0, 0, @Spacing3, 0),
                         Background   = $$PreviewBrush ]
                TextBlock x:name="PART_VariantLabel"
                          [ Text          = "Solid",
                            Foreground    = @OnSurface,
                            FontFamily    = @BodyMediumFont,
                            FontWeight    = @BodyMediumWeight,
                            FontSize      = @BodyMediumSize,
                            VerticalAlignment = Center,
                            Margin        = (0, 0, @Spacing3, 0) ]
                TextBlock [ Text          = "▾",
                            Foreground    = @OnSurfaceVariant,
                            FontSize      = @LabelLargeSize,
                            VerticalAlignment = Center ]
            }
        }

        when ( PART_SelectionTrigger.IsMouseOver ) { PART_SelectionTrigger.Background = @StateHoverOverlay; }
        when ( PART_SelectionTrigger.IsPressed   ) { PART_SelectionTrigger.Background = @StatePressOverlay; }
        when ( IsDropDownOpen )                     { PART_SelectionTrigger.BorderBrush = @Primary; }
        when ( Variant = Linear  ) { PART_VariantLabel.Text = "Linear gradient"; }
        when ( Variant = Radial  ) { PART_VariantLabel.Text = "Radial gradient"; }
        when ( Variant = Pattern ) { PART_VariantLabel.Text = "Pattern";         }
    }

    // ── BrushPicker: shared popup chrome helper ────────────────────
    // Every variant popup shares the same outer shell (host / scrim /
    // body) and the same four-tab row at top — the only thing that
    // differs is the variant-specific sub-editor block in the middle.
    // Tabs use ClickableBorder + state triggers; BrushPicker.mountPopup
    // wires PointerUp on each to write Variant.

    // Solid variant popup — embeds a ColorPicker for the colour body.
    Template x:key="DefaultBrushPickerSolid" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    // ── Variant tabs ─────────────────────────────
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @SecondaryContainer,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                    }
                    // ── Solid body ───────────────────────────────
                    ColorPicker x:name="PART_SolidColor" [Variant=RGB]
                }
            }
        }
    }

    // Linear gradient variant popup. Two embedded ColorPickers + an
    // angle slider. Renders a 2-stop linear brush; BrushPicker maps
    // angle (degrees) onto StartPoint/EndPoint in [0,1] bbox coords.
    Template x:key="DefaultBrushPickerLinear" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @SecondaryContainer,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                    }
                    StackPanel [Orientation=Vertical, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="Start colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,0,0,2)]
                        ColorPicker x:name="PART_LinearStart"
                        TextBlock [Text="End colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,8,0,2)]
                        ColorPicker x:name="PART_LinearEnd"
                        StackPanel [Orientation=Horizontal, Margin=(0,10,0,0)] {
                            TextBlock [Text="Angle", Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_LinearAngle"
                                   [Width=240, Minimum=-180, Maximum=180, SmallChange=1, LargeChange=15]
                        }
                    }
                }
            }
        }
    }

    // Radial gradient variant popup. Two colour stops (inner/outer) +
    // CenterX/CenterY in [0..100] (mapped to 0..1 by BrushPicker) +
    // Radius in [0..100].
    Template x:key="DefaultBrushPickerRadial" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @SecondaryContainer, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                    }
                    StackPanel [Orientation=Vertical, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="Inner colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,0,0,2)]
                        ColorPicker x:name="PART_RadialInner"
                        TextBlock [Text="Outer colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,8,0,2)]
                        ColorPicker x:name="PART_RadialOuter"
                        StackPanel [Orientation=Horizontal, Margin=(0,10,0,0)] {
                            TextBlock [Text="Cx %",   Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_RadialCenterX" [Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Cy %",   Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_RadialCenterY" [Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Radius %", Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_RadialRadius"  [Width=240, Minimum=1, Maximum=100, SmallChange=1, LargeChange=10]
                        }
                    }
                }
            }
        }
    }

    // Pattern variant popup. ComboBox to choose PatternKind, two
    // ColorPickers (fg + bg) and three sliders (Size / Angle /
    // StrokeThickness). PART_PatternKind's Items + SelectedItem are
    // populated by BrushPicker.adoptPopupParts — string-enum values
    // map straight through onto PatternBrush.Kind.
    Template x:key="DefaultBrushPickerPattern" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @SecondaryContainer, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                    }
                    StackPanel [Orientation=Vertical, Margin=(0, 4, 0, 0)] {
                        StackPanel [Orientation=Horizontal, Margin=(0,0,0,8)] {
                            TextBlock [Text="Kind", Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            ComboBox x:name="PART_PatternKind" [Width=232]
                        }
                        TextBlock [Text="Foreground", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,0,0,2)]
                        ColorPicker x:name="PART_PatternForeground"
                        TextBlock [Text="Background", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,8,0,2)]
                        ColorPicker x:name="PART_PatternBackground"
                        StackPanel [Orientation=Horizontal, Margin=(0,10,0,0)] {
                            TextBlock [Text="Size",  Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_PatternSize"   [Width=232, Minimum=2, Maximum=64, SmallChange=1, LargeChange=4]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Angle", Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_PatternAngle"  [Width=232, Minimum=0,  Maximum=180, SmallChange=1, LargeChange=15]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Stroke", Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_PatternStroke" [Width=232, Minimum=0.5,Maximum=8,   SmallChange=0.5, LargeChange=1]
                        }
                    }
                }
            }
        }
    }

    Style [TargetType=BrushPicker] {
        Template      = @DefaultBrushPicker;
        PopupTemplate = @DefaultBrushPickerSolid;
        when ( Variant = Linear  ) { PopupTemplate = @DefaultBrushPickerLinear;  }
        when ( Variant = Radial  ) { PopupTemplate = @DefaultBrushPickerRadial;  }
        when ( Variant = Pattern ) { PopupTemplate = @DefaultBrushPickerPattern; }
    }

    // ── PenEditor: inline expanded panel ───────────────────────────
    // PowerPoint-style: one column of labelled rows. BrushPicker on
    // the Brush row uses TemplateBinding for Brush; sliders /
    // comboboxes for the simpler DPs. PenEditor.OnPropertyChanged
    // pushes each row's value onto its bound Pen so the consumer's
    // Stroke updates as the user drags.
    //
    // The MiterLimit row is the only visibility-gated row — the
    // theme has no `Visibility` enum yet, so we fake the toggle by
    // collapsing the row's MaxHeight (and clearing its padding) when
    // LineJoin ≠ Miter. The PART_MiterRow.Padding setter on the
    // default branch carries the resting layout; the trigger zeroes
    // it out when the editor's Join isn't Miter.
    Template x:key="DefaultPenEditor" [TargetType=PenEditor] {
        StackPanel [Orientation=Vertical] {
            // Section header — kept inside the editor so the
            // ShapeFormatControl template stays a flat pair of editors
            // and Fill/Line read with identical chrome.
            TextBlock [Style=@TitleSmall, Text="Line",
                       Foreground=@OnSurface, Margin=(0,0,0,@Spacing3)]
            // Two-column property grid — left column Auto-sized to the
            // widest label, right column takes the rest. Each editor row
            // is its own RowDefinition. The Miter limit row's label +
            // editor are separately named so PenEditor.ts can flip both
            // to Visibility=Collapsed when LineJoin ≠ Miter; with both
            // cells in the row Collapsed, the Auto-sized row height
            // contracts to 0 and the row visually disappears.
            //
            // MaxWidth caps the Star column when the host is unbounded
            // (e.g., inside a ScrollViewer that measures with Infinity).
            // Without it the Star track inflates to Infinity and child
            // rects emit NaN/Infinity into the SVG output.
            Grid [MaxWidth=300] {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                }
                RowDefinitions {
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                }
                // Brush
                TextBlock [Grid.Row=0, Grid.Column=0,
                           Style=@LabelSmall, Text="Brush",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                BrushPicker x:name="PART_BrushPicker"
                            [Grid.Row=0, Grid.Column=1,
                             Margin=(0,0,0,@Spacing3)]
                // Thickness — narrow numeric SpinEdit, kept compact
                // (MaxWidth=120) so the editor cell stays consistent
                // with the Fill section's transparency input.
                TextBlock [Grid.Row=1, Grid.Column=0,
                           Style=@LabelSmall, Text="Thickness",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                SpinEdit x:name="PART_Thickness"
                         [Grid.Row=1, Grid.Column=1,
                          HorizontalAlignment=Left, MaxWidth=120, Width=120,
                          Minimum=0, Maximum=24, SmallChange=0.5, LargeChange=2,
                          DecimalPlaces=1,
                          Margin=(0,0,0,@Spacing3)]
                // DashStyle — Items + SelectedItem populated by
                // PenEditor.adoptTemplateParts (see DASH_OPTIONS there).
                // DisplayMemberPath = "Label" so the dropdown shows the
                // human strings; the editor reads .Value back.
                TextBlock [Grid.Row=2, Grid.Column=0,
                           Style=@LabelSmall, Text="Dash",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                ComboBox x:name="PART_Dash"
                         [Grid.Row=2, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize, DisplayMemberPath="Label",
                          Margin=(0,0,0,@Spacing3)]
                // Cap
                TextBlock [Grid.Row=3, Grid.Column=0,
                           Style=@LabelSmall, Text="Cap",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                ComboBox x:name="PART_Cap"
                         [Grid.Row=3, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize, DisplayMemberPath="Label",
                          Margin=(0,0,0,@Spacing3)]
                // Join
                TextBlock [Grid.Row=4, Grid.Column=0,
                           Style=@LabelSmall, Text="Join",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                ComboBox x:name="PART_Join"
                         [Grid.Row=4, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize, DisplayMemberPath="Label",
                          Margin=(0,0,0,@Spacing3)]
                // Miter limit — only meaningful when LineJoin=Miter.
                // PenEditor.refreshMiterRowVisibility toggles
                // PART_MiterLabel + PART_MiterLimit in lock-step;
                // when both children of an Auto-sized row are Collapsed
                // the row's DesiredSize collapses to zero.
                TextBlock x:name="PART_MiterLabel"
                          [Grid.Row=5, Grid.Column=0,
                           Style=@LabelSmall, Text="Miter limit",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,0)]
                SpinEdit x:name="PART_MiterLimit"
                         [Grid.Row=5, Grid.Column=1,
                          HorizontalAlignment=Left, MaxWidth=120, Width=120,
                          Minimum=1, Maximum=20, SmallChange=0.5, LargeChange=2,
                          DecimalPlaces=1]
            }
        }
    }

    Style [TargetType=PenEditor] {
        Template = @DefaultPenEditor;
    }

    // ── FillEditor: PowerPoint-style inline fill panel ─────────────
    // One column: variant tab row → body slot → opacity slider. The
    // body slot's child is materialised by the FillEditor from the
    // Style-supplied BodyTemplate (swapped on Variant change). Tabs
    // are ClickableBorders the FillEditor wires in adoptTemplateParts;
    // the active-tab highlight rides through Style triggers below.

    Template x:key="DefaultFillEditor" [TargetType=FillEditor] {
        StackPanel x:name="PART_FillSection" [Orientation=Vertical] {
            // Section header — kept inside the editor so the
            // ShapeFormatControl template stays a flat pair of editors.
            // The header + variant tab row are ALWAYS visible (so the
            // user can switch back to a brush after picking No fill);
            // only the body slot + transparency row collapse on
            // Variant=None. Whole-section collapse for the "no shape
            // selected" state lives on PART_Editors in
            // ShapeFormatControl, one level up.
            TextBlock [Style=@TitleSmall, Text="Fill",
                       Foreground=@OnSurface, Margin=(0,0,0,@Spacing3)]
            // ── Variant tabs ────────────────────────────────────
            // ClickableBorder for each of the six variants. Default
            // background is @Surface; the Style triggers below flip
            // the active one to @SecondaryContainer. UniformGrid 3×2
            // lays them in two rows regardless of pane width.
            UniformGrid [Columns=3, Margin=(0,0,0,@Spacing4)] {
                ClickableBorder x:name="PART_TabNone"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="No fill", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabSolid"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabLinear"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabRadial"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabPattern"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabPicture"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Picture", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
            }

            // ── Body slot ───────────────────────────────────────
            // FillEditor.applyBodyTemplate() materialises the Style-
            // picked BodyTemplate here. Border gives a stable single-
            // child container without any visible chrome of its own.
            // MaxWidth caps the slot so the per-variant 2-column Grids
            // below don't inflate their Star tracks to Infinity when
            // the editor lives inside an unbounded host (ScrollViewer).
            Border x:name="PART_BodyHost" [MaxWidth=300, Margin=(0,0,0,@Spacing4)]

            // ── Opacity row ─────────────────────────────────────
            // Visible for every non-None variant; collapsed by
            // FillEditor.refreshOpacityRowVisibility when Variant=None
            // (alongside PART_BodyHost — the tabs above stay visible
            // so the user can switch back to a brush).
            // SpinEdit replaces the old slider+readout pair (request #3).
            // Wrapped in its own 2-column Grid so the Transparency
            // label aligns with the labels in the body grid above.
            Grid x:name="PART_OpacityRow" [MaxWidth=300] {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                }
                // Explicit Auto row — without it the Grid defaults to a
                // 1* row that absorbs the unbounded available height
                // from the surrounding vertical StackPanel and yields
                // Infinity rect dimensions.
                RowDefinitions {
                    RowDefinition [Height=GridLength.Auto]
                }
                TextBlock [Grid.Column=0,
                           Style=@LabelSmall, Text="Transparency",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,0)]
                SpinEdit x:name="PART_OpacityEdit"
                         [Grid.Column=1,
                          HorizontalAlignment=Left, MaxWidth=120, Width=120,
                          Minimum=0, Maximum=100, SmallChange=1, LargeChange=10,
                          DecimalPlaces=0]
            }
        }

        when ( Variant = None    ) { PART_TabNone.Background    = @SecondaryContainer; }
        when ( Variant = Solid   ) { PART_TabSolid.Background   = @SecondaryContainer; }
        when ( Variant = Linear  ) { PART_TabLinear.Background  = @SecondaryContainer; }
        when ( Variant = Radial  ) { PART_TabRadial.Background  = @SecondaryContainer; }
        when ( Variant = Pattern ) { PART_TabPattern.Background = @SecondaryContainer; }
        when ( Variant = Picture ) { PART_TabPicture.Background = @SecondaryContainer; }
    }

    // ── Body templates ─────────────────────────────────────────────
    // Each is a ControlTemplate against TargetType=FillEditor so $$
    // bindings inside resolve to the FillEditor's mirror DPs. The body
    // template's root visual gets slotted into PART_BodyHost.

    // None body — empty. Variant=None collapses PART_BodyHost via
    // FillEditor.refreshOpacityRowVisibility, so the body content
    // never paints in this state; an empty Border keeps
    // applyBodyTemplate's Apply() path well-formed.
    Template x:key="FillEditorBodyNone" [TargetType=FillEditor] {
        Border [Height=0]
    }

    // Each body template uses a 2-column Grid — Auto-sized label column
    // on the left, Star-sized editor column on the right. Editor cells
    // inherit Stretch alignment from the Grid cell so ColorPickers /
    // Sliders / ComboBoxes fill the available width.

    Template x:key="FillEditorBodySolid" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            // Explicit Auto row — without it the Grid defaults to a
            // single 1* row, which absorbs any unbounded available
            // height the host hands in (e.g. ScrollViewer's Infinity
            // measure) and propagates Infinity into child rect heights.
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Column=0,
                       Style=@LabelSmall, Text="Colour",
                       Foreground=@OnSurface,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            ColorPicker x:name="PART_SolidColor"
                        [Grid.Column=1, Variant=RGB]
        }
    }

    Template x:key="FillEditorBodyLinear" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Row=0, Grid.Column=0,
                       Style=@LabelSmall, Text="Start colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_LinearStart"
                        [Grid.Row=0, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=1, Grid.Column=0,
                       Style=@LabelSmall, Text="End colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_LinearEnd"
                        [Grid.Row=1, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=2, Grid.Column=0,
                       Style=@LabelSmall, Text="Angle",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            Slider x:name="PART_LinearAngle"
                   [Grid.Row=2, Grid.Column=1,
                    Minimum=-180, Maximum=180,
                    SmallChange=1, LargeChange=15]
        }
    }

    Template x:key="FillEditorBodyRadial" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Row=0, Grid.Column=0,
                       Style=@LabelSmall, Text="Inner colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_RadialInner"
                        [Grid.Row=0, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=1, Grid.Column=0,
                       Style=@LabelSmall, Text="Outer colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_RadialOuter"
                        [Grid.Row=1, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=2, Grid.Column=0,
                       Style=@LabelSmall, Text="Cx %",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_RadialCenterX"
                   [Grid.Row=2, Grid.Column=1,
                    Minimum=0, Maximum=100,
                    SmallChange=1, LargeChange=10,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=3, Grid.Column=0,
                       Style=@LabelSmall, Text="Cy %",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_RadialCenterY"
                   [Grid.Row=3, Grid.Column=1,
                    Minimum=0, Maximum=100,
                    SmallChange=1, LargeChange=10,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=4, Grid.Column=0,
                       Style=@LabelSmall, Text="Radius %",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            Slider x:name="PART_RadialRadius"
                   [Grid.Row=4, Grid.Column=1,
                    Minimum=1, Maximum=100,
                    SmallChange=1, LargeChange=10]
        }
    }

    Template x:key="FillEditorBodyPattern" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Row=0, Grid.Column=0,
                       Style=@LabelSmall, Text="Kind",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ComboBox x:name="PART_PatternKind"
                     [Grid.Row=0, Grid.Column=1,
                      TextBlock.FontSize=@BodySmallSize,
                      Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=1, Grid.Column=0,
                       Style=@LabelSmall, Text="Foreground",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_PatternForeground"
                        [Grid.Row=1, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=2, Grid.Column=0,
                       Style=@LabelSmall, Text="Background",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_PatternBackground"
                        [Grid.Row=2, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=3, Grid.Column=0,
                       Style=@LabelSmall, Text="Size",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_PatternSize"
                   [Grid.Row=3, Grid.Column=1,
                    Minimum=2, Maximum=64,
                    SmallChange=1, LargeChange=4,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=4, Grid.Column=0,
                       Style=@LabelSmall, Text="Angle",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_PatternAngle"
                   [Grid.Row=4, Grid.Column=1,
                    Minimum=0, Maximum=180,
                    SmallChange=1, LargeChange=15,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=5, Grid.Column=0,
                       Style=@LabelSmall, Text="Stroke",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            Slider x:name="PART_PatternStroke"
                   [Grid.Row=5, Grid.Column=1,
                    Minimum=0.5, Maximum=8,
                    SmallChange=0.5, LargeChange=1]
        }
    }

    Template x:key="FillEditorBodyPicture" [TargetType=FillEditor] {
        // StackPanel wraps the label/editor Grid AND the full-width
        // helper paragraph. The paragraph is NOT inside the Grid: a
        // wrapping TextBlock with Grid.ColumnSpan=2 measures with
        // Infinity in the Auto pass and dumps its unwrapped intrinsic
        // width into the Auto column (Stars aren't pre-resolved at that
        // phase — see grid.ts), which collapses the Star column and
        // hides the TextBox / ComboBox. As an outside sibling the
        // paragraph just inherits the StackPanel's width with no Grid
        // interaction.
        StackPanel [Orientation=Vertical] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                }
                RowDefinitions {
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                }
                TextBlock [Grid.Row=0, Grid.Column=0,
                           Style=@LabelSmall, Text="Image URL",
                           Foreground=@OnSurfaceVariant,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing2)]
                TextBox x:name="PART_PictureUri"
                        [Grid.Row=0, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
                TextBlock [Grid.Row=1, Grid.Column=0,
                           Style=@LabelSmall, Text="Stretch",
                           Foreground=@OnSurfaceVariant,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,0)]
                ComboBox x:name="PART_PictureStretch"
                         [Grid.Row=1, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize]
            }
            TextBlock [Style=@LabelSmall,
                       Text="Paste an absolute URL or a workspace-relative path. Uniform stretch keeps aspect; Fill stretches independently; UniformToFill crops to bbox.",
                       Foreground=@OnSurfaceVariant,
                       TextWrapping=Wrap, Margin=(0,@Spacing2,0,0)]
        }
    }

    Style [TargetType=FillEditor] {
        Template     = @DefaultFillEditor;
        BodyTemplate = @FillEditorBodySolid;
        when ( Variant = None    ) { BodyTemplate = @FillEditorBodyNone;    }
        when ( Variant = Linear  ) { BodyTemplate = @FillEditorBodyLinear;  }
        when ( Variant = Radial  ) { BodyTemplate = @FillEditorBodyRadial;  }
        when ( Variant = Pattern ) { BodyTemplate = @FillEditorBodyPattern; }
        when ( Variant = Picture ) { BodyTemplate = @FillEditorBodyPicture; }
    }

    // ── ShapeFormatControl: PowerPoint Format-Shape pane ───────────
    // Combines FillEditor + PenEditor into one column. PART_FillEditor
    // and PART_PenEditor are adopted by ShapeFormatControl.ts, which
    // routes its Fill / Stroke DPs through to / from each editor under
    // a _syncing guard. No TemplateBinding here: FillEditor swaps its
    // Fill wholesale on every edit (TemplateBinding is OneWay, so the
    // editor's writes wouldn't surface), and the manual wiring keeps
    // the two editors symmetric.
    // Section headers ("Fill", "Line") moved INTO each editor's template
    // so the Fill section can collapse as a whole when Variant=None.
    // The wrapper stacks the two editors and ALSO carries an empty-state
    // placeholder shown when both Fill and Stroke are undefined (the
    // diagrammer's "no shape selected" signal). ShapeFormatControl.ts
    // toggles PART_Editors / PART_EmptyMessage heights on every Fill or
    // Stroke change.
    Template x:key="DefaultShapeFormatControl" [TargetType=ShapeFormatControl] {
        StackPanel [Orientation=Vertical] {
            TextBlock x:name="PART_EmptyMessage"
                      [Style=@BodySmall,
                       Text="Select a shape to format its fill and outline.",
                       Foreground=@OnSurfaceVariant,
                       TextWrapping=Wrap,
                       HorizontalAlignment=Stretch,
                       Margin=(0,@Spacing4,0,0)]
            StackPanel x:name="PART_Editors" [Orientation=Vertical] {
                FillEditor x:name="PART_FillEditor"
                PenEditor  x:name="PART_PenEditor" [Margin=(0,@Spacing4,0,0)]
            }
        }
    }

    Style [TargetType=ShapeFormatControl] {
        Template = @DefaultShapeFormatControl;
    }

    // ── Tooltip + CommandBase DataTemplate ──────────────────────────
    // Promoted to src/framework/tooltips/tooltips.template.mu.
}
