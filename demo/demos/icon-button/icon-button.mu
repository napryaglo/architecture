import IconButtonVM from "./icon-button-vm.mjs"

// icon-button.mu — M3 IconButton + IconButtonToggle showcase. Two rows
// of four chromes each, plus a live click tally + checked-state preview.
//
// What's exercised:
//   * IconButton with each of the four Variant values (Filled / Tonal /
//     Outlined / Standard) — 40×40 chrome, glyph cascades through
//     TextBlock.Foreground.
//   * IconButtonToggle with the same four variants — IsChecked flips
//     Fill per variant; the Style-level multi-condition triggers
//     flip TextBlock.Foreground.
//   * Theme swap (run alongside ThemeSelector) — every brush rides
//     through DynamicResource so light ↔ dark re-tints live.
//   * Command DP wiring — each non-toggle button increments its
//     per-variant click counter through a RelayCommand on the VM.
//   * IsChecked TwoWay binding — clicking a toggle flips the bound
//     VM DP; the chrome reflects the new state via the IsChecked
//     trigger.

resources IconButtonDemo {
    // Icon geometries baked from the Material Symbols Outlined font at
    // build time (the `glyphs` keyword → one PathGeometry resource per
    // entry, addressed by M3 glyph name). The buttons below paint these
    // through Shape[Geometry=@name], so the glyph is true vector geometry
    // scaled to fit its slot — no font line-box centring quirks. The
    // Shapes set no Fill: a Shape with Fill AND Stroke unset paints with
    // the inherited TextBlock.Foreground, so each glyph picks up the
    // chrome's foreground ink the template sets per variant and tracks the
    // IconButtonToggle checked-state ink flip live — no explicit binding.
    glyphs "../../assets/material-symbols-outlined.ttf" {
        check
        star
        north_east
        more_horiz
        favorite
        notifications
        dark_mode
    }

    DataTemplate [DataType = IconButtonVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "IconButton — M3's compact square button. Four variants drive the chrome via Button.Variant.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    // ── Row 1: IconButton (non-toggle) ────────────────
                    TextBlock
                        [ Text       = "IconButton — Variant: Filled / Tonal / Outlined / Standard",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,8) ] {
                        IconButton [ Variant = Filled, Command = $ClickFilledCommand ] {
                            Shape [ Geometry = @check, Width = 20, Height = 20 ]
                        }
                        IconButton [ Variant = Tonal, Command = $ClickTonalCommand ] {
                            Shape [ Geometry = @star, Width = 20, Height = 20 ]
                        }
                        IconButton [ Variant = Outlined, Command = $ClickOutlinedCommand ] {
                            Shape [ Geometry = @north_east, Width = 20, Height = 20 ]
                        }
                        IconButton [ Variant = Standard, Command = $ClickStandardCommand ] {
                            Shape [ Geometry = @more_horiz, Width = 20, Height = 20 ]
                        }
                    }

                    // Click-count read-out
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Clicks — Filled: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $FilledClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Tonal: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $TonalClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Outlined: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $OutlinedClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Standard: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $StandardClicks,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }

                    // ── Row 2: IconButtonToggle ───────────────────────
                    TextBlock
                        [ Text       = "IconButtonToggle — same Variant set; IsChecked flips Fill + glyph ink.",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,8) ] {
                        IconButtonToggle [ Variant = Filled, IsChecked = $FilledChecked ] {
                            Shape [ Geometry = @favorite, Width = 20, Height = 20 ]
                        }
                        IconButtonToggle [ Variant = Tonal, IsChecked = $TonalChecked ] {
                            Shape [ Geometry = @star, Width = 20, Height = 20 ]
                        }
                        IconButtonToggle [ Variant = Outlined, IsChecked = $OutlinedChecked ] {
                            Shape [ Geometry = @notifications, Width = 20, Height = 20 ]
                        }
                        IconButtonToggle [ Variant = Standard, IsChecked = $StandardChecked ] {
                            Shape [ Geometry = @dark_mode, Width = 20, Height = 20 ]
                        }
                    }

                    // Toggle-state read-out
                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = "Checked — Filled: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $FilledChecked,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Tonal: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $TonalChecked,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Outlined: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $OutlinedChecked,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Standard: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $StandardChecked,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
