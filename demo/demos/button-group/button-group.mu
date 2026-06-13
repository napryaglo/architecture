import ButtonGroupVM from "./button-group-vm.mjs"

// button-group.mu — M3 ButtonGroup showcase. Hover-expand behaviour:
// the hovered button widens from BaseWidth toward HoverWidth; siblings
// shrink to absorb. PointerLeave returns the row to its resting layout.
//
// The 200ms tween is the M3 2024 spec default for action surfaces.
// Override DurationMs on the ButtonGroup to dial it.

resources ButtonGroupDemo {

    DataTemplate x:key="ButtonGroupTemplate" [DataType=ButtonGroupVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant, BorderThickness=(1)]{
            DockPanel{
                Border [DockPanel.Dock=Top,
                        Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock [Text="ButtonGroup — M3 2024 hover-expand row of action buttons. Hover a segment to see it widen as neighbours shrink in lockstep.",
                               FontSize=15, FontWeight=Bold,
                               Foreground=@OnPrimary]
                }

                StackPanel [Orientation=Vertical, Margin=(24,24,24,24)]{

                    TextBlock [Text="Edit actions",
                               FontWeight=Bold, FontSize=14,
                               Foreground=@OnSurface, Margin=(0,0,0,12)]

                    ButtonGroup [ BaseWidth      = 80,
                                  HoverWidth     = 130,
                                  Spacing        = 4,
                                  DurationMs     = 200,
                                  HorizontalAlignment = Left,
                                  Margin              = (0,0,0,24) ] {
                        Button [Variant=Tonal, Command=$UndoCommand]  { TextBlock[Text="Undo"]  }
                        Button [Variant=Tonal, Command=$RedoCommand]  { TextBlock[Text="Redo"]  }
                        Button [Variant=Tonal, Command=$CutCommand]   { TextBlock[Text="Cut"]   }
                        Button [Variant=Tonal, Command=$CopyCommand]  { TextBlock[Text="Copy"]  }
                        Button [Variant=Tonal, Command=$PasteCommand] { TextBlock[Text="Paste"] }
                    }

                    // Click-count readouts so the user can verify the
                    // Command wiring kept working under the hover layout.
                    StackPanel [Orientation=Horizontal, Margin=(0,0,0,8)]{
                        TextBlock [Text="Clicks — ", FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock [Text="Undo: ",    FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock [Text=$UndoClicks, FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock [Text="  Redo: ",  FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock [Text=$RedoClicks, FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock [Text="  Cut: ",   FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock [Text=$CutClicks,  FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock [Text="  Copy: ",  FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock [Text=$CopyClicks, FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                        TextBlock [Text="  Paste: ", FontSize=12, Foreground=@OnSurfaceVariant]
                        TextBlock [Text=$PasteClicks,FontSize=12, FontWeight=Bold, Foreground=@OnSurface]
                    }

                    TextBlock [Text="Try a different cadence",
                               FontWeight=Bold, FontSize=14,
                               Foreground=@OnSurface, Margin=(0,8,0,12)]

                    ButtonGroup [ BaseWidth      = 64,
                                  HoverWidth     = 96,
                                  Spacing        = 2,
                                  DurationMs     = 400,
                                  HorizontalAlignment = Left ] {
                        Button [Variant=Outlined] { TextBlock[Text="Reply"] }
                        Button [Variant=Outlined] { TextBlock[Text="Fwd"] }
                        Button [Variant=Outlined] { TextBlock[Text="Archive"] }
                        Button [Variant=Outlined] { TextBlock[Text="Trash"] }
                    }
                }
            }
        }
    }
}
