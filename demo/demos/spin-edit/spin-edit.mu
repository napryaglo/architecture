import SpinEditVM from "./spin-edit-vm.mjs"

// spin-edit.mu — SpinEdit (numeric up/down) showcase.
//
// Four fields demonstrating the value, formatting, range, and
// read-only knobs we ship:
//   * "Integer" — default integer mode (DecimalPlaces=0), unbounded.
//   * "Percent" — DecimalPlaces=2, range [0, 100], SmallChange=0.5.
//   * "Volume"  — bounded [0, 11] with LargeChange=2 (PageUp/Down step).
//   * "Locked"  — IsReadOnly=true; the field paints but ignores every
//                 button click + key.
//
// Interactions:
//   * Click ▴ / ▾ to step by SmallChange (the bound increment).
//   * Type a number, press Enter or click elsewhere to commit.
//   * ArrowUp / ArrowDown also step by SmallChange.
//   * PageUp / PageDown step by LargeChange.
//
// Packaged as a DataTemplate keyed off SpinEditVM.

resources SpinEditDemo {
    DataTemplate [DataType = SpinEditVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "SpinEdit demo — value, range, precision, read-only",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Four columns: each a labelled SpinEdit + a hint line.
                StackPanel [ Orientation = Horizontal ] {
                    // Integer (unbounded, default settings).
                    StackPanel [ Orientation = Vertical, Width = 200, Margin = (16,16,8,16) ] {
                        TextBlock
                            [ Text       = "Integer:",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,6) ]
                        SpinEdit [ Width = 140, Height = 32, Value = 10 ]
                        TextBlock
                            [ Text       = "Default — ±1 per ▴/▾, ±10 per Page.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // Percent: 2-decimal display, half-step.
                    StackPanel [ Orientation = Vertical, Width = 200, Margin = (8,16,8,16) ] {
                        TextBlock
                            [ Text       = "Percent (0.00–100.00):",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,6) ]
                        SpinEdit
                            [ Width         = 140,
                              Height        = 32,
                              Value         = 37.5,
                              Minimum       = 0,
                              Maximum       = 100,
                              DecimalPlaces = 2,
                              SmallChange   = 0.5,
                              LargeChange   = 10 ]
                        TextBlock
                            [ Text       = "Half-step increments; clamps at edges.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // Volume: 0..11 with custom LargeChange.
                    StackPanel [ Orientation = Vertical, Width = 200, Margin = (8,16,8,16) ] {
                        TextBlock
                            [ Text       = "Volume (0–11):",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,6) ]
                        SpinEdit
                            [ Width       = 140,
                              Height      = 32,
                              Value       = 7,
                              Minimum     = 0,
                              Maximum     = 11,
                              SmallChange = 1,
                              LargeChange = 2 ]
                        TextBlock
                            [ Text       = "PageUp / PageDown step by 2.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // Read-only.
                    StackPanel [ Orientation = Vertical, Width = 200, Margin = (8,16,16,16) ] {
                        TextBlock
                            [ Text       = "Locked:",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,6) ]
                        SpinEdit [ Width = 140, Height = 32, Value = 42, IsReadOnly = true ]
                        TextBlock
                            [ Text       = "Buttons + keys are inert; display only.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }
                }
            }
        }
    }
}
