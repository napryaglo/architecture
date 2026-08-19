import MenuVM from "./menu-vm.mjs"

// menu.mu — MenuButton + MenuItem showcase. A single hamburger button
// opens a vertical column of menu rows:
//   * File group   — New, Open, Save, Save As, Close
//   * Edit group   — Undo, Redo
//   * View group   — Show Grid (checkable), Snap to Grid (checkable)
//
// What's exercised:
//   * Header           — row text in the second column.
//   * InputGestureText — display-only chord ("Ctrl+S", "Del", …).
//   * Command          — invoked on click.
//   * IsCheckable + IsChecked — ✓ glyph in the icon column when set.
//   * MenuSeparator    — horizontal divider between groups.

resources MenuDemo {
    DataTemplate [DataType = MenuVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ], BorderThickness = (1) ] {
            DockPanel {
                // Header
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "MenuButton — hamburger fly-out with checkable items and gesture text.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Body
                StackPanel [ Orientation = Vertical, Margin = (16,16,16,16) ] {
                    TextBlock
                        [ Text       = "Click the button to open the menu:",
                          FontSize   = 12,
                          Foreground = @OnSurfaceVariant,
                          Margin     = (0,0,0,8) ]

                    MenuButton [ Header = "☰  File" ] {
                        MenuItem
                            [ Header           = "New",
                              InputGestureText = "Ctrl+N",
                              Command          = $NewCommand ]
                        MenuItem
                            [ Header           = "Open…",
                              InputGestureText = "Ctrl+O",
                              Command          = $OpenCommand ]
                        MenuSeparator
                        MenuItem
                            [ Header           = "Save",
                              InputGestureText = "Ctrl+S",
                              Command          = $SaveCommand ]
                        MenuItem
                            [ Header           = "Save As…",
                              InputGestureText = "Ctrl+Shift+S",
                              Command          = $SaveAsCommand ]
                        MenuSeparator
                        MenuItem
                            [ Header           = "Close",
                              InputGestureText = "Ctrl+F4",
                              Command          = $CloseCommand ]
                        MenuSeparator
                        MenuItem
                            [ Header           = "Undo",
                              InputGestureText = "Ctrl+Z",
                              Command          = $UndoCommand ]
                        MenuItem
                            [ Header           = "Redo",
                              InputGestureText = "Ctrl+Y",
                              Command          = $RedoCommand ]
                        MenuSeparator
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
                    }

                    TextBlock
                        [ Text       = $Status,
                          FontSize   = 13,
                          Foreground = @OnSurface,
                          Margin     = (0,16,0,0) ]
                }
            }
        }
    }
}
