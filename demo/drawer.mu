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
//     options" button sets `OptionsOpen=true`; the host page wires a
//     Closed listener so a scrim click reflects back into the VM.
//
// Both variants share the same DataContext so a single VM drives them.
// The DockPanel docks Top (header) then Left (nav drawer) then Left
// (temporary drawer — size 0, no flow contribution); the remaining
// slot is the main body via LastChildFill.

Application{
    resources: {
        @paper      = #ffffff
        @ink        = #1f2937
        @hint       = #6b7280
        @hairline   = #e2e8f0
        @primary    = #1976d2
        @primaryInk = #ffffff
        @nav        = #f8fafc
        @navHover   = #e2e8f0

        // Border root — stretches to whatever rectangle the host hands
        // it (HtmlTarget directly, or a PageView slot in the demo
        // platform). No fixed Width / Height; the demo body scales
        // with the surface.
        Border x:root [Background=@paper, BorderBrush=@hairline,
                       BorderThickness=(1)]{

            DockPanel {

                // ── Header bar (Top) ───────────────────────────
                Border[DockPanel.Dock=Top, Height=56,
                       Background=@primary,
                       BorderThickness=(0,0,0,0)]{
                    StackPanel[Orientation=Horizontal]{
                        Button[Width=44, Command=$ToggleNav]{
                            TextBlock[Text="≡", FontSize=20]
                        }
                        TextBlock[Text="Drawer demo",
                                  FontSize=18, FontWeight=Bold,
                                  Foreground=@primaryInk,
                                  Margin=(16,16,0,0)]
                    }
                }

                // ── Persistent left drawer (Left) ──────────────
                Drawer[DockPanel.Dock=Left,
                       Variant=Persistent, Anchor=Left,
                       DrawerSize=200, RailSize=56,
                       IsOpen=$NavOpen]{
                    Border[Background=@nav,
                           BorderThickness=(0,0,1,0),
                           BorderBrush=@hairline]{
                        StackPanel{
                            TextBlock[Text="🏠",
                                      FontSize=18,
                                      Margin=(20,16,0,0)]
                            TextBlock[Text="📊",
                                      FontSize=18,
                                      Margin=(20,16,0,0)]
                            TextBlock[Text="⚙",
                                      FontSize=18,
                                      Margin=(20,16,0,0)]
                        }
                    }
                }

                // ── Temporary right drawer (out of flow) ───────
                // Variant=Temporary reports 0 in flow regardless
                // of Dock; placing it before the body keeps the
                // body as the DockPanel's LastChildFill slot.
                Drawer[Variant=Temporary, Anchor=Right,
                       DrawerSize=320, IsOpen=$OptionsOpen]{
                    Border[Background=@paper,
                           BorderThickness=(1,0,0,0),
                           BorderBrush=@hairline,
                           Padding=(24)]{
                        StackPanel{
                            TextBlock[Text="Options",
                                      FontSize=20, FontWeight=Bold,
                                      Foreground=@ink]
                            TextBlock[Text="Drag the slider, flip the
                                            toggles, pick a colour.
                                            Click outside to dismiss.",
                                      TextWrapping=Wrap,
                                      FontSize=12, Foreground=@hint,
                                      Margin=(0,8,0,0)]
                            Button[Command=$CloseOptions,
                                   Margin=(0,24,0,0), Width=120]{
                                TextBlock[Text="Close"]
                            }
                        }
                    }
                }

                // ── Main body (fills via LastChildFill) ────────
                Border[Background=@paper, Padding=(24)]{
                    StackPanel{
                        TextBlock[Text="The left drawer is Persistent —
                                        the rail is always visible (56
                                        DIPs); the header button toggles
                                        the pane open / closed (200 DIPs).",
                                  TextWrapping=Wrap,
                                  FontSize=13, Foreground=@ink]

                        Button[Command=$OpenOptions, Width=180,
                               Margin=(0,16,0,0)]{
                            TextBlock[Text="Open options →"]
                        }

                        TextBlock[Text="The Options pane is Temporary —
                                        it mounts onto the overlay layer
                                        with a click-away scrim. Click
                                        the scrim or the Close button to
                                        dismiss.",
                                  TextWrapping=Wrap,
                                  FontSize=12, Foreground=@hint,
                                  Margin=(0,16,0,0)]
                    }
                }
            }
        }
    }
}
