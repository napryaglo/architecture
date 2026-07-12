import FabMenuVM from "./fab-menu-vm.mjs"

// fab-menu.mu — M3 FabMenu showcase. The Items collection (a list of
// mini-FAB Visuals) and the Items themselves are constructed in the
// demo's .mjs entry point (per the project's no-Visual-in-VM rule).
// The .mu binds FabMenu.Items = $Items and IsOpen = $IsOpen so the
// VM mirrors the open/closed state for the read-out.
//
// Motion: the FAB icon swaps "+" ↔ "×" snapshotted on IsOpen change
// (Visual lacks a RenderTransform DP so we don't rotate in v1). Items
// stagger-reveal via a Storyboard owned by FabMenu — Opacity 0 → 1
// with `i × StaggerMs` BeginTime offsets per item, bottom-first so
// the menu reads as growing toward the FAB.

resources FabMenuDemo {
    DataTemplate [DataType = FabMenuVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "FabMenu — M3 2024 FAB that reveals secondary actions on tap. Stagger-fade reveal; tap the FAB again or click the scrim to dismiss.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    TextBlock
                        [ Text       = "Tap the FAB",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    FabMenu
                        [ Items               = $Items,
                          IsOpen              = $IsOpen,
                          StaggerMs           = 60,
                          DurationMs          = 200,
                          HorizontalAlignment = Left,
                          Margin              = (0,0,0,24) ]

                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,4) ] {
                        TextBlock
                            [ Text       = "IsOpen: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $IsOpen,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }

                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = "Clicks — Create: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $CreateClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Upload: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $UploadClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Share: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $ShareClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
