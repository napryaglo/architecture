import SegmentedButtonVM from "./segmented-button-vm.mjs"

// segmented-button.mu — M3 SegmentedButton showcase.
//
// Two scenarios cover the spec's Single + Multiple variants:
//   * Timeframe picker — SelectionMode=Single, Items bound to a VM
//     ObservableCollection, SelectedItem two-way-bound to the VM. Click
//     a segment to swap which timeframe the readout shows.
//   * Format toggles — SelectionMode=Multiple, SelectedItems bound to a
//     VM ObservableCollection so the toggle state of every segment
//     round-trips through the data layer.
//
// Position auto-resolution is the structural payoff: each segment's
// corner radii flip from Start (rounded-left) to Middle (square) to End
// (rounded-right) based on its index — the SegmentedButton stamps it
// on every PrepareContainerForItemOverride pass, the template's `when
// (Position = …)` triggers handle the rest.

resources SegmentedButtonDemo {
    DataTemplate [DataType = SegmentedButtonVM] {
        Border [ Fill = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "SegmentedButton — M3's connected-segment selection row. Single-select and Multi-select variants drive off SelectionMode.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    // ── Row 1: Single-select timeframe picker ────────
                    TextBlock
                        [ Text       = "Single-select — pick one timeframe",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    SegmentedButton
                        [ Items               = $Timeframes,
                          SelectedItem        = $SelectedTimeframe,
                          SelectionMode       = Single,
                          HorizontalAlignment = Left,
                          Margin              = (0,0,0,8) ]

                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Selected: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $SelectedTimeframe,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }

                    // ── Row 2: Multi-select format toggles ────────────
                    TextBlock
                        [ Text       = "Multi-select — pick one or more formats",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    SegmentedButton
                        [ Items               = $FormatChoices,
                          SelectionMode       = Multiple,
                          HorizontalAlignment = Left,
                          Margin              = (0,0,0,8) ]

                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = "Selected: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $SelectedFormatsLabel,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
