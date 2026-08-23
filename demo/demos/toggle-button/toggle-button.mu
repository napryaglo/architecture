import ToggleButtonVM from "./toggle-button-vm.mjs"

// toggle-button.mu — ToggleButton showcase. Three style-toggle buttons
// (Bold / Italic / Underline) bind their IsChecked TwoWay onto the VM.
// A preview line below uses PropertyTriggers to recompose itself when
// any of the three flips.
//
// What's exercised:
//   * IsChecked DP — flips on click via the underlying Button protocol.
//   * TwoWay binding — VM ↔ control stay in lockstep (click button →
//     VM flips → preview chrome restyles via triggers).
//   * PropertyTrigger on the toggle's IsChecked — bound text label
//     reads $IsChecked back so the row chrome reflects state without
//     needing a separate listener.

resources ToggleButtonDemo {
    // Re-templated ToggleButton chrome. PART_Border ships a Surface
    // default Fill; the IsChecked trigger overrides to Primary
    // at TriggerValue tier (which sits above LocalValue under mural's
    // priority order — see effective-value.ts). Same TargetedSetter
    // pattern the default ListBoxItem template uses.
    Template x:key="ToggleChromeTemplate" [TargetType = ToggleButton] {
        Border x:name="PART_Border"
            [ Fill      = @Surface,
              Stroke     = Pen [ Brush = @Outline ],
              CornerRadius    = @ShapeSmall ] {
            // Transparent state-layer over the fill — hover / press tint
            // it at the M3 8% / 12% opacities so the button gives pointer
            // feedback in both states. Padding lives here (not on
            // PART_Border) so the overlay covers the content box inside
            // the 1dp outline. Same pattern as the framework's
            // DefaultFilledIconButtonToggle: one OnSurface-based overlay
            // token across checked + unchecked (the alpha is low enough
            // that the delta over the Primary fill is negligible).
            Border x:name="PART_StateLayer"
                [ Fill   = #00000000,
                  CornerRadius = @ShapeSmall,
                  Padding      = (16,8,16,8) ] {
                ContentPresenter
            }
        }
        when ( IsChecked ) {
            PART_Border.Fill = @Primary;
            PART_Border.Stroke = Pen [ Brush = @PrimaryPress ];
        }
        when ( IsMouseOver ) { PART_StateLayer.Fill = @StateHoverOverlay; }
        when ( IsPressed ) { PART_StateLayer.Fill = @StatePressOverlay; }
    }

    // The Style owns the chrome Template plus the content-ink flip.
    // Unchecked content reads @OnSurface (over the Surface fill);
    // checked flips to @OnPrimary so the label stays legible over the
    // Primary fill the template swaps in. Foreground rides the inherited
    // TextBlock.Foreground attached property so the slotted B/I/U labels
    // pick it up through the ContentPresenter — the labels MUST NOT set
    // Foreground locally or they'd mask this cascade. Same pattern as the
    // framework IconButtonToggle Style.
    Style x:key="StyleToggle" [TargetType = ToggleButton] {
        Template = @ToggleChromeTemplate;
        TextBlock.Foreground = @OnSurface;
        when ( IsChecked ) { TextBlock.Foreground = @OnPrimary; }
    }

    DataTemplate [DataType = ToggleButtonVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "ToggleButton — IsChecked flips on click; TwoWay binding keeps the VM in sync.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (16,16,16,16) ] {
                    // Three style toggles — IsChecked bound TwoWay so a
                    // click on the button flips the VM DP, and a VM-side
                    // write would flip the button chrome back.
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,16) ] {
                        ToggleButton
                            [ Style     = @StyleToggle,
                              IsChecked = $IsBold,
                              Margin    = (0,0,8,0) ] {
                            TextBlock [ Text = "B", FontWeight = Bold ]
                        }
                        ToggleButton
                            [ Style     = @StyleToggle,
                              IsChecked = $IsItalic,
                              Margin    = (0,0,8,0) ] {
                            TextBlock [ Text = "I", FontStyle = Italic ]
                        }
                        ToggleButton [ Style = @StyleToggle, IsChecked = $IsUnderline ] {
                            TextBlock [ Text = "U", FontWeight = Bold ]
                        }
                    }

                    // Preview row — uses TextBlock binding directly off
                    // the VM's PreviewText; FontWeight / FontStyle are
                    // bound through value converters in a richer demo,
                    // but for v1 the demo just shows the state as text.
                    Border
                        [ Fill      = @SurfaceContainerLow,
                          Padding         = (12,12,12,12),
                          Stroke     = Pen [ Brush = @Outline ] ] {
                        StackPanel [ Orientation = Vertical ] {
                            TextBlock
                                [ Text       = $PreviewText,
                                  FontSize   = 16,
                                  Foreground = @OnSurface ]
                            TextBlock
                                [ Text       = "(Bold / Italic / Underline DPs above drive this preview's chrome via TwoWay bindings.)",
                                  FontSize   = 11,
                                  Foreground = @OnSurfaceVariant,
                                  Margin     = (0,8,0,0) ]
                        }
                    }
                }
            }
        }
    }
}
