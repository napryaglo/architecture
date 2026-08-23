import TimePickerVM from "./time-picker-vm.mjs"

// time-picker.mu — M3 analog TimePicker showcase. The dial pages between
// the hour and minute rings (click the digital HH or MM), AM/PM flips the
// meridiem, and Hour/Minute bind TwoWay onto the VM — echoed as a 12h label.
//
// Theme swap — the @SurfaceContainerHighest dial, @OnSurface numerals, and
// the @Primary hand / selection fill (resolved by the control per rebuild)
// track the active scheme.

resources TimePickerDemo {
    DataTemplate [DataType = TimePickerVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            StackPanel [ Orientation = Vertical, Margin = (32,32,32,32) ] {
                TextBlock
                    [ Text       = "TimePicker — M3 analog clock dial (hour / minute rings + AM/PM)",
                      Style      = @TitleMedium,
                      Foreground = @OnSurface,
                      Margin     = (0,0,0,24) ]

                TimePicker
                    [ Hour               = $Hour,
                      Minute             = $Minute,
                      HorizontalAlignment = Left ]

                StackPanel [ Orientation = Horizontal, Margin = (0,24,0,0) ] {
                    TextBlock
                        [ Text              = "Selected: ",
                          Style             = @BodyMedium,
                          Foreground        = @OnSurfaceVariant,
                          VerticalAlignment = Center ]
                    TextBlock
                        [ Text              = $TimeLabel,
                          Style             = @BodyMedium,
                          FontWeight        = Bold,
                          Foreground        = @OnSurface,
                          VerticalAlignment = Center ]
                }
            }
        }
    }
}
