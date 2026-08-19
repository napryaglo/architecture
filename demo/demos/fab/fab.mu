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
    DataTemplate [DataType = FabVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ], BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "FloatingActionButton — M3's primary screen action. Size drives chrome dimensions; Extended slots an icon + label.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    // ── Row 1: Icon-only Sizes (Small / Default / Large) ─
                    TextBlock
                        [ Text       = "Icon-only — Size: Small (40dp) / Default (56dp) / Large (96dp)",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    // Material Symbols Outlined ligatures — each Text value
                    // (`add`, `edit`, `star`) is the M3 icon name; the font's
                    // `liga` feature substitutes the glyph at render. M3 FAB
                    // icon-size spec: 24dp for Small / Default / Extended,
                    // 36dp for Large. Using the real icon font means the
                    // glyph sits centered in its font line box, so the
                    // FAB chrome's centering math (slot vs. line box vs.
                    // visible glyph) lines up — system-ui Unicode symbols
                    // like "+" / "✎" / "★" carry diacritic-room ascent that
                    // pushes the visible glyph below the slot's centre.
                    StackPanel
                        [ Orientation       = Horizontal,
                          VerticalAlignment = Center,
                          Margin            = (0,0,0,8) ] {
                        FloatingActionButton
                            [ Size    = Small,
                              Command = $ClickSmallCommand,
                              Margin  = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "add",
                                  FontFamily = "Material Symbols Outlined",
                                  FontSize   = 24 ]
                        }
                        FloatingActionButton
                            [ Size    = Default,
                              Command = $ClickDefaultCommand,
                              Margin  = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "edit",
                                  FontFamily = "Material Symbols Outlined",
                                  FontSize   = 24 ]
                        }
                        FloatingActionButton [ Size = Large, Command = $ClickLargeCommand ] {
                            TextBlock
                                [ Text       = "star",
                                  FontFamily = "Material Symbols Outlined",
                                  FontSize   = 36 ]
                        }
                    }

                    // Click-count read-out
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Clicks — Small: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $SmallClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Default: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $DefaultClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Large: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $LargeClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }

                    // ── Row 2: Extended FABs (icon + label slot) ──────
                    TextBlock
                        [ Text       = "Extended — 56dp tall, content-driven width. Slot accepts icon + label.",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    // Each Extended FAB content is icon + label inside a
                    // Horizontal StackPanel. The icon TextBlock is wrapped
                    // in a Border pinned to 24×24 dp (M3 icon spec) so the
                    // font's line box doesn't push the glyph off-centre on
                    // the icon side. Same trick the icon-only FAB templates
                    // apply on their ContentPresenter slot, just hoisted to
                    // the use site because Extended's content slot isn't
                    // the ContentPresenter directly.
                    StackPanel
                        [ Orientation       = Horizontal,
                          VerticalAlignment = Center,
                          Margin            = (0,0,0,8) ] {
                        FloatingActionButton
                            [ Size    = Extended,
                              Command = $ClickExtendedCommand,
                              Margin  = (0,0,24,0) ] {
                            StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
                                // Icon Border pins to the M3 24×24 icon box;
                                // the icon TextBlock inside MUST stay at default
                                // Stretch alignment so Visual.Arrange forces
                                // RenderSize=24×24 (matching the slot) rather
                                // than the font's line box (~28 for Material
                                // Symbols at 24px, which would overflow the
                                // Border and push the glyph below centre).
                                // Same pattern as the NavigationItem icon slot
                                // at [framework.resources.mu:1140].
                                Border [ Width = 24, Height = 24, Margin = (0,0,12,0) ] {
                                    TextBlock
                                        [ Text       = "edit",
                                          FontFamily = "Material Symbols Outlined",
                                          FontSize   = 24 ]
                                }
                                // Label centred vertically against the 24-tall
                                // icon Border. HorizontalAlignment is a no-op
                                // here — the parent Horizontal StackPanel
                                // does its own X positioning.
                                TextBlock [ Text = "Edit", VerticalAlignment = Center ]
                            }
                        }
                        FloatingActionButton [ Size = Extended, Command = $ClickComposeCommand ] {
                            StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
                                Border [ Width = 24, Height = 24, Margin = (0,0,12,0) ] {
                                    TextBlock
                                        [ Text       = "edit_note",
                                          FontFamily = "Material Symbols Outlined",
                                          FontSize   = 24 ]
                                }
                                TextBlock [ Text = "Compose", VerticalAlignment = Center ]
                            }
                        }
                    }

                    // Click-count read-out
                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = "Clicks — Edit: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $ExtendedClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Compose: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $ComposeClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
