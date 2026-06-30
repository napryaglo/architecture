import ShapesVM from "./shapes-vm.mjs"

// shapes.mu — M3 Expressive shape library catalogue.
//
// Renders all 35 named shapes from the M3 Expressive shape system in a
// 5-column × 7-row grid (matches the M3 reference image layout). Each
// cell has the shape rendered in @Primary fill and a label below.

resources ShapesDemo {
    DataTemplate x:key="ShapesTemplate" [DataType = ShapesVM] {
        Border [ Background = @Surface ] {
            ScrollViewer {
                Border [ Padding = (24,24,24,24), Background = @Surface ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "M3 Expressive Shape Library",
                              FontSize   = 24,
                              FontWeight = Bold,
                              Foreground = @OnSurface,
                              Margin     = (0,0,0,8) ]
                        TextBlock
                            [ Text         = "35 named shapes from the M3 Expressive shape system — base + architectural + cookies + clovers + radial waves + puffies + glyphs + pixel art. Rows 1-2 are the round/rectangular base + diamond/pentagon/gem; rows 3-4 architectural + N-sided cookies; row 5 spans clovers into the radial-wave family; row 6 finishes the radial waves + puffies; row 7 the special glyphs + pixel art.",
                              FontSize     = 13,
                              TextWrapping = Wrap,
                              Foreground   = @OnSurfaceVariant,
                              Margin       = (0,0,0,24) ]

                        UniformGrid [ Rows = 7, Columns = 5 ] {
                            // ── Row 1: round / pill / square / slanted ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Ellipse [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Circle (Ellipse)",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Squircle [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Square (Squircle)",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Slanted [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Slanted",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Ellipse [ Width = 80, Height = 48, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Oval (Ellipse)",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Pill [ Width = 80, Height = 48, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Pill",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }

                            // ── Row 2: diamond / pentagon / gem / arch / semicircle ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Diamond [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Diamond",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Pentagon [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Pentagon",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Gem [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Gem",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Arch [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Arch",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Semicircle [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Semicircle",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }

                            // ── Row 3: triangle / arrow / fan / clamshell / 4-cookie ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Triangle
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 10 ]
                                    TextBlock
                                        [ Text                = "Triangle",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Arrow
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 10 ]
                                    TextBlock
                                        [ Text                = "Arrow",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Fan [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Fan",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Clamshell
                                        [ Width        = 80,
                                          Height       = 48,
                                          Fill         = @Primary,
                                          CornerRadius = 8 ]
                                    TextBlock
                                        [ Text                = "Clamshell",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    FourSidedCookie
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 10 ]
                                    TextBlock
                                        [ Text                = "4-Cookie",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }

                            // ── Row 4: 6/7/9/12-cookie / 4-leaf clover ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    SixSidedCookie
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 8 ]
                                    TextBlock
                                        [ Text                = "6-Cookie",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    SevenSidedCookie
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 8 ]
                                    TextBlock
                                        [ Text                = "7-Cookie",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    NineSidedCookie
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 6 ]
                                    TextBlock
                                        [ Text                = "9-Cookie",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    TwelveSidedCookie
                                        [ Width        = 64,
                                          Height       = 64,
                                          Fill         = @Primary,
                                          CornerRadius = 5 ]
                                    TextBlock
                                        [ Text                = "12-Cookie",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    FourLeafClover [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "4-Leaf Clover",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }

                            // ── Row 5: 8-leaf clover + 4 radial-wave placeholders ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    EightLeafClover [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "8-Leaf Clover",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Sunny [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Sunny",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    VerySunny [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "VerySunny",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Burst [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Burst",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    SoftBurst [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "SoftBurst",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }

                            // ── Row 6: Boom / SoftBoom / Flower + Puffy / PuffyDiamond ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Boom [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Boom",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    SoftBoom [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "SoftBoom",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Flower [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Flower",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Puffy [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Puffy",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    PuffyDiamond [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "PuffyDiamond",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }

                            // ── Row 7: Ghostish / Bun / Heart / PixelCircle / PixelTriangle ──
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Ghostish [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Ghost-ish",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Bun [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Bun",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    Heart [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "Heart",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    PixelCircle [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "PixelCircle",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                            Border [ Padding = (8,8,8,8) ] {
                                StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                                    PixelTriangle [ Width = 64, Height = 64, Fill = @Primary ]
                                    TextBlock
                                        [ Text                = "PixelTriangle",
                                          FontSize            = 10,
                                          Foreground          = @OnSurfaceVariant,
                                          Margin              = (0,8,0,0),
                                          HorizontalAlignment = Center ]
                                }
                            }
                        }

                        TextBlock
                            [ Text         = "All 35 shapes live — Circle / Oval delegate to Ellipse, Square delegates to Squircle. The remaining named shapes ship as parametric families (Cookie, Clover, RadialWave, Puffy, PixelArt) with named-stop aliases that just override metadata defaults.",
                              FontSize     = 11,
                              TextWrapping = Wrap,
                              Foreground   = @OnSurfaceVariant,
                              Margin       = (0,24,0,0) ]
                    }
                }
            }
        }
    }
}
