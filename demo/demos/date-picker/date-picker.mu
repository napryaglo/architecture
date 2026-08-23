import DatePickerVM from "./date-picker-vm.mjs"

// date-picker.mu — M3 Docked DatePicker showcase. The calendar body pages
// months with the header chevrons; clicking a day sets SelectedDate, which
// binds TwoWay onto the VM and echoes through SelectedLabel.
//
// Theme swap — the calendar's @Surface chrome, @OnSurface day ink, and the
// selected-day @Primary fill (resolved by the control per rebuild) all ride
// the active scheme.

resources DatePickerDemo {
    DataTemplate [DataType = DatePickerVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ] ] {
            StackPanel [ Orientation = Vertical, Margin = (32,32,32,32) ] {
                TextBlock
                    [ Text       = "DatePicker — M3 Docked calendar (month paging + day selection)",
                      Style      = @TitleMedium,
                      Foreground = @OnSurface,
                      Margin     = (0,0,0,24) ]

                DatePicker
                    [ SelectedDate       = $SelectedDate,
                      HorizontalAlignment = Left ]

                StackPanel [ Orientation = Horizontal, Margin = (0,24,0,0) ] {
                    TextBlock
                        [ Text              = "Selected: ",
                          Style             = @BodyMedium,
                          Foreground        = @OnSurfaceVariant,
                          VerticalAlignment = Center ]
                    TextBlock
                        [ Text              = $SelectedLabel,
                          Style             = @BodyMedium,
                          FontWeight        = Bold,
                          Foreground        = @OnSurface,
                          VerticalAlignment = Center ]
                }
            }
        }
    }
}
