// Mandatory class-identity import so the [DataType=TextOnPathVM]
// match resolves to a real Function reference (not a string lookup).
import TextOnPathVM from "./text-on-path-vm.mjs"

// text-on-path.mu — demo for the §19-deferred #4 text-on-path layout.
//
// Top strip is the controls (Text input + Path picker + Font-size
// slider + Show toggles). The middle is a Canvas whose Width/Height
// match the coordinate frame the paths catalog targets (700 × 440).
// The bootstrap behaviour FindName's the canvas and inserts two
// GeometryView visuals into it:
//   * pathView      — strokes the underlying curve.
//   * glyphView     — fills the text-on-path output.
// Re-evaluation happens via VM-property listeners installed by the
// behaviour at view-mount time.

resources TextOnPathDemo {
    // Demo font declared in markup (resource management is mural-only).
    // The runtime FontManager fetches this once — loading it into every
    // target's measurer and embedding it for rendering. The bootstrap
    // pulls the SAME buffer back from the FontManager to feed its own
    // opentype FontMetricsMeasurer for glyph-outline extraction (the
    // textOnPath pipeline needs vector outlines, which the target's
    // Canvas measurer can't provide). An absolute URL is registered
    // verbatim; `from "..."` accepts any path or URL.
    fonts {
        Roboto from "https://cdn.jsdelivr.net/gh/opentypejs/opentype.js@master/test/fonts/Roboto-Black.ttf"
    }

    DataTemplate [DataType = TextOnPathVM] {
        Border x:root [ Fill = @Surface ] {
            DockPanel {
                // ── Header ────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Text on a path",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = $Status,
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
                      Text           = "Each path is flattened to a polyline, then arclength-sampled so every glyph lands at the right tangent. The picker switches the underlying PathGeometry; the text input updates the rendered run; the slider scales the glyph outlines." ]

                // ── Controls strip ────────────────────────────────
                Border
                    [ DockPanel.Dock  = Top,
                      Padding         = (20,12,20,12),
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (0,0,0,1) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "Text",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            TextBox [ Width = 320, Text = $Text ]
                        }
                        StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "Path",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            ComboBox
                                [ Width             = 220,
                                  Items             = $Paths,
                                  SelectedItem      = $SelectedPathOption,
                                  DisplayMemberPath = "Label" ]
                        }
                        StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "Font size",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            Slider
                                [ Width       = 180,
                                  Minimum     = 10,
                                  Maximum     = 72,
                                  Value       = $FontSize,
                                  SmallChange = 1,
                                  LargeChange = 4 ]
                        }
                        StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "Side offset",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            Slider
                                [ Width       = 180,
                                  Minimum     = -50,
                                  Maximum     = 50,
                                  Value       = $SideOffset,
                                  SmallChange = 1,
                                  LargeChange = 5 ]
                        }
                        StackPanel [ Orientation = Vertical, Margin = (0,0,24,0) ] {
                            TextBlock
                                [ Text       = "Show",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            StackPanel [ Orientation = Horizontal ] {
                                Button [ Margin = (0,0,8,0), Command = $TogglePathCommand ] {
                                    TextBlock [ Text = "Path" ]
                                }
                                Button [ Command = $ToggleGlyphsCommand ] {
                                    TextBlock [ Text = "Glyphs" ]
                                }
                            }
                        }
                        StackPanel [ Orientation = Vertical, Margin = (0,0,16,0) ] {
                            TextBlock
                                [ Text       = "Path colour",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            ColorPicker [ ColorHex = $PathColorHex ]
                        }
                        StackPanel [ Orientation = Vertical ] {
                            TextBlock
                                [ Text       = "Glyph colour",
                                  FontSize   = 11,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface,
                                  Margin     = (0,0,0,4) ]
                            ColorPicker [ ColorHex = $GlyphColorHex ]
                        }
                    }
                }

                // ── Canvas ────────────────────────────────────────
                Border [ Fill = @SurfaceContainerLow, Padding = (20,20,20,20) ] {
                    Border
                        [ Fill      = @Surface,
                          BorderBrush     = @OutlineVariant,
                          BorderThickness = (1),
                          Padding         = (0) ] {
                        Canvas x:name="surface" [ Width = 700, Height = 440 ]
                    }
                }
            }
        }
    }
}
