import ColorPickerVM from "./color-picker-vm.mjs"

// color-picker.mu — standalone demo for the ComboBox-style picker.
//
// Three rows, each pairing a ColorPicker with a live preview swatch
// that mirrors the hex value. Behaviour-free: the previews are plain
// Borders whose Background lands via a SolidColorBrush built from the
// VM hex in the bootstrap (so this template stays pure markup).

resources ColorPickerDemo {

    DataTemplate x:key="ColorPickerTemplate" [DataType=ColorPickerVM] {
        Border x:root [Background=@Surface] {
            DockPanel {
                // ── Header ────────────────────────────────────────
                Border [DockPanel.Dock=Top, Background=@Primary, Padding=(20,14,20,14)] {
                    StackPanel [Orientation=Vertical] {
                        TextBlock [Text="ComboBox-style color picker",
                                   FontSize=18, FontWeight=Bold,
                                   Foreground=@OnPrimary]
                        TextBlock [Text="Material 3 palette + HSV sliders + hex round-trip.",
                                   FontSize=12, Foreground=@OnPrimary,
                                   Margin=(0,4,0,0)]
                    }
                }

                // ── Description ───────────────────────────────────
                TextBlock [DockPanel.Dock=Bottom, Margin=(20,8,20,16),
                          FontSize=11, Foreground=@OnSurfaceVariant,
                          TextWrapping=Wrap,
                          Text="Three HSV pickers above, one RGB+alpha picker below. The RGB popup carries red / green / blue / alpha sliders (0..255). Hex grows to eight digits when alpha < 255. Each picker feeds a preview swatch via SolidColorBrush(Color.FromHex(...))."]

                // ── Body ──────────────────────────────────────────
                Border [Background=@SurfaceContainerLow, Padding=(20,20,20,20)] {
                    StackPanel [Orientation=Vertical] {
                        StackPanel [Orientation=Horizontal, Margin=(0,0,0,16)] {
                            StackPanel [Orientation=Vertical, Margin=(0,0,24,0)] {
                                TextBlock [Text="Surface", FontSize=11, FontWeight=Bold,
                                           Foreground=@OnSurface, Margin=(0,0,0,4)]
                                ColorPicker [ColorHex=$SurfaceHex]
                            }
                            Border x:name="SurfacePreview"
                                  [Width=80, Height=40, CornerRadius=4, VerticalAlignment=Bottom,
                                   BorderBrush=@OutlineVariant, BorderThickness=(1)]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,0,0,16)] {
                            StackPanel [Orientation=Vertical, Margin=(0,0,24,0)] {
                                TextBlock [Text="Accent", FontSize=11, FontWeight=Bold,
                                           Foreground=@OnSurface, Margin=(0,0,0,4)]
                                ColorPicker [ColorHex=$AccentHex]
                            }
                            Border x:name="AccentPreview"
                                  [Width=80, Height=40, CornerRadius=4, VerticalAlignment=Bottom,
                                   BorderBrush=@OutlineVariant, BorderThickness=(1)]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,0,0,16)] {
                            StackPanel [Orientation=Vertical, Margin=(0,0,24,0)] {
                                TextBlock [Text="Ink", FontSize=11, FontWeight=Bold,
                                           Foreground=@OnSurface, Margin=(0,0,0,4)]
                                ColorPicker [ColorHex=$InkHex]
                            }
                            Border x:name="InkPreview"
                                  [Width=80, Height=40, CornerRadius=4, VerticalAlignment=Bottom,
                                   BorderBrush=@OutlineVariant, BorderThickness=(1)]
                        }
                        StackPanel [Orientation=Horizontal] {
                            StackPanel [Orientation=Vertical, Margin=(0,0,24,0)] {
                                TextBlock [Text="Overlay (RGB + alpha)", FontSize=11, FontWeight=Bold,
                                           Foreground=@OnSurface, Margin=(0,0,0,4)]
                                ColorPicker [ColorHex=$OverlayHex, Variant=RGB]
                            }
                            Border x:name="OverlayPreview"
                                  [Width=80, Height=40, CornerRadius=4, VerticalAlignment=Bottom,
                                   BorderBrush=@OutlineVariant, BorderThickness=(1)]
                        }
                    }
                }
            }
        }
    }
}
