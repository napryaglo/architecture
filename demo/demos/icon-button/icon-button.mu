import IconButtonVM from "./icon-button-vm.mjs"

// icon-button.mu — M3 IconButton + IconButtonToggle showcase. Two rows
// of four chromes each, plus a live click tally + checked-state preview.
//
// What's exercised:
//   * IconButton with each of the four Variant values (Filled / Tonal /
//     Outlined / Standard) — 40×40 chrome, glyph cascades through
//     TextBlock.Foreground.
//   * IconButtonToggle with the same four variants — IsChecked flips
//     Background per variant; the Style-level multi-condition triggers
//     flip TextBlock.Foreground.
//   * Theme swap (run alongside ThemeSelector) — every brush rides
//     through DynamicResource so light ↔ dark re-tints live.
//   * Command DP wiring — each non-toggle button increments its
//     per-variant click counter through a RelayCommand on the VM.
//   * IsChecked TwoWay binding — clicking a toggle flips the bound
//     VM DP; the chrome reflects the new state via the IsChecked
//     trigger.

resources IconButtonDemo {

    DataTemplate x:key="IconButtonTemplate" [DataType=IconButtonVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="IconButton — M3's compact square button. Four variants drive the chrome via Button.Variant.",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                StackPanel[Orientation=Vertical, Margin=(24,24,24,24)]{

                    // ── Row 1: IconButton (non-toggle) ────────────────
                    TextBlock[Text="IconButton — Variant: Filled / Tonal / Outlined / Standard",
                              FontWeight=Bold, FontSize=14,
                              Foreground=@OnSurface, Margin=(0,0,0,12)]

                    StackPanel[Orientation=Horizontal, Margin=(0,0,0,8)]{
                        IconButton[Variant=Filled,   Command=$ClickFilledCommand,   Margin=(0,0,16,0)]{
                            TextBlock[Text="✓", FontSize=18]
                        }
                        IconButton[Variant=Tonal,    Command=$ClickTonalCommand,    Margin=(0,0,16,0)]{
                            TextBlock[Text="★", FontSize=18]
                        }
                        IconButton[Variant=Outlined, Command=$ClickOutlinedCommand, Margin=(0,0,16,0)]{
                            TextBlock[Text="↗", FontSize=18]
                        }
                        IconButton[Variant=Standard, Command=$ClickStandardCommand]{
                            TextBlock[Text="⋯", FontSize=18]
                        }
                    }

                    // Click-count read-out
                    StackPanel[Orientation=Horizontal, Margin=(0,0,0,24)]{
                        TextBlock[Text="Clicks — Filled: ", FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$FilledClicks,        FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Tonal: ",          FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$TonalClicks,         FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Outlined: ",       FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$OutlinedClicks,      FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Standard: ",       FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$StandardClicks,      FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                    }

                    // ── Row 2: IconButtonToggle ───────────────────────
                    TextBlock[Text="IconButtonToggle — same Variant set; IsChecked flips Background + glyph ink.",
                              FontWeight=Bold, FontSize=14,
                              Foreground=@OnSurface, Margin=(0,0,0,12)]

                    StackPanel[Orientation=Horizontal, Margin=(0,0,0,8)]{
                        IconButtonToggle[Variant=Filled,   IsChecked=$FilledChecked,   Margin=(0,0,16,0)]{
                            TextBlock[Text="♥", FontSize=18]
                        }
                        IconButtonToggle[Variant=Tonal,    IsChecked=$TonalChecked,    Margin=(0,0,16,0)]{
                            TextBlock[Text="☆", FontSize=18]
                        }
                        IconButtonToggle[Variant=Outlined, IsChecked=$OutlinedChecked, Margin=(0,0,16,0)]{
                            TextBlock[Text="🔔", FontSize=18]
                        }
                        IconButtonToggle[Variant=Standard, IsChecked=$StandardChecked]{
                            TextBlock[Text="🌙", FontSize=18]
                        }
                    }

                    // Toggle-state read-out
                    StackPanel[Orientation=Horizontal]{
                        TextBlock[Text="Checked — Filled: ", FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$FilledChecked,        FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Tonal: ",           FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$TonalChecked,         FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Outlined: ",        FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$OutlinedChecked,      FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock[Text="  Standard: ",        FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock[Text=$StandardChecked,      FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                    }
                }
            }
        }
    }
}
