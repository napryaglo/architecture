import CardVM from "./card-vm.mjs"

// card.mu — M3 Card showcase. Three cards side by side (Filled,
// Elevated, Outlined) each with a title, body text, and an action
// button so the dynamic-binding chain through CardVM is visible.
//
// What's exercised:
//   * Card with each Variant value — Background, BorderThickness, and
//     resting Effect differ per variant; hover bumps Effect +1 and
//     composites a state-layer overlay; press lowers Effect back.
//   * Title typography (@TitleMediumXxx) and body typography
//     (@BodyMediumXxx) ride through the M3 atomic tokens.
//   * Theme swap (alongside ThemeSelector) — every brush rides through
//     DynamicResource so light ↔ dark re-tints live.
//   * Card.Content as a StackPanel — the slot accepts any Visual, not
//     just a single TextBlock.

resources CardDemo {
    DataTemplate x:key="CardTemplate" [DataType = CardVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Card — M3's content container. Three variants vary container colour, border, and resting elevation.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    TextBlock
                        [ Text       = "Card — Variant: Filled / Elevated / Outlined",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,16) ]

                    // Row of 3 cards, each 240dp wide with consistent
                    // header / body / action layout so the variant
                    // chrome differences are the only thing changing.
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,16) ] {
                        Card [ Variant = Filled, Width = 240, Margin = (0,0,24,0) ] {
                            StackPanel [ Orientation = Vertical ] {
                                TextBlock
                                    [ Text       = "Filled",
                                      FontFamily = @TitleMediumFont,
                                      FontWeight = @TitleMediumWeight,
                                      FontSize   = @TitleMediumSize,
                                      LineHeight = @TitleMediumLineHeight,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,8) ]
                                TextBlock
                                    [ Text         = "SurfaceContainerHighest base, no border, no resting elevation. Hover bumps to Level1.",
                                      FontFamily   = @BodyMediumFont,
                                      FontSize     = @BodyMediumSize,
                                      LineHeight   = @BodyMediumLineHeight,
                                      Foreground   = @OnSurfaceVariant,
                                      TextWrapping = Wrap,
                                      Margin       = (0,0,0,16) ]
                                Button
                                    [ Variant             = Text,
                                      Command             = $FilledActionCommand,
                                      HorizontalAlignment = Left ] {
                                    TextBlock [ Text = "Action" ]
                                }
                            }
                        }

                        Card [ Variant = Elevated, Width = 240, Margin = (0,0,24,0) ] {
                            StackPanel [ Orientation = Vertical ] {
                                TextBlock
                                    [ Text       = "Elevated",
                                      FontFamily = @TitleMediumFont,
                                      FontWeight = @TitleMediumWeight,
                                      FontSize   = @TitleMediumSize,
                                      LineHeight = @TitleMediumLineHeight,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,8) ]
                                TextBlock
                                    [ Text         = "SurfaceContainerLow base, no border, resting ElevationLevel1. Hover bumps to Level2.",
                                      FontFamily   = @BodyMediumFont,
                                      FontSize     = @BodyMediumSize,
                                      LineHeight   = @BodyMediumLineHeight,
                                      Foreground   = @OnSurfaceVariant,
                                      TextWrapping = Wrap,
                                      Margin       = (0,0,0,16) ]
                                Button
                                    [ Variant             = Text,
                                      Command             = $ElevatedActionCommand,
                                      HorizontalAlignment = Left ] {
                                    TextBlock [ Text = "Action" ]
                                }
                            }
                        }

                        Card [ Variant = Outlined, Width = 240 ] {
                            StackPanel [ Orientation = Vertical ] {
                                TextBlock
                                    [ Text       = "Outlined",
                                      FontFamily = @TitleMediumFont,
                                      FontWeight = @TitleMediumWeight,
                                      FontSize   = @TitleMediumSize,
                                      LineHeight = @TitleMediumLineHeight,
                                      Foreground = @OnSurface,
                                      Margin     = (0,0,0,8) ]
                                TextBlock
                                    [ Text         = "Surface base, 1-DIP Outline border, no resting elevation. Hover bumps to Level1.",
                                      FontFamily   = @BodyMediumFont,
                                      FontSize     = @BodyMediumSize,
                                      LineHeight   = @BodyMediumLineHeight,
                                      Foreground   = @OnSurfaceVariant,
                                      TextWrapping = Wrap,
                                      Margin       = (0,0,0,16) ]
                                Button
                                    [ Variant             = Text,
                                      Command             = $OutlinedActionCommand,
                                      HorizontalAlignment = Left ] {
                                    TextBlock [ Text = "Action" ]
                                }
                            }
                        }
                    }

                    // Action-click read-out
                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = "Actions — Filled: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $FilledActions,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Elevated: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $ElevatedActions,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                        TextBlock
                            [ Text       = "  Outlined: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $OutlinedActions,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
