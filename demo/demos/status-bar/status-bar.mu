import StatusBarVM from "./status-bar-vm.mjs"

// status-bar.mu — StatusBar showcase. A self-contained "window card"
// with a title bar at the top and a StatusBar pinned at the bottom of
// the card via DockPanel.Dock=Bottom. The content area in between
// holds the action buttons that mutate the strip's cells.
//
// What's exercised:
//   * Inline StatusBarItem children (composed-markup path —
//     IsItemItsOwnContainerOverride pass-through).
//   * DockPanel.Dock attached on each item — the StatusBar's default
//     ItemsPanel is a DockPanel with LastChildFill=true.
//   * StatusBarSeparator between cells — vertical 1px dividers that
//     tint with the theme palette.
//   * RelayCommand-driven mutation: Add / Remove / Save buttons change
//     the cells via VM DP writes; CanExecute gates Remove when the
//     count is zero.

resources StatusBarDemo {
    DataTemplate x:key="StatusBarTemplate" [DataType = StatusBarVM] {
        Border
            [ Background        = @Surface,
              BorderBrush       = @OutlineVariant,
              BorderThickness   = (1),
              CornerRadius      = 4,
              VerticalAlignment = Top,
              Margin            = (16,16,16,16) ] {
            // Status-bar card — explicit Height + VerticalAlignment=Top
            // so DockPanel.Dock=Bottom anchors the strip at the card's
            // bottom edge (and not at the bottom of the whole PageView
            // content area, which would leave a huge empty gap between
            // the action buttons and the strip). LastChildFill=true on
            // the DockPanel handles the middle.

            DockPanel {
                // Title strip — the card's header.
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "StatusBar — docked cells with separators.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Status strip — pinned at the bottom of the card.
                StatusBar [ DockPanel.Dock = Bottom ] {
                    // Left: persistence state. Inline ternary on
                    // the bound boolean — Save flips it back,
                    // Add/Remove set it to true. Foreground is a
                    // DynamicResource so dark-mode switches re-tint
                    // the text (Foreground lives on TextBlock, not
                    // on Visual/Control, so it must be set here
                    // rather than on the StatusBarItem Style).
                    StatusBarItem [ DockPanel.Dock = Left ] {
                        TextBlock
                            [ Text       = {{ $IsModified ? "● Modified" : "✓ Saved" }},
                              Foreground = @OnSurfaceVariant,
                              FontSize   = 12 ]
                    }

                    StatusBarSeparator [ DockPanel.Dock = Left ]

                    // Right: counters / last action — `DockPanel.Dock=Right`
                    // items pin to the right edge in declaration order
                    // (first-declared is the rightmost).
                    StatusBarItem [ DockPanel.Dock = Right ] {
                        TextBlock
                            [ Text       = {{ "Items: " + String($ItemCount) }},
                              Foreground = @OnSurfaceVariant,
                              FontSize   = 12 ]
                    }

                    StatusBarSeparator [ DockPanel.Dock = Right ]

                    StatusBarItem [ DockPanel.Dock = Right ] {
                        TextBlock
                            [ Text       = {{ "Last: " + String($LastAction) }},
                              Foreground = @OnSurfaceVariant,
                              FontSize   = 12 ]
                    }

                    StatusBarSeparator [ DockPanel.Dock = Right ]

                    // Middle: empty stretchy filler. LastChildFill=true
                    // on the StatusBar's DockPanel ItemsPanel makes this
                    // un-docked item expand to fill the residue between
                    // the left and right groups.
                    StatusBarItem
                }

                // Middle: action buttons. With LastChildFill=true,
                // this StackPanel fills the residue between the
                // top title strip and the bottom StatusBar.
                StackPanel [ Orientation = Vertical, Margin = (16,16,16,16) ] {
                    TextBlock
                        [ Text       = "Use these buttons to change the cells in the bottom strip:",
                          FontSize   = 12,
                          FontWeight = Bold,
                          Margin     = (0,0,0,8) ]
                    StackPanel [ Orientation = Horizontal ] {
                        Button [ Command = $AddItemCommand, Margin = (0,0,8,0) ] {
                            TextBlock [ Text = "Add item" ]
                        }
                        Button [ Command = $RemoveItemCommand, Margin = (0,0,8,0) ] {
                            TextBlock [ Text = "Remove item" ]
                        }
                        Button [ Command = $SaveCommand ] {
                            TextBlock [ Text = "Save" ]
                        }
                    }
                    TextBlock
                        [ Text       = "Remove is gated by item count — its chrome dims when there's nothing to remove.",
                          FontSize   = 11,
                          Foreground = @OnSurfaceVariant,
                          Margin     = (0,12,0,0) ]
                }
            }
        }
    }
}
