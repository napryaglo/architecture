import BadgeVM from "./badge-vm.mjs"

// badge.mu — M3 Badge showcase. Exercises the headline Variant DP across
// its two BadgeVariant values (Dot vs Numeric) plus the Count DP.
//
// What's exercised:
//   * Badge Variant = Dot — 6dp @Error circle, no label.
//   * Badge Variant = Numeric — @Error pill whose label rides Count via
//     a $Count binding, so the Increment / Reset commands visibly grow
//     and clear the number live.
//   * Badge is standalone (no self-anchoring), so each is dropped onto a
//     Canvas over an icon-ish host to show the "flag on a target" use.
//   * Theme swap — @Error / @OnError / @Surface all ride DynamicResource.

resources BadgeDemo {
    DataTemplate x:key="BadgeTemplate" [DataType = BadgeVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Badge — M3's small status flag. Variant picks Dot (no count) vs Numeric (Count-driven pill).",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    TextBlock
                        [ Text       = "Badge — Variant: Dot / Numeric",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,16) ]

                    // Two badges anchored top-right of a placeholder tile,
                    // the canonical M3 "flag on an icon" placement.
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,24) ] {
                        // Dot variant
                        StackPanel [ Orientation = Vertical, Margin = (0,0,48,0) ] {
                            Canvas [ Width = 48, Height = 48, Margin = (0,0,0,8) ] {
                                Border
                                    [ Width           = 40,
                                      Height          = 40,
                                      Background      = @SurfaceContainerHighest,
                                      CornerRadius    = @ShapeMedium,
                                      BorderThickness = (0),
                                      Canvas.Left     = 0,
                                      Canvas.Top      = 8 ]
                                Badge [ Variant = Dot, Canvas.Left = 36, Canvas.Top = 4 ]
                            }
                            TextBlock [ Text = "Dot", FontSize = 12, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                        }

                        // Numeric variant — Count-bound
                        StackPanel [ Orientation = Vertical ] {
                            Canvas [ Width = 48, Height = 48, Margin = (0,0,0,8) ] {
                                Border
                                    [ Width           = 40,
                                      Height          = 40,
                                      Background      = @SurfaceContainerHighest,
                                      CornerRadius    = @ShapeMedium,
                                      BorderThickness = (0),
                                      Canvas.Left     = 0,
                                      Canvas.Top      = 8 ]
                                Badge [ Variant = Numeric, Count = $Count, Canvas.Left = 30, Canvas.Top = 0 ]
                            }
                            TextBlock [ Text = "Numeric", FontSize = 12, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                        }
                    }

                    // Count controls — drive the Numeric badge's label live.
                    StackPanel [ Orientation = Horizontal ] {
                        Button
                            [ Variant             = Filled,
                              Command             = $Increment,
                              HorizontalAlignment = Left,
                              Margin              = (0,0,12,0),
                              Content             = TextBlock [ Text = "Increment" ] ]
                        Button
                            [ Variant             = Text,
                              Command             = $Reset,
                              HorizontalAlignment = Left,
                              Content             = TextBlock [ Text = "Reset" ] ]
                        TextBlock
                            [ Text       = "  Count: ",
                              FontSize   = 12,
                              VerticalAlignment = Center,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $Count,
                              FontSize   = 12,
                              FontWeight = Bold,
                              VerticalAlignment = Center,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
