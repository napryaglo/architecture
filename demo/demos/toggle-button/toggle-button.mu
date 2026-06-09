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
    // default Background; the IsChecked trigger overrides to Primary
    // at TriggerValue tier (which sits above LocalValue under mural's
    // priority order — see effective-value.ts). Same TargetedSetter
    // pattern the default ListBoxItem template uses.
    Template x:key="ToggleChromeTemplate" [TargetType=ToggleButton] {
        Border x:name="PART_Border" [
            Background      = @Surface,
            BorderBrush     = @Outline,
            BorderThickness = (1),
            CornerRadius    = @ShapeSmall,
            Padding         = (16,8,16,8)
        ] {
            ContentPresenter
        }
        when ( IsChecked ) {
            PART_Border.Background  = @Primary;
            PART_Border.BorderBrush = @PrimaryPress;
        }
    }

    // The Style itself becomes a thin shell — Template setter only.
    // Each ToggleButton picks up the chrome via Style=@StyleToggle.
    Style x:key="StyleToggle" [TargetType=ToggleButton] {
        Template = @ToggleChromeTemplate;
    }

    DataTemplate x:key="ToggleButtonTemplate" [DataType=ToggleButtonVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{

            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="ToggleButton — IsChecked flips on click; TwoWay binding keeps the VM in sync.",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                StackPanel[Orientation=Vertical, Margin=(16,16,16,16)]{

                    // Three style toggles — IsChecked bound TwoWay so a
                    // click on the button flips the VM DP, and a VM-side
                    // write would flip the button chrome back.
                    StackPanel[Orientation=Horizontal, Margin=(0,0,0,16)]{
                        ToggleButton[Style=@StyleToggle, IsChecked=$IsBold,    Margin=(0,0,8,0)]{
                            TextBlock[Text="B", FontWeight=Bold,
                                      Foreground=@OnSurface]
                        }
                        ToggleButton[Style=@StyleToggle, IsChecked=$IsItalic, Margin=(0,0,8,0)]{
                            TextBlock[Text="I", FontStyle=Italic,
                                      Foreground=@OnSurface]
                        }
                        ToggleButton[Style=@StyleToggle, IsChecked=$IsUnderline]{
                            TextBlock[Text="U", FontWeight=Bold,
                                      Foreground=@OnSurface]
                        }
                    }

                    // Preview row — uses TextBlock binding directly off
                    // the VM's PreviewText; FontWeight / FontStyle are
                    // bound through value converters in a richer demo,
                    // but for v1 the demo just shows the state as text.
                    Border[Background=@SurfaceContainerLow, Padding=(12,12,12,12),
                           BorderBrush=@Outline, BorderThickness=(1)]{
                        StackPanel[Orientation=Vertical]{
                            TextBlock[Text=$PreviewText, FontSize=16,
                                      Foreground=@OnSurface]
                            TextBlock[Text="(Bold / Italic / Underline DPs above drive this preview's chrome via TwoWay bindings.)",
                                      FontSize=11, Foreground=@OnSurfaceVariant,
                                      Margin=(0,8,0,0)]
                        }
                    }
                }
            }
        }
    }
}
