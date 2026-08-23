import BottomAppBarVM from "./bottom-app-bar-vm.mjs"

// bottom-app-bar.mu — M3 BottomAppBar showcase. A page body with a
// BottomAppBar docked to the bottom, exercising both slots:
//
//   * Actions (the markup default 'list' slot) — a row of Standard
//     IconButtons. Each invokes the VM's single $Tap command with its
//     own CommandParameter, so LastAction echoes the tap live.
//   * FloatingAction — a trailing FloatingActionButton set via the DP
//     (FloatingAction = FloatingActionButton { … }), the M3 bottom-bar
//     primary action pinned to the right edge.
//
// Theme swap — every brush (@SurfaceContainer, @OnSurfaceVariant, the
// FAB's @PrimaryContainer chrome) rides DynamicResource, so light ↔ dark
// re-tints live. The bar's own container colour + Level2 elevation come
// from the default Style.

resources BottomAppBarDemo {
    DataTemplate [DataType = BottomAppBarVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "BottomAppBar — M3's bottom action strip: a leading icon-button row plus a trailing FAB.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Bottom-docked action bar.
                BottomAppBar
                    [ DockPanel.Dock = Bottom,
                      FloatingAction = FloatingActionButton
                          [ Command          = $Tap,
                            CommandParameter = "Primary action",
                            Content          = Shape [ Geometry = @IconCheck, Width = 24, Height = 24, Fill = @OnPrimaryContainer ] ] ] {
                    IconButton [ Variant = Standard, Command = $Tap, CommandParameter = "Menu" ] {
                        Shape [ Geometry = @ChevronDown, Width = 20, Height = 20, Fill = @OnSurfaceVariant ]
                    }
                    IconButton [ Variant = Standard, Command = $Tap, CommandParameter = "Up" ] {
                        Shape [ Geometry = @ChevronUp, Width = 20, Height = 20, Fill = @OnSurfaceVariant ]
                    }
                    IconButton [ Variant = Standard, Command = $Tap, CommandParameter = "Next" ] {
                        Shape [ Geometry = @ChevronRight, Width = 20, Height = 20, Fill = @OnSurfaceVariant ]
                    }
                    IconButton [ Variant = Standard, Command = $Tap, CommandParameter = "Close" ] {
                        Shape [ Geometry = @IconClose, Width = 20, Height = 20, Fill = @OnSurfaceVariant ]
                    }
                }

                // Page body — fills the space above the bar; echoes the
                // last-tapped action so the command wiring is visible.
                Border [ Padding = (24,24,24,24) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "BottomAppBar — Actions row (Standard IconButtons) + trailing FAB",
                              FontWeight = Bold,
                              FontSize   = 14,
                              Foreground = @OnSurface,
                              Margin     = (0,0,0,12) ]
                        StackPanel [ Orientation = Horizontal ] {
                            TextBlock
                                [ Text       = "Last action: ",
                                  FontSize   = 13,
                                  VerticalAlignment = Center,
                                  Foreground = @OnSurfaceVariant ]
                            TextBlock
                                [ Text       = $LastAction,
                                  FontSize   = 13,
                                  FontWeight = Bold,
                                  VerticalAlignment = Center,
                                  Foreground = @OnSurface ]
                        }
                    }
                }
            }
        }
    }
}
