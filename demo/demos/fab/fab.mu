import FabVM from "./fab-vm.mjs"

// fab.mu — M3 FloatingActionButton showcase. Two rows: the 3 icon-only
// sizes (Small / Default / Large) side by side, then a row with two
// Extended FABs (different label content) so the icon+label slotting
// is visible end-to-end.
//
// What's exercised:
//   * FloatingActionButton with each Size value — chrome size +
//     CornerRadius pick from the Style trigger chain.
//   * Default ElevationLevel3 → ElevationLevel4 swap on hover (visible
//     in browser; not asserted in unit tests).
//   * Theme swap (alongside ThemeSelector) — every brush rides through
//     DynamicResource so light ↔ dark re-tints live.
//   * Command DP wiring — each FAB increments a per-Size click counter
//     through a RelayCommand on the VM.
//   * Extended FAB content slot — accepts a StackPanel with an icon
//     glyph + label TextBlock; the template paints the label through
//     the inherited TextBlock.FontFamily / FontWeight / FontSize.

resources FabDemo {

    DataTemplate x:key="FabTemplate" [DataType=FabVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="FloatingActionButton — M3's primary screen action. Size drives chrome dimensions; Extended slots an icon + label.",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                StackPanel[Orientation=Vertical, Margin=(24,24,24,24)]{

                    // ── Row 1: Icon-only Sizes (Small / Default / Large) ─
                    TextBlock[Text="Icon-only — Size: Small (40dp) / Default (56dp) / Large (96dp)",
                              FontWeight=Bold, FontSize=14,
                              Foreground=@OnSurface, Margin=(0,0,0,12)]

                    StackPanel[Orientation=Horizontal, VerticalAlignment=Center, Margin=(0,0,0,8)]{
                        FloatingActionButton[Size=Small,   Command=$ClickSmallCommand,   Margin=(0,0,24,0)]{
                            TextBlock[Text="+", FontSize=20]
                        }
                        FloatingActionButton[Size=Default, Command=$ClickDefaultCommand, Margin=(0,0,24,0)]{
                            TextBlock[Text="✎", FontSize=22]
                        }
                        FloatingActionButton[Size=Large,   Command=$ClickLargeCommand]{
                            TextBlock[Text="★", FontSize=34]
                        }
                    }

                    // Click-count read-out
                    StackPanel[Orientation=Horizontal, Margin=(0,0,0,24)]{
                        TextBlock[Text="Clicks — Small: ", FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$SmallClicks,        FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Default: ",       FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$DefaultClicks,      FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Large: ",         FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$LargeClicks,        FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                    }

                    // ── Row 2: Extended FABs (icon + label slot) ──────
                    TextBlock[Text="Extended — 56dp tall, content-driven width. Slot accepts icon + label.",
                              FontWeight=Bold, FontSize=14,
                              Foreground=@OnSurface, Margin=(0,0,0,12)]

                    StackPanel[Orientation=Horizontal, VerticalAlignment=Center, Margin=(0,0,0,8)]{
                        FloatingActionButton[Size=Extended, Command=$ClickExtendedCommand, Margin=(0,0,24,0)]{
                            StackPanel[Orientation=Horizontal, VerticalAlignment=Center]{
                                TextBlock[Text="✎",      FontSize=18, Margin=(0,0,12,0)]
                                TextBlock[Text="Edit"]
                            }
                        }
                        FloatingActionButton[Size=Extended, Command=$ClickComposeCommand]{
                            StackPanel[Orientation=Horizontal, VerticalAlignment=Center]{
                                TextBlock[Text="✉",      FontSize=18, Margin=(0,0,12,0)]
                                TextBlock[Text="Compose"]
                            }
                        }
                    }

                    // Click-count read-out
                    StackPanel[Orientation=Horizontal]{
                        TextBlock[Text="Clicks — Edit: ",  FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$ExtendedClicks,    FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Compose: ",      FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$ComposeClicks,     FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                    }
                }
            }
        }
    }
}
