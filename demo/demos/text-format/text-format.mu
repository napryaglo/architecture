import TextFormatVM from "./text-format-vm.mjs"

// text-format.mu — standalone demo for the character-format editors:
// FontFamilyPicker + FontSizePicker (editable combos), a font-colour
// ColorPicker, and Bold / Italic / Underline garniture toggles. Every
// editor two-way binds a pure-primitive VM DP; the sample paragraph
// binds Family / FontSize directly, and the bootstrap bridge maps the
// bool / hex primitives onto the paragraph's FontWeight / FontStyle /
// TextDecorations / Foreground (visual-engine types the VM can't hold).

resources TextFormatDemo {
    DataTemplate [DataType = TextFormatVM] {
        Border x:root [ Fill = @Surface ] {
            DockPanel {
                // ── Header ─────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Text format editors",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text       = "Font family, size, colour, and bold / italic / underline — each an editor bound to the sample paragraph below.",
                              FontSize   = 12,
                              Foreground = @OnPrimary,
                              Margin     = (0,4,0,0) ]
                    }
                }

                // ── Editor toolbar ─────────────────────────────────
                Border
                    [ DockPanel.Dock = Top,
                      Fill      = @SurfaceContainerLow,
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (0,0,0,1),
                      Padding         = (16,10,16,10) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        FontFamilyPicker [ Text = $Family, Width = 190 ]
                        FontSizePicker   [ Value = $FontSize, Width = 90, Margin = (8,0,0,0) ]

                        // Garniture toggles — each glyph previews the
                        // effect it applies (bold B, italic I, underlined U).
                        ToggleButton [ IsChecked = $Bold, Margin = (16,0,0,0) ] {
                            TextBlock [ Text = "B", FontWeight = Bold, FontSize = 15 ]
                        }
                        ToggleButton [ IsChecked = $Italic, Margin = (4,0,0,0) ] {
                            TextBlock [ Text = "I", FontStyle = Italic, FontSize = 15 ]
                        }
                        ToggleButton [ IsChecked = $Underline, Margin = (4,0,0,0) ] {
                            TextBlock [ Text = "U", TextDecorations = Underline, FontSize = 15 ]
                        }

                        ColorPicker [ ColorHex = $ColorHex, Margin = (16,0,0,0), VerticalAlignment = Center ]
                    }
                }

                // ── Live sample paragraph ──────────────────────────
                // Family / FontSize bind straight to the VM; the bridge
                // (text-format.mjs) writes FontWeight / FontStyle /
                // TextDecorations / Foreground from the bool + hex DPs.
                Border [ Padding = (28,24,28,24) ] {
                    TextBlock x:name="SamplePara"
                        [ Text         = $Sample,
                          FontFamily   = $Family,
                          FontSize     = $FontSize,
                          TextWrapping = Wrap,
                          VerticalAlignment = Top ]
                }
            }
        }
    }
}
