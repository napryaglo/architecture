import TopAppBarVM from "./top-app-bar-vm.mjs"

// top-app-bar.mu — M3 TopAppBar showcase. Four stacked rows, one per
// variant (Small / CenterAligned / Medium / Large), each rendered
// against a Surface background so the Variant-specific chrome heights
// and typography are visible at a glance.
//
// What's exercised:
//   * Variant DP per row — Small / CenterAligned share the single-row
//     64dp anatomy with different title alignment; Medium / Large are
//     two-row layouts (112dp / 152dp) with HeadlineSmall / HeadlineMedium
//     title typography.
//   * NavigationIcon slot — IconButton Variant=Standard with a menu glyph.
//   * Actions slot — markup body lands in Actions via AddChild. Two
//     IconButton actions per row; clicks bind through VM RelayCommands.
//   * Title DP — single string drives PART_TitleText.Text on every variant.

resources TopAppBarDemo {
    DataTemplate x:key="TopAppBarTemplate" [DataType = TopAppBarVM] {
        Border
            [ Background      = @SurfaceContainerLow,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "TopAppBar — M3 screen header. Four variants vary title alignment and row count.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    // Small ───────────────────────────────────────────
                    TextBlock
                        [ Text       = "Small — single row, leading-aligned title.",
                          FontWeight = Bold,
                          FontSize   = 12,
                          Foreground = @OnSurfaceVariant,
                          Margin     = (0,0,0,8) ]
                    Border
                        [ Background      = @OutlineVariant,
                          BorderThickness = (0),
                          Margin          = (0,0,0,16) ] {
                        TopAppBar [ Variant = $SmallVariant, Title = "Inbox" ] {
                            IconButton [ Variant = Standard, Command = $SearchCommand ] {
                                TextBlock [ Text = "🔍", FontSize = 16 ]
                            }
                            IconButton [ Variant = Standard, Command = $MoreCommand ] {
                                TextBlock [ Text = "⋯", FontSize = 18 ]
                            }
                        }
                    }

                    // CenterAligned ───────────────────────────────────
                    TextBlock
                        [ Text       = "CenterAligned — single row, centered title.",
                          FontWeight = Bold,
                          FontSize   = 12,
                          Foreground = @OnSurfaceVariant,
                          Margin     = (0,0,0,8) ]
                    Border
                        [ Background      = @OutlineVariant,
                          BorderThickness = (0),
                          Margin          = (0,0,0,16) ] {
                        TopAppBar [ Variant = $CenterAlignedVariant, Title = "Settings" ] {
                            IconButton [ Variant = Standard, Command = $MoreCommand ] {
                                TextBlock [ Text = "⋯", FontSize = 18 ]
                            }
                        }
                    }

                    // Medium ──────────────────────────────────────────
                    TextBlock
                        [ Text       = "Medium — two rows, HeadlineSmall title (112dp tall).",
                          FontWeight = Bold,
                          FontSize   = 12,
                          Foreground = @OnSurfaceVariant,
                          Margin     = (0,0,0,8) ]
                    Border
                        [ Background      = @OutlineVariant,
                          BorderThickness = (0),
                          Margin          = (0,0,0,16) ] {
                        TopAppBar [ Variant = $MediumVariant, Title = "Workspace" ] {
                            IconButton [ Variant = Standard, Command = $SearchCommand ] {
                                TextBlock [ Text = "🔍", FontSize = 16 ]
                            }
                            IconButton [ Variant = Standard, Command = $MoreCommand ] {
                                TextBlock [ Text = "⋯", FontSize = 18 ]
                            }
                        }
                    }

                    // Large ───────────────────────────────────────────
                    TextBlock
                        [ Text       = "Large — two rows, HeadlineMedium title (152dp tall).",
                          FontWeight = Bold,
                          FontSize   = 12,
                          Foreground = @OnSurfaceVariant,
                          Margin     = (0,0,0,8) ]
                    Border
                        [ Background      = @OutlineVariant,
                          BorderThickness = (0),
                          Margin          = (0,0,0,16) ] {
                        TopAppBar [ Variant = $LargeVariant, Title = "Documents" ] {
                            IconButton [ Variant = Standard, Command = $SearchCommand ] {
                                TextBlock [ Text = "🔍", FontSize = 16 ]
                            }
                            IconButton [ Variant = Standard, Command = $MoreCommand ] {
                                TextBlock [ Text = "⋯", FontSize = 18 ]
                            }
                        }
                    }

                    // Click-count read-out
                    StackPanel [ Orientation = Horizontal, Margin = (0,8,0,0) ] {
                        TextBlock
                            [ Text       = "Clicks — Search: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $SearchClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  More: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $MoreClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
