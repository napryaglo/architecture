import DrawerVM from "./drawer-vm.mjs"

// drawer.mu — Drawer demo wiring a Persistent left nav rail and a
// Temporary right options pane through a single DockPanel host.
//
// Two drawers, two interaction patterns:
//
//   * Persistent left drawer — rail (56 DIPs) when closed, full pane
//     (200 DIPs) when open. The header's `≡` button toggles the
//     view-model's `NavOpen` which OneWay-binds into IsOpen.
//
//   * Temporary right drawer — out of flow when closed; mounts a scrim
//     + 300 DIP pane onto the overlay layer when IsOpen=true. The "Open
//     options" button sets `OptionsOpen=true`; the VM's OnViewMounted
//     wires a Closed listener so a scrim click reflects back into
//     OptionsOpen.
//
// Packaged as a DataTemplate keyed off DrawerVM. The DockPanel docks
// Top (header) then Left (nav drawer) then Left (temporary drawer —
// size 0, no flow contribution); the remaining slot is the main body
// via LastChildFill.

resources DrawerDemo {
    DataTemplate [DataType = DrawerVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                // ── Header bar (Top) ───────────────────────────
                Border
                    [ DockPanel.Dock  = Top,
                      Height          = 56,
                      Background      = @Primary,
                      BorderThickness = (0,0,0,0) ] {
                    StackPanel [ Orientation = Horizontal ] {
                        Button [ Width = 44, Command = $ToggleNav ] {
                            TextBlock [ Text = "≡", FontSize = 20 ]
                        }
                        TextBlock
                            [ Text       = "Drawer demo",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary,
                              Margin     = (16,16,0,0) ]
                    }
                }

                // ── Persistent left drawer (Left) ──────────────
                Drawer
                    [ DockPanel.Dock = Left,
                      Variant        = Persistent,
                      Anchor         = Left,
                      DrawerSize     = 200,
                      RailSize       = 56,
                      IsOpen         = $NavOpen ] {
                    Border
                        [ Background      = @SurfaceContainerLow,
                          BorderThickness = (0,0,1,0),
                          BorderBrush     = @OutlineVariant ] {
                        StackPanel {
                            TextBlock [ Text = "🏠", FontSize = 18, Margin = (20,16,0,0) ]
                            TextBlock [ Text = "📊", FontSize = 18, Margin = (20,16,0,0) ]
                            TextBlock [ Text = "⚙", FontSize = 18, Margin = (20,16,0,0) ]
                        }
                    }
                }

                // ── Temporary right drawer (out of flow) ───────
                // Variant=Temporary reports 0 in flow regardless
                // of Dock; placing it before the body keeps the
                // body as the DockPanel's LastChildFill slot.
                Drawer
                    [ Variant    = Temporary,
                      Anchor     = Right,
                      DrawerSize = 320,
                      IsOpen     = $OptionsOpen ] {
                    Border
                        [ Background      = @Surface,
                          BorderThickness = (1,0,0,0),
                          BorderBrush     = @OutlineVariant,
                          Padding         = (24) ] {
                        StackPanel {
                            TextBlock
                                [ Text       = "Options",
                                  FontSize   = 20,
                                  FontWeight = Bold,
                                  Foreground = @OnSurface ]
                            TextBlock
                                [ Text         = "Drag the slider, flip the\n                                            toggles, pick a colour.\n                                            Click outside to dismiss.",
                                  TextWrapping = Wrap,
                                  FontSize     = 12,
                                  Foreground   = @OnSurfaceVariant,
                                  Margin       = (0,8,0,0) ]
                            Button [ Command = $CloseOptions, Margin = (0,24,0,0), Width = 120 ] {
                                TextBlock [ Text = "Close" ]
                            }
                        }
                    }
                }

                // ── Main body (fills via LastChildFill) ────────
                Border [ Background = @Surface, Padding = (24) ] {
                    StackPanel {
                        TextBlock
                            [ Text         = "The left drawer is Persistent —\n                                        the rail is always visible (56\n                                        DIPs); the header button toggles\n                                        the pane open / closed (200 DIPs).",
                              TextWrapping = Wrap,
                              FontSize     = 13,
                              Foreground   = @OnSurface ]

                        Button [ Command = $OpenOptions, Width = 180, Margin = (0,16,0,0) ] {
                            TextBlock [ Text = "Open options →" ]
                        }

                        TextBlock
                            [ Text         = "The Options pane is Temporary —\n                                        it mounts onto the overlay layer\n                                        with a click-away scrim. Click\n                                        the scrim or the Close button to\n                                        dismiss.",
                              TextWrapping = Wrap,
                              FontSize     = 12,
                              Foreground   = @OnSurfaceVariant,
                              Margin       = (0,16,0,0) ]
                    }
                }
            }
        }
    }
}
