import ToolBarVM from "./tool-bar-vm.mjs"

// tool-bar.mu — ToolBar showcase. Items flow left-to-right; the chevron
// strip on the right hosts an overflow popup when items don't fit.
//
// What's exercised:
//   * Mixed item types: ToolBarButton, ToolBarSeparator.
//   * Command binding through the standard ICommandSource contract.
//   * Selection-gated Delete — CanExecute drives the button's
//     IsEnabled-equivalent chrome (Button's helper consults CanExecute
//     on click and ignores the press when false).
//
// Overflow demo deferred: ToolBarOverflowItemsControl reuses the inline
// item Visuals as its container set, which collides with the
// "one-visual-one-parent" rule. The framework needs a "move on
// overflow" mechanism before this demo can showcase that path safely.

resources ToolBarDemo {
    DataTemplate [DataType = ToolBarVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            DockPanel {
                // Header
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "ToolBar — Button rows, separators, and command binding.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Body
                StackPanel [ Orientation = Vertical, Margin = (16,16,16,16) ] {
                    TextBlock
                        [ Text       = "A row of command buttons separated into groups:",
                          FontSize   = 12,
                          FontWeight = Bold,
                          Margin     = (0,0,0,8) ]

                    ToolBar {
                        ToolBarButton [ Command = $SaveCommand ] {
                            TextBlock [ Text = "💾" ]
                        }
                        ToolBarSeparator
                        ToolBarButton [ Command = $CutCommand ] {
                            TextBlock [ Text = "✂" ]
                        }
                        ToolBarButton [ Command = $CopyCommand ] {
                            TextBlock [ Text = "📋" ]
                        }
                        ToolBarButton [ Command = $DeleteCommand ] {
                            TextBlock [ Text = "🗑" ]
                        }
                    }

                    TextBlock
                        [ Text       = $Status,
                          FontSize   = 13,
                          Foreground = @OnSurface,
                          Margin     = (0,16,0,4) ]

                    StackPanel [ Orientation = Horizontal, Margin = (0,8,0,0) ] {
                        TextBlock
                            [ Text       = "Selection state:",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,8,0) ]
                        ToggleButton
                            [ IsChecked = $HasSelection,
                              Command   = $ToggleSelectionCommand ] {
                            TextBlock [ Text = "HasSelection" ]
                        }
                        TextBlock
                            [ Text       = "  (Delete is selection-gated — toggle to ungate.)",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (8,8,0,0) ]
                    }
                }
            }
        }
    }
}
