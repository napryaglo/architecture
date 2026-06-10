// Default theme entries for the command-surface controls — ToggleButton
// / ToolBar / Menu / MenuButton / ContextMenu. Kept separate from the
// main `controls.template.mu` because that file is loaded eagerly by
// Button's static block (via `ensureControlsTheme()`), and pulling any
// Button subclass into that cascade triggers a TDZ on the not-yet-
// initialised Button binding. See the Controls barrel comment around
// `surface.js` for the full explanation.
//
// This file is loaded only when the surface bundle is imported — its
// factory is registered with Application by `ensureSurfaceTheme()`,
// which surface controls call from their own static blocks.
//
// MenuButton and ContextMenu each ship TWO keyed templates (trigger +
// popup for MenuButton; just popup for ContextMenu) because they need
// to materialise two visual subtrees with different lifetimes — the
// trigger sits inline in the tree, while the popup is mounted onto the
// PresentationTarget's OverlayLayer when IsOpen flips true. WPF's
// MenuButton / ContextMenu carry an analogous split in their default
// styles; ComboBox + Drawer use the same dual-template shape (see
// controls.template.mu).

resources SurfaceTheme {

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
        when ( IsMouseOver )       { PART_Border.Background  = @StateHoverOverlay; }
        when ( IsPressed )         { PART_Border.Background  = @StatePressOverlay; }
        when ( Position = Only  )  { PART_Border.CornerRadius = CornerRadius.Full; }
        when ( Position = First )  { PART_Border.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last  )  { PART_Border.CornerRadius = CornerRadius.RightRounded; }
    }

    Style [TargetType=ToolBarButton] {
        Template = @DefaultToolBarButton;
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
        when ( IsMouseOver )       { PART_Border.Background  = @StateHoverOverlay; }
        when ( IsPressed )         { PART_Border.Background  = @StatePressOverlay; }
        when ( IsChecked )         { PART_Border.Background  = @SecondaryContainer; }
        when ( Position = Only  )  { PART_Border.CornerRadius = CornerRadius.Full; }
        when ( Position = First )  { PART_Border.CornerRadius = CornerRadius.LeftRounded; }
        when ( Position = Last  )  { PART_Border.CornerRadius = CornerRadius.RightRounded; }
    }

    Style [TargetType=ToolBarToggleButton] {
        Template = @DefaultToolBarToggleButton;
    }
}
