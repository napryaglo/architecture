// Default theme entries for the menus family — MenuStrip (the
// horizontal main-menu bar), MenuButton (the standalone hamburger
// trigger), MenuItem (rows + submenu chrome), MenuSeparator,
// MenuStripItem (the alt MenuItem style used inside MenuStrip),
// and ContextMenu (popup-only).
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Menus {
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
    Template x:key="DefaultMenuButtonTrigger" [TargetType = MenuButton] {
        Button x:name="PART_Trigger" {
            StackPanel x:name="PART_TriggerStack" [ Orientation = Horizontal ] {
                TextBlock x:name="PART_HeaderText" [ Foreground = @OnPrimary, Style = @LabelLarge ]
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
    Template x:key="DefaultMenuButtonPopup" [TargetType = MenuButton] {
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupContainer"
                [ Background      = @SurfaceContainerHigh,
                  BorderBrush     = @OutlineVariant,
                  BorderThickness = (1),
                  CornerRadius    = @ShapeExtraSmall,
                  Effect          = @Elevation2,
                  Padding         = (0) ] {
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
    Style [TargetType = MenuButton] {
        HorizontalAlignment = Left;
        VerticalAlignment = Top;
        Template = @DefaultMenuButtonPopup;
        TriggerTemplate = @DefaultMenuButtonTrigger;
        ItemsPanel = @DefaultMenuItemsPanel;
    }

    // ── ContextMenu: popup overlay ─────────────────────────────────
    // Same shape as the MenuButton popup, minus the anchor — ContextMenu
    // positions the popup at a fixed host-coords point set by OpenAt().
    // ContextMenu IS an ItemsControl whose ControlTemplate is this
    // popup chrome: when OpenAt mounts the ContextMenu on the
    // PresentationTarget's OverlayLayer, this template subtree renders.
    // The ItemsPresenter slots in ContextMenu's ItemsPanel, which
    // materialises the MenuItem rows.
    Template x:key="DefaultContextMenuPopup" [TargetType = ContextMenu] {
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupContainer"
                [ Background      = @SurfaceContainerHigh,
                  BorderBrush     = @OutlineVariant,
                  BorderThickness = (1),
                  CornerRadius    = @ShapeExtraSmall,
                  Effect          = @Elevation2,
                  Padding         = (0) ] {
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
    Style [TargetType = ContextMenu] {
        Template = @DefaultContextMenuPopup;
        ItemsPanel = @DefaultMenuItemsPanel;
    }

    // ── Vertical-stack items panel ─────────────────────────────────
    // Shared by ContextMenu, MenuButton, and MenuItem's submenu popup.
    // The bordered chrome around items comes from each control's own
    // popup ControlTemplate; this just provides the StackPanel that
    // materialises into the ItemsPresenter slot.
    ItemsPanelTemplate x:key="DefaultMenuItemsPanel" {
        StackPanel [ Orientation = Vertical ]
    }

    // ── MenuSeparator: chrome tokens ───────────────────────────────
    // MenuSeparator paints its own thin line via RenderOverride —
    // the Style just tunes the default size and LineBrush so the
    // default visual flips with the theme palette without forcing
    // each consumer to set LineBrush explicitly.
    Style [TargetType = MenuSeparator] {
        Height = 9;
        MinWidth = 16;
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
    Template x:key="DefaultMenuItemRow" [TargetType = MenuItem] {
        Border x:name="PART_Row" [ Padding = (@Spacing2,@Spacing1,@Spacing2,@Spacing1) ] {
            // A DockPanel (not a horizontal StackPanel) so the chevron and
            // gesture pin to the row's RIGHT edge while the header fills the
            // middle — the M3 / platform convention. In a left-packed stack
            // the submenu ▶ sits immediately after a short header, floating
            // mid-row once the popup widens to a longer sibling. LastChildFill
            // gives PART_Label the slack; dock order is icon(left) then
            // chevron/gesture(right) then the label fills.
            DockPanel [ LastChildFill = true ] {
                // Icon column reserves 24dp for an M3-spec leading
                // icon. Width / MinWidth stay inline as a column-grid
                // constant — the M3 menu spec calls for a 24dp icon
                // slot specifically (not a generic spacing token).
                // TextBlock.Foreground establishes the leading-icon ink so a
                // bare Shape icon (Fill unset) paints through effectiveFill's
                // inherited-Foreground fallback — same contract the toolbar
                // buttons use. A consumer Icon with its own Fill overrides it.
                Border x:name="PART_Icon"
                    [ DockPanel.Dock       = Left,
                      Width                = 24,
                      MinWidth             = 24,
                      TextBlock.Foreground = @OnSurfaceVariant ]
                // The submenu ▶ (empty when there's no submenu) pinned right.
                TextBlock x:name="PART_Chevron"
                    [ DockPanel.Dock = Right,
                      Width          = 12,
                      Foreground     = @OnSurfaceVariant ]
                // Keyboard-gesture text sits just left of the chevron, also right-docked.
                TextBlock x:name="PART_Gesture"
                    [ DockPanel.Dock = Right,
                      Margin         = (@Spacing4,0,@Spacing4,0),
                      Foreground     = @OnSurfaceVariant,
                      Style          = @LabelMedium ]
                // Fills the middle so the right-docked columns pin to the edge.
                TextBlock x:name="PART_Label"
                    [ Margin     = (@Spacing2,0,@Spacing4,0),
                      MinWidth   = 80,
                      Foreground = @OnSurface,
                      Style      = @LabelLarge ]
            }
        }
        // M3 state-layer tokens — semi-transparent OnSurface tints over
        // whatever surface the popup chrome paints. Using a solid token
        // like @SurfaceContainerHigh here would be invisible — the
        // ContextMenu / MenuButton popup chrome IS @SurfaceContainerHigh.
        when ( IsMouseOver ) { PART_Row.Background = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Row.Background = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Row.Background = @StatePressOverlay; }
        when ( IsChecked ) { PART_Row.Background = @SecondaryContainer; }
        when ( IsSubmenuOpen ) { PART_Row.Background = @SecondaryContainer; }
        when ( IsEnabled = false ) { PART_Row.Opacity = @DisabledContentOpacity; }

        // M3 density variants — tighter Padding on Compact, looser on
        // Comfortable. Matches the same shape ListBoxItem / ComboBox use.
        when ( ThemeManager.Density = Compact ) {
            PART_Row.Padding = (@Spacing2,@Spacing0,@Spacing2,@Spacing0);
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Row.Padding = (@Spacing2,@Spacing2,@Spacing2,@Spacing2);
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Row.Padding = (@Spacing3,@Spacing3,@Spacing3,@Spacing3);
        }
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
    Template x:key="DefaultMenuItemSubmenu" [TargetType = MenuItem] {
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupContainer"
                [ Background      = @SurfaceContainerHigh,
                  BorderBrush     = @OutlineVariant,
                  BorderThickness = (1),
                  CornerRadius    = @ShapeExtraSmall,
                  Effect          = @Elevation2,
                  Padding         = (0) ] {
                ItemsPresenter
            }
        }

        // High-contrast popup chrome — see DefaultMenuButtonPopup for
        // the rationale.
        when ( ThemeManager.PrefersContrast = More ) { PART_PopupContainer.BorderThickness = (2); }
    }

    Style [TargetType = MenuItem] {
        Template = @DefaultMenuItemSubmenu;
        ItemsPanel = @DefaultMenuItemsPanel;
        RowTemplate = @DefaultMenuItemRow;
    }

    // ── MenuStripItem: stripped row chrome ─────────────────────────
    // Top-level row inside a MenuStrip. Same Border + state triggers
    // as the standard row, but the icon / gesture / chevron columns
    // collapse to zero width — only the header is visible. The
    // submenu popup mechanic (defined by MenuItem's primary Template)
    // still applies, so clicking a top-level item opens its submenu
    // popup below.
    Template x:key="DefaultMenuStripItemRow" [TargetType = MenuItem] {
        Border x:name="PART_Row" [ Padding = (@Spacing3,@Spacing1,@Spacing3,@Spacing1) ] {
            StackPanel [ Orientation = Horizontal ] {
                Border x:name="PART_Icon" [ Width = 0, MinWidth = 0 ]
                TextBlock x:name="PART_Label"
                    [ MinWidth   = 0,
                      Foreground = @OnSurface,
                      Style      = @LabelLarge ]
                TextBlock x:name="PART_Gesture" [ Width = 0, Foreground = @OnSurfaceVariant ]
                TextBlock x:name="PART_Chevron" [ Width = 0, Foreground = @OnSurfaceVariant ]
            }
        }
        // State-layer tokens — see DefaultMenuItemRow above for why.
        when ( IsMouseOver ) { PART_Row.Background = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Row.Background = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Row.Background = @StatePressOverlay; }
        when ( IsSubmenuOpen ) { PART_Row.Background = @SecondaryContainer; }
        when ( IsEnabled = false ) { PART_Row.Opacity = @DisabledContentOpacity; }

        when ( ThemeManager.Density = Compact ) {
            PART_Row.Padding = (@Spacing3,@Spacing0,@Spacing3,@Spacing0);
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Row.Padding = (@Spacing3,@Spacing2,@Spacing3,@Spacing2);
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Row.Padding = (@Spacing4,@Spacing3,@Spacing4,@Spacing3);
        }
    }

    // Style for MenuStrip top-level rows — applied via
    // MenuStrip.ItemContainerStyle so each container MenuItem gets
    // the stripped chrome. The ItemContainerStyle factory is in
    // surface-resources; this Style is keyed (not implicit-by-type)
    // to keep nested MenuItems on their default row.
    Style x:key="MenuStripItemStyle" [TargetType = MenuItem] {
        RowTemplate = @DefaultMenuStripItemRow;
    }

    // ── MenuStrip: horizontal panel default ────────────────────────
    ItemsPanelTemplate x:key="DefaultMenuStripPanel" {
        StackPanel [ Orientation = Horizontal ]
    }
    Style [TargetType = MenuStrip] {
        Background = @SurfaceContainerLow;
        Padding = (4,2,4,2);
        ItemsPanel = @DefaultMenuStripPanel;
        ItemContainerStyle = @MenuStripItemStyle;
    }
}
