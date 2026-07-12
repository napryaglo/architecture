import ColorPickerVM from "./color-picker-vm.mjs"

// color-picker.mu — standalone demo for the Office-style picker.
//
// Four rows, each pairing a ColorPicker with a live preview swatch that
// mirrors the hex value. Behaviour-free: the previews are plain Borders
// whose Background lands via a SolidColorBrush built from the VM hex in
// the bootstrap (so this template stays pure markup).

resources ColorPickerDemo {
    // A shared, predefined ColorScheme authored in markup (resource
    // management is mural-only). The Overlay picker's Theme grid is built
    // from these brand colours via [ColorScheme=@BrandColors]; any number
    // of pickers can reference the one resource.
    ColorScheme x:key="BrandColors"
        [ Name   = "Brand",
          Colors = [#0F172A, #2563EB, #7C3AED, #DB2777, #059669, #EA580C] ]

    DataTemplate [DataType = ColorPickerVM] {
        Border x:root [ Background = @Surface ] {
            DockPanel {
                // ── Header ────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Office-style color picker",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = "Theme colors + tints, standard colors, recents, and a More Colors… dialog.",
                              FontSize   = 12,
                              Foreground = @OnPrimary,
                              Margin     = (0,4,0,0) ]
                    }
                }

                // ── Description ───────────────────────────────────
                TextBlock
                    [ DockPanel.Dock = Bottom,
                      Margin         = (20,8,20,16),
                      FontSize       = 11,
                      Foreground     = @OnSurfaceVariant,
                      TextWrapping   = Wrap,
                      Text           = "Each picker drops down the Office menu: a No-Color entry, a Colors: button opening the 21-scheme gallery (Office, Blue Warm, Median, Paper, …), a Theme-Colors grid (base row + lighter/darker tint-shade rows built from the active ColorScheme), a fixed Standard-Colors row, a session Recent-Colors row, and More Colors… which opens the 2D hue/saturation box + brightness rail + R/G/B/A sliders + hex (with OK / Cancel). Each picker feeds a preview swatch via SolidColorBrush(Color.FromHex(...))." ]

                // ── Body ──────────────────────────────────────────
                Border [ Background = @SurfaceContainerLow, Padding = (20,20,20,20) ] {
                    StackPanel [ Orientation = Vertical ] {
                        StackPanel [ Orientation = Horizontal, Margin = (0,0,0,16) ] {
                            StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                                TextBlock
                                    [ Text       = "Surface",
                                      FontSize   = 11,
                                      FontWeight = Bold,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,4) ]
                                ColorPicker [ ColorHex = $SurfaceHex ]
                            }
                            Border x:name="SurfacePreview"
                                [ Width             = 80,
                                  Height            = 40,
                                  CornerRadius      = 4,
                                  VerticalAlignment = Bottom,
                                  BorderBrush       = @OutlineVariant,
                                  BorderThickness   = (1) ]
                        }
                        StackPanel [ Orientation = Horizontal, Margin = (0,0,0,16) ] {
                            StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                                TextBlock
                                    [ Text       = "Accent",
                                      FontSize   = 11,
                                      FontWeight = Bold,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,4) ]
                                ColorPicker [ ColorHex = $AccentHex ]
                            }
                            Border x:name="AccentPreview"
                                [ Width             = 80,
                                  Height            = 40,
                                  CornerRadius      = 4,
                                  VerticalAlignment = Bottom,
                                  BorderBrush       = @OutlineVariant,
                                  BorderThickness   = (1) ]
                        }
                        StackPanel [ Orientation = Horizontal, Margin = (0,0,0,16) ] {
                            StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                                TextBlock
                                    [ Text       = "Ink",
                                      FontSize   = 11,
                                      FontWeight = Bold,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,4) ]
                                ColorPicker [ ColorHex = $InkHex ]
                            }
                            Border x:name="InkPreview"
                                [ Width             = 80,
                                  Height            = 40,
                                  CornerRadius      = 4,
                                  VerticalAlignment = Bottom,
                                  BorderBrush       = @OutlineVariant,
                                  BorderThickness   = (1) ]
                        }
                        StackPanel [ Orientation = Horizontal ] {
                            StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                                TextBlock
                                    [ Text       = "Overlay (custom ColorScheme=@BrandColors)",
                                      FontSize   = 11,
                                      FontWeight = Bold,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,4) ]
                                ColorPicker [ ColorHex = $OverlayHex, ColorScheme = @BrandColors ]
                            }
                            Border x:name="OverlayPreview"
                                [ Width             = 80,
                                  Height            = 40,
                                  CornerRadius      = 4,
                                  VerticalAlignment = Bottom,
                                  BorderBrush       = @OutlineVariant,
                                  BorderThickness   = (1) ]
                        }
                    }
                }
            }
        }
    }
}
