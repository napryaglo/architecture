import SliderVM from "./slider-vm.mjs"

// slider.mu — Slider (single-thumb range control) showcase.
//
// Three columns covering the dimensions we ship:
//   * Horizontal "Brightness" — default 0..1 range, default SmallChange.
//   * Horizontal "Volume (0–11)" — wider integer-ish range with a
//                                  larger SmallChange / LargeChange.
//   * Vertical "Mix"  — vertical orientation, Min at the bottom; arrow
//                       keys still go ±SmallChange with Up = higher.
//
// Interactions on every slider:
//   * Click + drag the thumb to pan.
//   * Click anywhere on the track to jump the thumb to that point and
//     keep dragging.
//   * Tab to focus; ArrowLeft / ArrowRight (or ArrowDown / ArrowUp)
//     nudge by SmallChange; PageUp / PageDown by LargeChange;
//     Home / End snap to Min / Max.
//
// Packaged as a DataTemplate keyed off SliderVM.

resources SliderDemo {
    DataTemplate [DataType = SliderVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ], BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Slider demo — single-thumb range, horizontal + vertical",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Horizontal ] {
                    // Horizontal "Brightness" — default 0..1 range.
                    StackPanel [ Orientation = Vertical, Width = 240, Margin = (16,24,8,16) ] {
                        TextBlock
                            [ Text       = "Brightness (0–1):",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,12) ]
                        Slider [ Width = 200, Value = 0.6 ]
                        TextBlock
                            [ Text       = "Default 0..1 range; SmallChange 0.01, LargeChange 0.1.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,12,0,0) ]
                    }

                    // Horizontal "Volume" — wider range, integer-ish steps.
                    StackPanel [ Orientation = Vertical, Width = 240, Margin = (8,24,8,16) ] {
                        TextBlock
                            [ Text       = "Volume (0–11):",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,12) ]
                        Slider
                            [ Width       = 200,
                              Minimum     = 0,
                              Maximum     = 11,
                              Value       = 7,
                              SmallChange = 1,
                              LargeChange = 2 ]
                        TextBlock
                            [ Text       = "Arrow ±1, Page ±2, Home / End snap to 0 / 11.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,12,0,0) ]
                    }

                    // Vertical "Mix" — vertical orientation, Min at bottom.
                    StackPanel [ Orientation = Vertical, Width = 240, Margin = (8,24,16,16) ] {
                        TextBlock
                            [ Text       = "Mix (vertical):",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,12) ]
                        Slider [ Orientation = Vertical, Height = 200, Value = 0.35 ]
                        TextBlock
                            [ Text       = "Up = higher; thumb sits at Min when at the bottom.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,12,0,0) ]
                    }
                }
            }
        }
    }
}
