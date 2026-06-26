// Default theme entries for the formatting family — the
// shape/color/brush/pen editor stack used by chart authoring panes.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Formatting {

    // ── ColorPicker: closed chrome ─────────────────────────────────
    // A ComboBox-style trigger: rounded outlined border housing a small
    // swatch (Background bound to the templated parent's SwatchBrush),
    // the current hex label, and a chevron. ColorPicker.ctor wires the
    // PointerDown / PointerUp / PointerLeave gesture on
    // PART_SelectionTrigger; on release the picker flips IsDropDownOpen
    // and mountPopup spins up the overlay popup chrome below.
    Template x:key="DefaultColorPicker" [TargetType=ColorPicker]{
        ClickableBorder x:name="PART_SelectionTrigger"
                       [ Background      = @Surface,
                         BorderBrush     = @Outline,
                         BorderThickness = (1),
                         CornerRadius    = @ShapeExtraSmall,
                         Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2) ] {
            // HorizontalAlignment=Left makes the StackPanel shrink-wrap
            // to its children's measured width inside the Border. Stops
            // a stretched parent from arranging the StackPanel at a
            // width that disagrees with the Border's wrap rect (which
            // is what was pushing the chevron outside the stroke).
            StackPanel [Orientation=Horizontal, HorizontalAlignment=Left] {
                Border [ Width        = 22,
                         Height       = 18,
                         CornerRadius = 3,
                         BorderBrush  = @OutlineVariant,
                         BorderThickness = (1),
                         Margin       = (0, 0, @Spacing3, 0),
                         Background   = $$SwatchBrush ]
                TextBlock [ Text          = $$ColorHex,
                            Foreground    = @OnSurface,
                            FontFamily    = @BodyMediumFont,
                            FontWeight    = @BodyMediumWeight,
                            FontSize      = @BodyMediumSize,
                            VerticalAlignment = Center,
                            Margin        = (0, 0, @Spacing3, 0) ]
                TextBlock [ Text          = "▾",
                            Foreground    = @OnSurfaceVariant,
                            FontSize      = @LabelLargeSize,
                            VerticalAlignment = Center ]
            }
        }

        when ( PART_SelectionTrigger.IsMouseOver ) { PART_SelectionTrigger.Background = @StateHoverOverlay; }
        when ( PART_SelectionTrigger.IsPressed   ) { PART_SelectionTrigger.Background = @StatePressOverlay; }
        when ( IsDropDownOpen )                     { PART_SelectionTrigger.BorderBrush = @Primary; }
    }

    // ── ColorPicker: HSV dropdown popup ─────────────────────────────
    // Mounted on the PresentationTarget's OverlayLayer when
    // IsDropDownOpen flips true. The PART_PaletteContainer WrapPanel is
    // populated by ColorPicker.populatePalette with Material 3 swatches;
    // the three Sliders bind two-way to Hue / Saturation / Brightness
    // via templated-parent bindings, and the TextBox round-trips the hex
    // value through ColorHex. ColorPicker.OnPropertyChanged keeps the
    // four channels (Color / ColorHex / HSV trio) in lock-step.
    Template x:key="DefaultColorPickerPopup" [TargetType=ColorPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 280 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 8)] {
                        Border [ Width        = 36,
                                 Height       = 36,
                                 CornerRadius = 4,
                                 BorderBrush  = @OutlineVariant,
                                 BorderThickness = (1),
                                 Margin       = (0, 0, 8, 0),
                                 Background   = $$SwatchBrush ]
                        TextBox x:name="PART_HexInput"
                                [ Width         = 220,
                                  VerticalAlignment = Center ]
                    }

                    WrapPanel x:name="PART_PaletteContainer"
                              [ Orientation = Horizontal,
                                Margin      = (0, 0, 0, 8) ]

                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="H", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_HSlider" [ Width=240, Minimum=0, Maximum=360, SmallChange=1, LargeChange=15 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="S", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_SSlider" [ Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="V", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_VSlider" [ Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10 ]
                    }
                }
            }
        }

        when ( ThemeManager.PrefersContrast = More ) { PART_PopupBody.BorderThickness = (2); }
    }

    // ── ColorPicker: RGB+alpha popup variant ───────────────────────
    // Same chrome as the HSV popup but with the Office-classic 2D
    // hue/saturation gradient box + brightness rail in place of the
    // palette grid, and the channel rows carry R / G / B / A sliders.
    // The Style trigger below swaps PopupTemplate to this when
    // Variant = RGB.
    Template x:key="DefaultColorPickerPopupRGB" [TargetType=ColorPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 280 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 8)] {
                        Border [ Width        = 36,
                                 Height       = 36,
                                 CornerRadius = 4,
                                 BorderBrush  = @OutlineVariant,
                                 BorderThickness = (1),
                                 Margin       = (0, 0, 8, 0),
                                 Background   = $$SwatchBrush ]
                        TextBox x:name="PART_HexInput"
                                [ Width         = 220,
                                  VerticalAlignment = Center ]
                    }

                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 12)] {
                        Canvas x:name="PART_HsBox" [Width=220, Height=140] {
                            Border x:name="PART_HsBoxHue"     [Width=220, Height=140]
                            Border x:name="PART_HsBoxOverlay" [Width=220, Height=140]
                            Border x:name="PART_HsBoxCursor"
                                  [Width=12, Height=12, CornerRadius=6,
                                   BorderBrush=#ffffff, BorderThickness=(2)]
                        }
                        Canvas x:name="PART_VRail" [Width=20, Height=140, Margin=(12, 0, 0, 0)] {
                            Border x:name="PART_VRailFill"
                                  [Width=20, Height=140, BorderBrush=@OutlineVariant, BorderThickness=(1)]
                            Border x:name="PART_VRailCursor"
                                  [Width=26, Height=4, Background=#1f2937]
                        }
                    }

                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="R", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_RSlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="G", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_GSlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="B", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_BSlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                    StackPanel [Orientation=Horizontal, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="A", Width=14, Foreground=@OnSurfaceVariant, VerticalAlignment=Center, Margin=(0, 0, 6, 0)]
                        Slider x:name="PART_ASlider" [ Width=240, Minimum=0, Maximum=255, SmallChange=1, LargeChange=16 ]
                    }
                }
            }
        }

        when ( ThemeManager.PrefersContrast = More ) { PART_PopupBody.BorderThickness = (2); }
    }

    Style [TargetType=ColorPicker] {
        Template      = @DefaultColorPicker;
        PopupTemplate = @DefaultColorPickerPopup;
        when ( Variant = RGB ) { PopupTemplate = @DefaultColorPickerPopupRGB; }
    }

    // ── BrushPicker: closed chrome ─────────────────────────────────
    // ComboBox-style trigger like ColorPicker, but the swatch shows
    // the current Brush (not just a colour), so it previews gradients
    // and patterns alongside solid fills. The label reads the variant
    // name — "Solid", "Linear", "Radial", "Pattern" — so the closed
    // chrome conveys which brush flavour is bound without making the
    // user open the popup. BrushPicker.ctor wires PointerDown / Up /
    // Leave on PART_SelectionTrigger.
    Template x:key="DefaultBrushPicker" [TargetType=BrushPicker]{
        ClickableBorder x:name="PART_SelectionTrigger"
                       [ Background      = @Surface,
                         BorderBrush     = @Outline,
                         BorderThickness = (1),
                         CornerRadius    = @ShapeExtraSmall,
                         Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2) ] {
            StackPanel [Orientation=Horizontal] {
                Border [ Width        = 36,
                         Height       = 18,
                         CornerRadius = 3,
                         BorderBrush  = @OutlineVariant,
                         BorderThickness = (1),
                         Margin       = (0, 0, @Spacing3, 0),
                         Background   = $$PreviewBrush ]
                TextBlock x:name="PART_VariantLabel"
                          [ Text          = "Solid",
                            Foreground    = @OnSurface,
                            FontFamily    = @BodyMediumFont,
                            FontWeight    = @BodyMediumWeight,
                            FontSize      = @BodyMediumSize,
                            VerticalAlignment = Center,
                            Margin        = (0, 0, @Spacing3, 0) ]
                TextBlock [ Text          = "▾",
                            Foreground    = @OnSurfaceVariant,
                            FontSize      = @LabelLargeSize,
                            VerticalAlignment = Center ]
            }
        }

        when ( PART_SelectionTrigger.IsMouseOver ) { PART_SelectionTrigger.Background = @StateHoverOverlay; }
        when ( PART_SelectionTrigger.IsPressed   ) { PART_SelectionTrigger.Background = @StatePressOverlay; }
        when ( IsDropDownOpen )                     { PART_SelectionTrigger.BorderBrush = @Primary; }
        when ( Variant = Linear  ) { PART_VariantLabel.Text = "Linear gradient"; }
        when ( Variant = Radial  ) { PART_VariantLabel.Text = "Radial gradient"; }
        when ( Variant = Pattern ) { PART_VariantLabel.Text = "Pattern";         }
    }

    // ── BrushPicker: shared popup chrome helper ────────────────────
    // Every variant popup shares the same outer shell (host / scrim /
    // body) and the same four-tab row at top — the only thing that
    // differs is the variant-specific sub-editor block in the middle.
    // Tabs use ClickableBorder + state triggers; BrushPicker.mountPopup
    // wires PointerUp on each to write Variant.

    // Solid variant popup — embeds a ColorPicker for the colour body.
    Template x:key="DefaultBrushPickerSolid" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    // ── Variant tabs ─────────────────────────────
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @SecondaryContainer,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                    }
                    // ── Solid body ───────────────────────────────
                    ColorPicker x:name="PART_SolidColor" [Variant=RGB]
                }
            }
        }
    }

    // Linear gradient variant popup. Two embedded ColorPickers + an
    // angle slider. Renders a 2-stop linear brush; BrushPicker maps
    // angle (degrees) onto StartPoint/EndPoint in [0,1] bbox coords.
    Template x:key="DefaultBrushPickerLinear" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @SecondaryContainer,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4),
                                         Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @Surface,
                                         CornerRadius = @ShapeExtraSmall,
                                         Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                    }
                    StackPanel [Orientation=Vertical, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="Start colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,0,0,2)]
                        ColorPicker x:name="PART_LinearStart"
                        TextBlock [Text="End colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,8,0,2)]
                        ColorPicker x:name="PART_LinearEnd"
                        StackPanel [Orientation=Horizontal, Margin=(0,10,0,0)] {
                            TextBlock [Text="Angle", Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_LinearAngle"
                                   [Width=240, Minimum=-180, Maximum=180, SmallChange=1, LargeChange=15]
                        }
                    }
                }
            }
        }
    }

    // Radial gradient variant popup. Two colour stops (inner/outer) +
    // CenterX/CenterY in [0..100] (mapped to 0..1 by BrushPicker) +
    // Radius in [0..100].
    Template x:key="DefaultBrushPickerRadial" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @SecondaryContainer, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                    }
                    StackPanel [Orientation=Vertical, Margin=(0, 4, 0, 0)] {
                        TextBlock [Text="Inner colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,0,0,2)]
                        ColorPicker x:name="PART_RadialInner"
                        TextBlock [Text="Outer colour", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,8,0,2)]
                        ColorPicker x:name="PART_RadialOuter"
                        StackPanel [Orientation=Horizontal, Margin=(0,10,0,0)] {
                            TextBlock [Text="Cx %",   Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_RadialCenterX" [Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Cy %",   Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_RadialCenterY" [Width=240, Minimum=0, Maximum=100, SmallChange=1, LargeChange=10]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Radius %", Width=48, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_RadialRadius"  [Width=240, Minimum=1, Maximum=100, SmallChange=1, LargeChange=10]
                        }
                    }
                }
            }
        }
    }

    // Pattern variant popup. ComboBox to choose PatternKind, two
    // ColorPickers (fg + bg) and three sliders (Size / Angle /
    // StrokeThickness). PART_PatternKind's Items + SelectedItem are
    // populated by BrushPicker.adoptPopupParts — string-enum values
    // map straight through onto PatternBrush.Kind.
    Template x:key="DefaultBrushPickerPattern" [TargetType=BrushPicker]{
        MenuPopupHost x:name="PART_PopupHost" {
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_PopupBody"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (10),
                    Width           = 320 ] {
                StackPanel [Orientation=Vertical] {
                    StackPanel [Orientation=Horizontal, Margin=(0, 0, 0, 10)] {
                        ClickableBorder x:name="PART_TabSolid"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabLinear"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabRadial"
                                       [ Background = @Surface, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4), Margin = (0, 0, 4, 0) ] {
                            TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium]
                        }
                        ClickableBorder x:name="PART_TabPattern"
                                       [ Background = @SecondaryContainer, CornerRadius = @ShapeExtraSmall, Padding = (10, 4, 10, 4) ] {
                            TextBlock [Text="Pattern", Foreground=@OnSecondaryContainer, Style=@LabelMedium]
                        }
                    }
                    StackPanel [Orientation=Vertical, Margin=(0, 4, 0, 0)] {
                        StackPanel [Orientation=Horizontal, Margin=(0,0,0,8)] {
                            TextBlock [Text="Kind", Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            ComboBox x:name="PART_PatternKind" [Width=232]
                        }
                        TextBlock [Text="Foreground", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,0,0,2)]
                        ColorPicker x:name="PART_PatternForeground"
                        TextBlock [Text="Background", Style=@LabelSmall, Foreground=@OnSurfaceVariant, Margin=(0,8,0,2)]
                        ColorPicker x:name="PART_PatternBackground"
                        StackPanel [Orientation=Horizontal, Margin=(0,10,0,0)] {
                            TextBlock [Text="Size",  Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_PatternSize"   [Width=232, Minimum=2, Maximum=64, SmallChange=1, LargeChange=4]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Angle", Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_PatternAngle"  [Width=232, Minimum=0,  Maximum=180, SmallChange=1, LargeChange=15]
                        }
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Stroke", Width=64, Style=@LabelSmall, Foreground=@OnSurfaceVariant, VerticalAlignment=Center]
                            Slider x:name="PART_PatternStroke" [Width=232, Minimum=0.5,Maximum=8,   SmallChange=0.5, LargeChange=1]
                        }
                    }
                }
            }
        }
    }

    Style [TargetType=BrushPicker] {
        Template      = @DefaultBrushPicker;
        PopupTemplate = @DefaultBrushPickerSolid;
        when ( Variant = Linear  ) { PopupTemplate = @DefaultBrushPickerLinear;  }
        when ( Variant = Radial  ) { PopupTemplate = @DefaultBrushPickerRadial;  }
        when ( Variant = Pattern ) { PopupTemplate = @DefaultBrushPickerPattern; }
    }

    // ── PenEditor: inline expanded panel ───────────────────────────
    // PowerPoint-style: one column of labelled rows. BrushPicker on
    // the Brush row uses TemplateBinding for Brush; sliders /
    // comboboxes for the simpler DPs. PenEditor.OnPropertyChanged
    // pushes each row's value onto its bound Pen so the consumer's
    // Stroke updates as the user drags.
    //
    // The MiterLimit row is the only visibility-gated row — the
    // theme has no `Visibility` enum yet, so we fake the toggle by
    // collapsing the row's MaxHeight (and clearing its padding) when
    // LineJoin ≠ Miter. The PART_MiterRow.Padding setter on the
    // default branch carries the resting layout; the trigger zeroes
    // it out when the editor's Join isn't Miter.
    Template x:key="DefaultPenEditor" [TargetType=PenEditor] {
        StackPanel [Orientation=Vertical] {
            // Section header — kept inside the editor so the
            // ShapeFormatControl template stays a flat pair of editors
            // and Fill/Line read with identical chrome.
            TextBlock [Style=@TitleSmall, Text="Line",
                       Foreground=@OnSurface, Margin=(0,0,0,@Spacing3)]
            // Two-column property grid — left column Auto-sized to the
            // widest label, right column takes the rest. Each editor row
            // is its own RowDefinition. The Miter limit row's label +
            // editor are separately named so PenEditor.ts can flip both
            // to Visibility=Collapsed when LineJoin ≠ Miter; with both
            // cells in the row Collapsed, the Auto-sized row height
            // contracts to 0 and the row visually disappears.
            //
            // MaxWidth caps the Star column when the host is unbounded
            // (e.g., inside a ScrollViewer that measures with Infinity).
            // Without it the Star track inflates to Infinity and child
            // rects emit NaN/Infinity into the SVG output.
            Grid [MaxWidth=300] {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                }
                RowDefinitions {
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                }
                // Brush
                TextBlock [Grid.Row=0, Grid.Column=0,
                           Style=@LabelSmall, Text="Brush",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                BrushPicker x:name="PART_BrushPicker"
                            [Grid.Row=0, Grid.Column=1,
                             Margin=(0,0,0,@Spacing3)]
                // Thickness — narrow numeric SpinEdit, kept compact
                // (MaxWidth=120) so the editor cell stays consistent
                // with the Fill section's transparency input.
                TextBlock [Grid.Row=1, Grid.Column=0,
                           Style=@LabelSmall, Text="Thickness",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                SpinEdit x:name="PART_Thickness"
                         [Grid.Row=1, Grid.Column=1,
                          HorizontalAlignment=Left, MaxWidth=120, Width=120,
                          Minimum=0, Maximum=24, SmallChange=0.5, LargeChange=2,
                          DecimalPlaces=1,
                          Margin=(0,0,0,@Spacing3)]
                // DashStyle — Items + SelectedItem populated by
                // PenEditor.adoptTemplateParts (see DASH_OPTIONS there).
                // DisplayMemberPath = "Label" so the dropdown shows the
                // human strings; the editor reads .Value back.
                TextBlock [Grid.Row=2, Grid.Column=0,
                           Style=@LabelSmall, Text="Dash",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                ComboBox x:name="PART_Dash"
                         [Grid.Row=2, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize, DisplayMemberPath="Label",
                          Margin=(0,0,0,@Spacing3)]
                // Cap
                TextBlock [Grid.Row=3, Grid.Column=0,
                           Style=@LabelSmall, Text="Cap",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                ComboBox x:name="PART_Cap"
                         [Grid.Row=3, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize, DisplayMemberPath="Label",
                          Margin=(0,0,0,@Spacing3)]
                // Join
                TextBlock [Grid.Row=4, Grid.Column=0,
                           Style=@LabelSmall, Text="Join",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing3)]
                ComboBox x:name="PART_Join"
                         [Grid.Row=4, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize, DisplayMemberPath="Label",
                          Margin=(0,0,0,@Spacing3)]
                // Miter limit — only meaningful when LineJoin=Miter.
                // PenEditor.refreshMiterRowVisibility toggles
                // PART_MiterLabel + PART_MiterLimit in lock-step;
                // when both children of an Auto-sized row are Collapsed
                // the row's DesiredSize collapses to zero.
                TextBlock x:name="PART_MiterLabel"
                          [Grid.Row=5, Grid.Column=0,
                           Style=@LabelSmall, Text="Miter limit",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,0)]
                SpinEdit x:name="PART_MiterLimit"
                         [Grid.Row=5, Grid.Column=1,
                          HorizontalAlignment=Left, MaxWidth=120, Width=120,
                          Minimum=1, Maximum=20, SmallChange=0.5, LargeChange=2,
                          DecimalPlaces=1]
            }
        }
    }

    Style [TargetType=PenEditor] {
        Template = @DefaultPenEditor;
    }

    // ── FillEditor: PowerPoint-style inline fill panel ─────────────
    // One column: variant tab row → body slot → opacity slider. The
    // body slot's child is materialised by the FillEditor from the
    // Style-supplied BodyTemplate (swapped on Variant change). Tabs
    // are ClickableBorders the FillEditor wires in adoptTemplateParts;
    // the active-tab highlight rides through Style triggers below.

    Template x:key="DefaultFillEditor" [TargetType=FillEditor] {
        StackPanel x:name="PART_FillSection" [Orientation=Vertical] {
            // Section header — kept inside the editor so the
            // ShapeFormatControl template stays a flat pair of editors.
            // The header + variant tab row are ALWAYS visible (so the
            // user can switch back to a brush after picking No fill);
            // only the body slot + transparency row collapse on
            // Variant=None. Whole-section collapse for the "no shape
            // selected" state lives on PART_Editors in
            // ShapeFormatControl, one level up.
            TextBlock [Style=@TitleSmall, Text="Fill",
                       Foreground=@OnSurface, Margin=(0,0,0,@Spacing3)]
            // ── Variant tabs ────────────────────────────────────
            // ClickableBorder for each of the six variants. Default
            // background is @Surface; the Style triggers below flip
            // the active one to @SecondaryContainer. UniformGrid 3×2
            // lays them in two rows regardless of pane width.
            UniformGrid [Columns=3, Margin=(0,0,0,@Spacing4)] {
                ClickableBorder x:name="PART_TabNone"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="No fill", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabSolid"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Solid", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabLinear"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Linear", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabRadial"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Radial", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabPattern"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Pattern", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
                ClickableBorder x:name="PART_TabPicture"
                               [ Background = @Surface,
                                 BorderBrush = @OutlineVariant,
                                 BorderThickness = (1),
                                 CornerRadius = @ShapeExtraSmall,
                                 Padding = (12, 6, 12, 6),
                                 Margin = (0, 0, 4, 4),
                                 HorizontalAlignment = Stretch ] {
                    TextBlock [Text="Picture", Foreground=@OnSurface, Style=@LabelMedium,
                               HorizontalAlignment=Center]
                }
            }

            // ── Body slot ───────────────────────────────────────
            // FillEditor.applyBodyTemplate() materialises the Style-
            // picked BodyTemplate here. Border gives a stable single-
            // child container without any visible chrome of its own.
            // MaxWidth caps the slot so the per-variant 2-column Grids
            // below don't inflate their Star tracks to Infinity when
            // the editor lives inside an unbounded host (ScrollViewer).
            Border x:name="PART_BodyHost" [MaxWidth=300, Margin=(0,0,0,@Spacing4)]

            // ── Opacity row ─────────────────────────────────────
            // Visible for every non-None variant; collapsed by
            // FillEditor.refreshOpacityRowVisibility when Variant=None
            // (alongside PART_BodyHost — the tabs above stay visible
            // so the user can switch back to a brush).
            // SpinEdit replaces the old slider+readout pair (request #3).
            // Wrapped in its own 2-column Grid so the Transparency
            // label aligns with the labels in the body grid above.
            Grid x:name="PART_OpacityRow" [MaxWidth=300] {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                }
                // Explicit Auto row — without it the Grid defaults to a
                // 1* row that absorbs the unbounded available height
                // from the surrounding vertical StackPanel and yields
                // Infinity rect dimensions.
                RowDefinitions {
                    RowDefinition [Height=GridLength.Auto]
                }
                TextBlock [Grid.Column=0,
                           Style=@LabelSmall, Text="Transparency",
                           Foreground=@OnSurface,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,0)]
                SpinEdit x:name="PART_OpacityEdit"
                         [Grid.Column=1,
                          HorizontalAlignment=Left, MaxWidth=120, Width=120,
                          Minimum=0, Maximum=100, SmallChange=1, LargeChange=10,
                          DecimalPlaces=0]
            }
        }

        when ( Variant = None    ) { PART_TabNone.Background    = @SecondaryContainer; }
        when ( Variant = Solid   ) { PART_TabSolid.Background   = @SecondaryContainer; }
        when ( Variant = Linear  ) { PART_TabLinear.Background  = @SecondaryContainer; }
        when ( Variant = Radial  ) { PART_TabRadial.Background  = @SecondaryContainer; }
        when ( Variant = Pattern ) { PART_TabPattern.Background = @SecondaryContainer; }
        when ( Variant = Picture ) { PART_TabPicture.Background = @SecondaryContainer; }
    }

    // ── Body templates ─────────────────────────────────────────────
    // Each is a ControlTemplate against TargetType=FillEditor so $$
    // bindings inside resolve to the FillEditor's mirror DPs. The body
    // template's root visual gets slotted into PART_BodyHost.

    // None body — empty. Variant=None collapses PART_BodyHost via
    // FillEditor.refreshOpacityRowVisibility, so the body content
    // never paints in this state; an empty Border keeps
    // applyBodyTemplate's Apply() path well-formed.
    Template x:key="FillEditorBodyNone" [TargetType=FillEditor] {
        Border [Height=0]
    }

    // Each body template uses a 2-column Grid — Auto-sized label column
    // on the left, Star-sized editor column on the right. Editor cells
    // inherit Stretch alignment from the Grid cell so ColorPickers /
    // Sliders / ComboBoxes fill the available width.

    Template x:key="FillEditorBodySolid" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            // Explicit Auto row — without it the Grid defaults to a
            // single 1* row, which absorbs any unbounded available
            // height the host hands in (e.g. ScrollViewer's Infinity
            // measure) and propagates Infinity into child rect heights.
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Column=0,
                       Style=@LabelSmall, Text="Colour",
                       Foreground=@OnSurface,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            ColorPicker x:name="PART_SolidColor"
                        [Grid.Column=1, Variant=RGB]
        }
    }

    Template x:key="FillEditorBodyLinear" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Row=0, Grid.Column=0,
                       Style=@LabelSmall, Text="Start colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_LinearStart"
                        [Grid.Row=0, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=1, Grid.Column=0,
                       Style=@LabelSmall, Text="End colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_LinearEnd"
                        [Grid.Row=1, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=2, Grid.Column=0,
                       Style=@LabelSmall, Text="Angle",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            Slider x:name="PART_LinearAngle"
                   [Grid.Row=2, Grid.Column=1,
                    Minimum=-180, Maximum=180,
                    SmallChange=1, LargeChange=15]
        }
    }

    Template x:key="FillEditorBodyRadial" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Row=0, Grid.Column=0,
                       Style=@LabelSmall, Text="Inner colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_RadialInner"
                        [Grid.Row=0, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=1, Grid.Column=0,
                       Style=@LabelSmall, Text="Outer colour",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_RadialOuter"
                        [Grid.Row=1, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=2, Grid.Column=0,
                       Style=@LabelSmall, Text="Cx %",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_RadialCenterX"
                   [Grid.Row=2, Grid.Column=1,
                    Minimum=0, Maximum=100,
                    SmallChange=1, LargeChange=10,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=3, Grid.Column=0,
                       Style=@LabelSmall, Text="Cy %",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_RadialCenterY"
                   [Grid.Row=3, Grid.Column=1,
                    Minimum=0, Maximum=100,
                    SmallChange=1, LargeChange=10,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=4, Grid.Column=0,
                       Style=@LabelSmall, Text="Radius %",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            Slider x:name="PART_RadialRadius"
                   [Grid.Row=4, Grid.Column=1,
                    Minimum=1, Maximum=100,
                    SmallChange=1, LargeChange=10]
        }
    }

    Template x:key="FillEditorBodyPattern" [TargetType=FillEditor] {
        Grid {
            ColumnDefinitions {
                ColumnDefinition [Width=GridLength.Auto]
                ColumnDefinition [Width=GridLength.Star]
            }
            RowDefinitions {
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
                RowDefinition [Height=GridLength.Auto]
            }
            TextBlock [Grid.Row=0, Grid.Column=0,
                       Style=@LabelSmall, Text="Kind",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ComboBox x:name="PART_PatternKind"
                     [Grid.Row=0, Grid.Column=1,
                      TextBlock.FontSize=@BodySmallSize,
                      Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=1, Grid.Column=0,
                       Style=@LabelSmall, Text="Foreground",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_PatternForeground"
                        [Grid.Row=1, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=2, Grid.Column=0,
                       Style=@LabelSmall, Text="Background",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            ColorPicker x:name="PART_PatternBackground"
                        [Grid.Row=2, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=3, Grid.Column=0,
                       Style=@LabelSmall, Text="Size",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_PatternSize"
                   [Grid.Row=3, Grid.Column=1,
                    Minimum=2, Maximum=64,
                    SmallChange=1, LargeChange=4,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=4, Grid.Column=0,
                       Style=@LabelSmall, Text="Angle",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,@Spacing2)]
            Slider x:name="PART_PatternAngle"
                   [Grid.Row=4, Grid.Column=1,
                    Minimum=0, Maximum=180,
                    SmallChange=1, LargeChange=15,
                    Margin=(0,0,0,@Spacing2)]
            TextBlock [Grid.Row=5, Grid.Column=0,
                       Style=@LabelSmall, Text="Stroke",
                       Foreground=@OnSurfaceVariant,
                       VerticalAlignment=Center,
                       Margin=(0,0,@Spacing3,0)]
            Slider x:name="PART_PatternStroke"
                   [Grid.Row=5, Grid.Column=1,
                    Minimum=0.5, Maximum=8,
                    SmallChange=0.5, LargeChange=1]
        }
    }

    Template x:key="FillEditorBodyPicture" [TargetType=FillEditor] {
        // StackPanel wraps the label/editor Grid AND the full-width
        // helper paragraph. The paragraph is NOT inside the Grid: a
        // wrapping TextBlock with Grid.ColumnSpan=2 measures with
        // Infinity in the Auto pass and dumps its unwrapped intrinsic
        // width into the Auto column (Stars aren't pre-resolved at that
        // phase — see grid.ts), which collapses the Star column and
        // hides the TextBox / ComboBox. As an outside sibling the
        // paragraph just inherits the StackPanel's width with no Grid
        // interaction.
        StackPanel [Orientation=Vertical] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [Width=GridLength.Auto]
                    ColumnDefinition [Width=GridLength.Star]
                }
                RowDefinitions {
                    RowDefinition [Height=GridLength.Auto]
                    RowDefinition [Height=GridLength.Auto]
                }
                TextBlock [Grid.Row=0, Grid.Column=0,
                           Style=@LabelSmall, Text="Image URL",
                           Foreground=@OnSurfaceVariant,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,@Spacing2)]
                TextBox x:name="PART_PictureUri"
                        [Grid.Row=0, Grid.Column=1,
                         Margin=(0,0,0,@Spacing2)]
                TextBlock [Grid.Row=1, Grid.Column=0,
                           Style=@LabelSmall, Text="Stretch",
                           Foreground=@OnSurfaceVariant,
                           VerticalAlignment=Center,
                           Margin=(0,0,@Spacing3,0)]
                ComboBox x:name="PART_PictureStretch"
                         [Grid.Row=1, Grid.Column=1,
                          TextBlock.FontSize=@BodySmallSize]
            }
            TextBlock [Style=@LabelSmall,
                       Text="Paste an absolute URL or a workspace-relative path. Uniform stretch keeps aspect; Fill stretches independently; UniformToFill crops to bbox.",
                       Foreground=@OnSurfaceVariant,
                       TextWrapping=Wrap, Margin=(0,@Spacing2,0,0)]
        }
    }

    Style [TargetType=FillEditor] {
        Template     = @DefaultFillEditor;
        BodyTemplate = @FillEditorBodySolid;
        when ( Variant = None    ) { BodyTemplate = @FillEditorBodyNone;    }
        when ( Variant = Linear  ) { BodyTemplate = @FillEditorBodyLinear;  }
        when ( Variant = Radial  ) { BodyTemplate = @FillEditorBodyRadial;  }
        when ( Variant = Pattern ) { BodyTemplate = @FillEditorBodyPattern; }
        when ( Variant = Picture ) { BodyTemplate = @FillEditorBodyPicture; }
    }

    // ── ShapeFormatControl: PowerPoint Format-Shape pane ───────────
    // Combines FillEditor + PenEditor into one column. PART_FillEditor
    // and PART_PenEditor are adopted by ShapeFormatControl.ts, which
    // routes its Fill / Stroke DPs through to / from each editor under
    // a _syncing guard. No TemplateBinding here: FillEditor swaps its
    // Fill wholesale on every edit (TemplateBinding is OneWay, so the
    // editor's writes wouldn't surface), and the manual wiring keeps
    // the two editors symmetric.
    // Section headers ("Fill", "Line") moved INTO each editor's template
    // so the Fill section can collapse as a whole when Variant=None.
    // The wrapper stacks the two editors and ALSO carries an empty-state
    // placeholder shown when both Fill and Stroke are undefined (the
    // diagrammer's "no shape selected" signal). ShapeFormatControl.ts
    // toggles PART_Editors / PART_EmptyMessage heights on every Fill or
    // Stroke change.
    // Cap dropdown row: a small glyph silhouette (filled OR stroked per
    // option) + the option label. Generic — renders any CapOption; the
    // diagram layer supplies connector-cap values. The glyph Path is
    // layout-free, so a fixed-size Border reserves the row's icon slot.
    DataTemplate x:key="CapOptionTemplate" [DataType=CapOption] {
        StackPanel [Orientation=Horizontal] {
            Border [Width=24, Height=14, VerticalAlignment=Center,
                    Margin=(0,0,@Spacing2,0)] {
                Path [Data=$Glyph, Fill=$GlyphFill, Stroke=$GlyphStroke]
            }
            TextBlock [Text=$Label, Style=@BodySmall,
                       Foreground=@OnSurface, VerticalAlignment=Center]
        }
    }

    Template x:key="DefaultShapeFormatControl" [TargetType=ShapeFormatControl] {
        StackPanel [Orientation=Vertical] {
            TextBlock x:name="PART_EmptyMessage"
                      [Style=@BodySmall,
                       Text="Select a shape to format its fill and outline.",
                       Foreground=@OnSurfaceVariant,
                       TextWrapping=Wrap,
                       HorizontalAlignment=Stretch,
                       Margin=(0,@Spacing4,0,0)]
            StackPanel x:name="PART_Editors" [Orientation=Vertical] {
                FillEditor x:name="PART_FillEditor"
                PenEditor  x:name="PART_PenEditor" [Margin=(0,@Spacing4,0,0)]
            }
            // Connector end-caps — ShapeFormatControl.ts collapses this
            // whole section unless ShowCaps (a connector is selected).
            // Both combos share @CapOptionTemplate for the glyph preview
            // and DisplayMemberPath="Label" for the collapsed selection box.
            StackPanel x:name="PART_CapSection"
                       [Orientation=Vertical, Margin=(0,@Spacing4,0,0)] {
                TextBlock [Style=@TitleSmall, Text="Connector ends",
                           Foreground=@OnSurface, Margin=(0,0,0,@Spacing3)]
                Grid [MaxWidth=300] {
                    ColumnDefinitions {
                        ColumnDefinition [Width=GridLength.Auto]
                        ColumnDefinition [Width=GridLength.Star]
                    }
                    RowDefinitions {
                        RowDefinition [Height=GridLength.Auto]
                        RowDefinition [Height=GridLength.Auto]
                    }
                    TextBlock [Grid.Row=0, Grid.Column=0,
                               Style=@LabelSmall, Text="Start",
                               Foreground=@OnSurface,
                               VerticalAlignment=Center,
                               Margin=(0,0,@Spacing3,@Spacing3)]
                    ComboBox x:name="PART_SourceCap"
                             [Grid.Row=0, Grid.Column=1,
                              ItemTemplate=@CapOptionTemplate,
                              DisplayMemberPath="Label",
                              TextBlock.FontSize=@BodySmallSize,
                              Margin=(0,0,0,@Spacing3)]
                    TextBlock [Grid.Row=1, Grid.Column=0,
                               Style=@LabelSmall, Text="End",
                               Foreground=@OnSurface,
                               VerticalAlignment=Center,
                               Margin=(0,0,@Spacing3,0)]
                    ComboBox x:name="PART_TargetCap"
                             [Grid.Row=1, Grid.Column=1,
                              ItemTemplate=@CapOptionTemplate,
                              DisplayMemberPath="Label",
                              TextBlock.FontSize=@BodySmallSize]
                }
            }
        }
    }

    Style [TargetType=ShapeFormatControl] {
        Template = @DefaultShapeFormatControl;
    }
}
