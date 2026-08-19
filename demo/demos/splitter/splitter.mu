import SplitterVM from "./splitter-vm.mjs"

// splitter.mu — standalone Splitter showcase.
//
// Two shapes:
//   * VERTICAL splitter in a horizontal StackPanel — drag horizontally
//     resizes the previous sibling's Width.
//   * HORIZONTAL splitter in a DockPanel — drag vertically resizes the
//     previous sibling's Height.
//
// GridSplitter (the WPF-parity sibling control for Grid cells) ships
// alongside but isn't shown here. The `ColumnDefinitions { … }`
// collection-child markup that GridSplitter needs is now supported
// (added during Phase 5 deviation closing — see commit history); a
// dedicated GridSplitter demo can land alongside any future Grid
// showcase. GridSplitter itself is fully covered by the
// grid-splitter.test.ts suite.

resources SplitterDemo {
    DataTemplate [DataType = SplitterVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ], BorderThickness = (1) ] {
            DockPanel {
                // Header strip.
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Splitter demo — standalone draggable bar",
                              FontSize   = 15,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = "Drag the gray bars to resize. ArrowLeft / ArrowRight (or Up / Down) nudge by 10px when focused.",
                              FontSize   = 11,
                              Foreground = @Outline,
                              Margin     = (0,4,0,0) ]
                    }
                }

                StackPanel [ Orientation = Vertical, Margin = (16) ] {
                    // ── VERTICAL splitter — horizontal-axis resize ────
                    TextBlock
                        [ Text       = "Vertical Splitter — horizontal StackPanel sibling resize",
                          FontSize   = 12,
                          FontWeight = Bold,
                          Margin     = (0,8,0,8) ]
                    Border [ Height = 140, Stroke = Pen [ Brush = @Outline ], BorderThickness = (1) ] {
                        StackPanel [ Orientation = Horizontal ] {
                            Border [ Width = 200, Height = 138, Fill = #dbeafe ] {
                                TextBlock
                                    [ Text                = "Width=200",
                                      FontSize            = 14,
                                      FontWeight          = Bold,
                                      HorizontalAlignment = Center,
                                      VerticalAlignment   = Center,
                                      Foreground          = @PrimaryContainer ]
                            }
                            Splitter [ Width = 8, Height = 138 ]
                            Border [ Width = 300, Height = 138, Fill = #e0f2fe ] {
                                TextBlock
                                    [ Text                = "Width=300 — drag the gray bar to resize the LEFT pane",
                                      FontSize            = 13,
                                      HorizontalAlignment = Center,
                                      VerticalAlignment   = Center,
                                      Foreground          = #075985,
                                      TextWrapping        = Wrap ]
                            }
                        }
                    }

                    // ── HORIZONTAL splitter — vertical-axis resize ────
                    TextBlock
                        [ Text       = "Horizontal Splitter — DockPanel top-sibling resize",
                          FontSize   = 12,
                          FontWeight = Bold,
                          Margin     = (0,24,0,8) ]
                    Border [ Height = 260, Stroke = Pen [ Brush = @Outline ], BorderThickness = (1) ] {
                        DockPanel {
                            Border [ DockPanel.Dock = Top, Height = 80, Fill = #dcfce7 ] {
                                TextBlock
                                    [ Text                = "Height=80",
                                      FontSize            = 14,
                                      FontWeight          = Bold,
                                      HorizontalAlignment = Center,
                                      VerticalAlignment   = Center,
                                      Foreground          = #166534 ]
                            }
                            Splitter [ DockPanel.Dock = Top, Orientation = Horizontal, Height = 8 ]
                            Border [ Fill = #bbf7d0 ] {
                                TextBlock
                                    [ Text                = "Drag the gray bar to resize the TOP pane.",
                                      FontSize            = 13,
                                      HorizontalAlignment = Center,
                                      VerticalAlignment   = Center,
                                      Foreground          = #14532d,
                                      TextWrapping        = Wrap ]
                            }
                        }
                    }
                }
            }
        }
    }
}
