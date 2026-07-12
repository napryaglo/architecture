import BottomSheetVM from "./bottom-sheet-vm.mjs"

// bottom-sheet.mu — M3 BottomSheet showcase. Exercises the peek ↔
// expanded posture. BottomSheet ships no posture DP, so the sheet's
// Height binds to the VM's SheetHeight ($SheetHeight); TogglePosture
// flips it between the peek height (96) and the expanded height (320),
// so the sheet visibly rises and settles.
//
// What's exercised:
//   * BottomSheet.Content — the sheet body (inherited from
//     ContentControl): a grab handle, a title, and posture-aware text.
//   * Peek ↔ expanded posture driven through $SheetHeight, with the
//     current posture echoed via $PostureLabel.
//   * The sheet is bottom-anchored (docked Bottom) over a page body, the
//     canonical M3 placement.
//   * Theme swap — @Surface / @OnSurface / @OutlineVariant ride
//     DynamicResource; the sheet template's own @Elevation1 + rounded
//     top corners come from the default Style.

resources BottomSheetDemo {
    DataTemplate [DataType = BottomSheetVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "BottomSheet — M3's bottom-anchored surface. Toggle peek vs expanded posture.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Bottom-anchored sheet — Height binds to the VM posture.
                BottomSheet
                    [ DockPanel.Dock = Bottom,
                      Height         = $SheetHeight ] {
                    StackPanel [ Orientation = Vertical ] {
                        // Grab handle — M3's drag affordance.
                        Border
                            [ Width               = 32,
                              Height              = 4,
                              Background          = @OutlineVariant,
                              CornerRadius        = @ShapeFull,
                              BorderThickness     = (0),
                              HorizontalAlignment = Center,
                              Margin              = (0,0,0,12) ]
                        TextBlock
                            [ Text       = "Share to…",
                              FontWeight = Bold,
                              FontSize   = 16,
                              Foreground = @OnSurface,
                              Margin     = (0,0,0,8) ]
                        TextBlock
                            [ Text         = "Peek shows just the header; expand to reveal the full list of destinations. Toggle the posture from the page body.",
                              TextWrapping = Wrap,
                              FontSize     = 13,
                              Foreground   = @OnSurfaceVariant ]
                    }
                }

                // Page body (fills the remaining slot).
                Border [ Background = @Surface, Padding = (24) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "The sheet below is bottom-anchored. Toggling posture animates its Height between a peek and an expanded stop.",
                              TextWrapping = Wrap,
                              FontSize     = 13,
                              Foreground   = @OnSurface,
                              Margin       = (0,0,0,16) ]

                        StackPanel [ Orientation = Horizontal ] {
                            Button
                                [ Variant             = Filled,
                                  Command             = $TogglePosture,
                                  HorizontalAlignment = Left,
                                  Margin              = (0,0,16,0),
                                  Content             = TextBlock [ Text = "Toggle posture" ] ]
                            TextBlock
                                [ Text              = "Posture: ",
                                  FontSize          = 12,
                                  VerticalAlignment = Center,
                                  Foreground        = @OnSurfaceVariant ]
                            TextBlock
                                [ Text              = $PostureLabel,
                                  FontSize          = 12,
                                  FontWeight        = Bold,
                                  VerticalAlignment = Center,
                                  Foreground        = @OnSurface ]
                        }
                    }
                }
            }
        }
    }
}
