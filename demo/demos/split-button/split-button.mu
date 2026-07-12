import SplitButtonVM from "./split-button-vm.mjs"

// split-button.mu — M3 SplitButton showcase.
//
// Primary half fires SendCommand; chevron half toggles IsOpen → mounts
// MenuContent on the OverlayLayer. The popup body in this demo is a
// vertical StackPanel of Button rows that each fire a VM command and
// clear IsOpen so the popup auto-closes.
//
// MenuContent is set via an Element binding rather than a literal
// subtree so the popup Border can be authored in markup (with rich M3
// chrome) while SplitButton's class still owns the mount lifecycle.

resources SplitButtonDemo {
    DataTemplate [DataType = SplitButtonVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                Border [ DockPanel.Dock = Top, Background = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "SplitButton — M3 dual-target chrome. Primary fires Command; chevron toggles a dropdown.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    TextBlock
                        [ Text       = "Send email",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,12) ]

                    SplitButton
                        [ Command             = $SendCommand,
                          IsOpen              = $IsOpen,
                          MenuContent         = $MenuPopup,
                          HorizontalAlignment = Left,
                          Margin              = (0,0,0,24) ] {
                        TextBlock [ Text = "Send" ]
                    }

                    // Read-outs so the user can verify both halves of
                    // the control are firing through to the VM.
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,4) ] {
                        TextBlock
                            [ Text       = "Primary clicks: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $SendCount,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                    StackPanel [ Orientation = Horizontal, Margin = (0,0,0,4) ] {
                        TextBlock
                            [ Text       = "Last menu action: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $MenuActionTaken,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                    StackPanel [ Orientation = Horizontal ] {
                        TextBlock
                            [ Text       = "IsOpen: ",
                              FontSize   = 12,
                              Foreground = @OnSurfaceVariant ]
                        TextBlock
                            [ Text       = $IsOpen,
                              FontSize   = 12,
                              FontWeight = Bold,
                              Foreground = @OnSurface ]
                    }
                }
            }
        }
    }
}
