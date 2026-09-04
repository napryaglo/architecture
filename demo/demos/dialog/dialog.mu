import DialogDemoVM from "./dialog-vm.mjs"

// dialog.mu — M3 Dialog surface showcase, drawn INLINE. The Dialog control is
// just chrome (a ContentControl with Title / Content / Actions slots); its modal
// scrim lives OUTSIDE the template, so here we render it directly in the demo
// stage — over a dim backdrop, centred — rather than mounting it on the
// OverlayLayer as a popup. This makes the dialog's structure visible in place.
//
// What's exercised:
//   * Dialog.Title (headline), Dialog.Content (body slot, the child element),
//     Dialog.Actions (trailing action row — M3 Text/Filled Buttons).
//   * Inline placement over a scrim backdrop — no popup, no overlay mount.
//   * VM-driven open/close: the backdrop binds Visibility to $IsOpen; Cancel /
//     Delete dismiss (IsOpen=false) and record a Result; "Show dialog" re-opens
//     it. All state rides through Observable INPC bindings.

resources DialogDemo {
    // The dialog's trailing action row. A DP value can't be an element carrying
    // a `{ … }` child block, so the multi-button row lives here as a keyed
    // resource and the Dialog references it via `Actions = @DeleteDialogActions`.
    // Placed inside the dialog (under the VM DataContext), the $-command bindings
    // resolve against the DialogDemoVM.
    StackPanel x:key="DeleteDialogActions" [ Orientation = Horizontal, HorizontalAlignment = Right ] {
        Button [ Variant = Text, Command = $CancelCommand, Margin = (0,0,8,0) ] {
            TextBlock [ Text = "Cancel" ]
        }
        Button [ Variant = Filled, Command = $DeleteCommand ] {
            TextBlock [ Text = "Delete" ]
        }
    }

    DataTemplate [DataType = DialogDemoVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            DockPanel [ LastChildFill = true ] {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Dialog — M3 modal surface (Title · Content · Actions), drawn INLINE over a dim scrim (no popup).",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Controls + result read-out along the bottom.
                StackPanel [ DockPanel.Dock = Bottom, Orientation = Horizontal, Margin = (24,0,24,16), VerticalAlignment = Center ] {
                    Button [ Variant = Tonal, Command = $ShowCommand, Margin = (0,0,16,0) ] {
                        TextBlock [ Text = "Show dialog" ]
                    }
                    TextBlock
                        [ Text              = "Result: ",
                          FontSize          = 13,
                          Foreground        = @OnSurfaceVariant,
                          VerticalAlignment = Center ]
                    TextBlock
                        [ Text              = $Result,
                          FontSize          = 13,
                          FontWeight        = Bold,
                          Foreground        = @OnSurface,
                          VerticalAlignment = Center ]
                }

                // The stage — fills the remaining area. A dim scrim backdrop
                // (32% black) with the Dialog centred INLINE on top: one subtree,
                // so binding the backdrop's Visibility to $IsOpen collapses the
                // whole modal when an action dismisses it. No OverlayLayer, no
                // ClickAwayScrim — it is literally drawn in the example window.
                Border [ Fill = #52000000, Visibility = $IsOpen << ToVisibility ] {
                    Dialog
                        [ Title               = "Delete file?",
                          Width               = 360,
                          HorizontalAlignment = Center,
                          VerticalAlignment   = Center,
                          Actions             = @DeleteDialogActions ] {
                        TextBlock
                            [ Text         = "This permanently deletes report.pdf. This action can't be undone.",
                              TextWrapping = Wrap,
                              Foreground   = @OnSurfaceVariant ]
                    }
                }
            }
        }
    }
}
