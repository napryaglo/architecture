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

ResourceDictionary {

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
    // PART_PopupContainer is the chrome around PART_Menu (the actual
    // MenuItem column). MenuButton's ctor sets PART_PopupHost.anchor to
    // PART_Trigger so the popup positions itself just below the trigger.
    Template x:key="DefaultMenuButtonPopup" [TargetType=MenuButton]{
        MenuPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [BorderThickness = (0)]
            Border x:name="PART_PopupContainer"
                  [Background      = @SurfaceContainerHigh,
                   BorderBrush     = @OutlineVariant,
                   BorderThickness = (1),
                   CornerRadius    = @ShapeExtraSmall,
                   Effect          = @Elevation2,
                   Padding         = (0),
                   MaxWidth        = 400]{
                Menu x:name="PART_Menu"
            }
        }
    }

    // ── MenuButton: default Style ──────────────────────────────────
    // The popup host carries no in-flow chrome, so a single Template
    // setter would cover only the trigger. Instead, the popup is keyed
    // separately and read by name from the ctor (same shape ComboBox
    // and Drawer use for their split templates). This Style pins the
    // axis defaults so the MenuButton sizes to its trigger's natural
    // width rather than stretching to fill its parent.
    Style [TargetType=MenuButton] {
        HorizontalAlignment = Left;
        VerticalAlignment   = Top;
    }

    // ── ContextMenu: popup overlay ─────────────────────────────────
    // Same shape as the MenuButton popup, minus the anchor — ContextMenu
    // positions the popup at a fixed host-coords point set by OpenAt().
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
                Menu x:name="PART_Menu"
            }
        }
    }

    // ── Menu: default chrome ───────────────────────────────────────
    // Menu has no painted chrome of its own — the popup hosting Menu
    // (MenuButton's PART_PopupContainer / ContextMenu's overlay /
    // MenuItem submenus) supplies the bordered surface. The default
    // Style only pins the items-panel orientation so authors don't
    // need to import StackPanel + Orientation just to lay out a
    // vertical menu.
    ItemsPanelTemplate x:key="DefaultMenuItemsPanel" {
        StackPanel [Orientation = Vertical]
    }
    Style [TargetType=Menu] {
        ItemsPanel = @DefaultMenuItemsPanel;
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
    // column's Visual is named so MenuItem.OnApplyTemplate can grab
    // it via FindName for content updates (the Header / Icon /
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
    Template x:key="DefaultMenuItem" [TargetType=MenuItem] {
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
        when ( IsMouseOver )   { PART_Row.Background = @SurfaceContainerHigh; }
        when ( IsPressed )     { PART_Row.Background = @SurfaceContainerHighest; }
        when ( IsChecked )     { PART_Row.Background = @SecondaryContainer; }
        when ( IsSubmenuOpen ) { PART_Row.Background = @SecondaryContainer; }
    }
    Style [TargetType=MenuItem] {
        Template = @DefaultMenuItem;
    }
}
