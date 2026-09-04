import ContextMenuVM from "./context-menu-vm.mjs"

// context-menu.mu — ContextMenu attached-property showcase. Three
// coloured panels each carry their OWN ContextMenu via the attached
// `ContextMenuService.ContextMenu` DP (or the ergonomic
// `Visual.ContextMenu` instance accessor). Right-click any panel to
// open its menu at the cursor position.
//
// Each menu is a themed capabilities tour — collectively they exercise
// every MenuItem feature:
//   * Icon             — a Material Symbols glyph in the icon gutter.
//   * InputGestureText — display-only shortcut chord ("Ctrl+C", "Del").
//   * MenuSeparator    — horizontal group divider.
//   * IsEnabled=false  — a disabled (greyed, non-clickable) item.
//   * IsCheckable/IsChecked — ✓ items bound to VM state (View menu).
//   * Submenus         — nested MenuItem blocks, up to two levels deep
//                        (File ▸ Share ▸ Export).
//
// Icons are Material Symbols Outlined ligatures rendered as a TextBlock
// (the platform preloads that font); the icon gutter is ~24dp, so 18px
// centred glyphs sit correctly. Checkable rows carry NO icon — the ✓
// occupies the same gutter.
//
// The status line at the bottom updates as commands fire — each leaf
// passes a CommandParameter the VM uses to format the status string.

resources ContextMenuDemo {
    // ── Red panel → "Edit" menu ──────────────────────────────────────
    // Icon + gesture items, a disabled item, and a Transform ▸ submenu.
    ContextMenu x:key="RedMenu" {
        MenuItem
            [ Header           = "Cut",
              InputGestureText = "Ctrl+X",
              Command          = $RedCommand,
              CommandParameter = "Cut",
              Icon             = TextBlock [ Text = "content_cut",   FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        MenuItem
            [ Header           = "Copy",
              InputGestureText = "Ctrl+C",
              Command          = $RedCommand,
              CommandParameter = "Copy",
              Icon             = TextBlock [ Text = "content_copy",  FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        MenuItem
            [ Header           = "Paste",
              InputGestureText = "Ctrl+V",
              Command          = $RedCommand,
              CommandParameter = "Paste",
              Icon             = TextBlock [ Text = "content_paste", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        MenuSeparator
        // Disabled: nothing to delete until something is selected.
        MenuItem
            [ Header           = "Delete",
              InputGestureText = "Del",
              IsEnabled        = false,
              Icon             = TextBlock [ Text = "delete", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        MenuSeparator
        MenuItem
            [ Header = "Transform",
              Icon   = TextBlock [ Text = "transform", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ] {
            MenuItem
                [ Header           = "Rotate 90°",
                  Command          = $RedCommand,
                  CommandParameter = "Rotate 90°",
                  Icon             = TextBlock [ Text = "rotate_right", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
            MenuItem
                [ Header           = "Flip Horizontal",
                  Command          = $RedCommand,
                  CommandParameter = "Flip Horizontal",
                  Icon             = TextBlock [ Text = "swap_horiz", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
            MenuItem
                [ Header           = "Flip Vertical",
                  Command          = $RedCommand,
                  CommandParameter = "Flip Vertical",
                  Icon             = TextBlock [ Text = "swap_vert", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        }
    }
    // ── Green panel → "View" menu ────────────────────────────────────
    // Checkable items bound to VM state + a Zoom ▸ submenu.
    ContextMenu x:key="GreenMenu" {
        MenuItem
            [ Header      = "Show Grid",
              IsCheckable = true,
              IsChecked   = $ShowGrid,
              Command     = $ShowGridCommand ]
        MenuItem
            [ Header      = "Snap to Grid",
              IsCheckable = true,
              IsChecked   = $SnapToGrid,
              Command     = $SnapToGridCommand ]
        MenuItem
            [ Header      = "Show Rulers",
              IsCheckable = true,
              IsChecked   = $ShowRulers,
              Command     = $ShowRulersCommand ]
        MenuSeparator
        MenuItem
            [ Header = "Zoom",
              Icon   = TextBlock [ Text = "zoom_in", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ] {
            MenuItem [ Header = "50%",  Command = $GreenCommand, CommandParameter = "Zoom 50%" ]
            MenuItem [ Header = "100%", Command = $GreenCommand, CommandParameter = "Zoom 100%" ]
            MenuItem [ Header = "200%", Command = $GreenCommand, CommandParameter = "Zoom 200%" ]
            MenuSeparator
            MenuItem
                [ Header           = "Fit to Window",
                  InputGestureText = "Ctrl+0",
                  Command          = $GreenCommand,
                  CommandParameter = "Fit to Window",
                  Icon             = TextBlock [ Text = "fit_screen", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        }
    }
    // ── Blue panel → "File" menu ─────────────────────────────────────
    // Icon + gesture items and a two-level Share ▸ Export ▸ submenu.
    ContextMenu x:key="BlueMenu" {
        MenuItem
            [ Header           = "Open…",
              InputGestureText = "Ctrl+O",
              Command          = $BlueCommand,
              CommandParameter = "Open",
              Icon             = TextBlock [ Text = "folder_open", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        MenuItem
            [ Header           = "Save",
              InputGestureText = "Ctrl+S",
              Command          = $BlueCommand,
              CommandParameter = "Save",
              Icon             = TextBlock [ Text = "save", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
        MenuSeparator
        MenuItem
            [ Header = "Share",
              Icon   = TextBlock [ Text = "share", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ] {
            MenuItem
                [ Header           = "Copy Link",
                  Command          = $BlueCommand,
                  CommandParameter = "Copy Link",
                  Icon             = TextBlock [ Text = "link", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
            MenuItem
                [ Header           = "Email",
                  Command          = $BlueCommand,
                  CommandParameter = "Email",
                  Icon             = TextBlock [ Text = "mail", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ]
            MenuSeparator
            // Second-level submenu: Share ▸ Export ▸ {PNG, SVG, PDF}.
            MenuItem
                [ Header = "Export as",
                  Icon   = TextBlock [ Text = "download", FontFamily = "Material Symbols Outlined", FontSize = 18, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center, VerticalAlignment = Center ] ] {
                MenuItem [ Header = "PNG image", Command = $BlueCommand, CommandParameter = "Export PNG" ]
                MenuItem [ Header = "SVG vector", Command = $BlueCommand, CommandParameter = "Export SVG" ]
                MenuItem [ Header = "PDF document", Command = $BlueCommand, CommandParameter = "Export PDF" ]
            }
        }
        MenuSeparator
        MenuItem
            [ Header      = "Bookmark",
              IsCheckable = true,
              IsChecked   = $Bookmarked,
              Command     = $BookmarkCommand ]
    }

    DataTemplate [DataType = ContextMenuVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            DockPanel {
                // Header
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "ContextMenu — right-click a panel to open its menu at the cursor. Each shows different features: icons, shortcuts, submenus, checkables.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (16,16,16,16) ] {
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,16) ] {
                        Border
                            [ Fill                     = #ef4444,
                              Width                          = 180,
                              Height                         = 120,
                              Margin                         = (0,0,12,0),
                              ContextMenuService.ContextMenu = @RedMenu ] {
                            TextBlock
                                [ Text                = "Edit menu\nicons · shortcuts · disabled · submenu",
                                  Foreground          = @OnPrimary,
                                  FontSize            = 14,
                                  FontWeight          = Bold,
                                  TextAlignment       = Center,
                                  HorizontalAlignment = Center,
                                  VerticalAlignment   = Center ]
                        }
                        Border
                            [ Fill                     = #22c55e,
                              Width                          = 180,
                              Height                         = 120,
                              Margin                         = (0,0,12,0),
                              ContextMenuService.ContextMenu = @GreenMenu ] {
                            TextBlock
                                [ Text                = "View menu\ncheckables · Zoom submenu",
                                  Foreground          = @OnPrimary,
                                  FontSize            = 14,
                                  FontWeight          = Bold,
                                  TextAlignment       = Center,
                                  HorizontalAlignment = Center,
                                  VerticalAlignment   = Center ]
                        }
                        Border
                            [ Fill                     = #3b82f6,
                              Width                          = 180,
                              Height                         = 120,
                              ContextMenuService.ContextMenu = @BlueMenu ] {
                            TextBlock
                                [ Text                = "File menu\nnested Share ▸ Export submenu",
                                  Foreground          = @OnPrimary,
                                  FontSize            = 14,
                                  FontWeight          = Bold,
                                  TextAlignment       = Center,
                                  HorizontalAlignment = Center,
                                  VerticalAlignment   = Center ]
                        }
                    }

                    TextBlock [ Text = $Status, FontSize = 13, Foreground = @OnSurface ]
                }
            }
        }
    }
}
