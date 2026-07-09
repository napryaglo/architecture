// Default theme entries for the pickers family — DatePicker (§18.9).
// TimePicker joins this file as it lands.
//
// Merged into the root MuralFramework dictionary via an `import` clause
// in src/resources/framework.resources.mu.

resources Pickers {
    // ── DatePicker: M3 Docked calendar ─────────────────────────────
    // Header (prev | Month Year | next) over a weekday row and the day
    // grid the control (date-picker.ts) fills programmatically. The root
    // is a fixed 306dp so the 280dp content area divides into 7 × 40dp
    // columns — both the weekday header and PART_DayGrid stretch to that
    // width, keeping their columns aligned.
    Template x:key="DefaultDatePicker" [TargetType = DatePicker] {
        Border x:name="PART_Root"
            [ Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1),
              CornerRadius    = @ShapeMedium,
              Padding         = (@Spacing3,@Spacing3,@Spacing3,@Spacing3),
              Width           = 306 ] {
            StackPanel [ Orientation = Vertical ] {
                // Header — month navigation.
                DockPanel [ LastChildFill = true, Margin = (0,0,0,@Spacing2) ] {
                    IconButton x:name="PART_PrevButton" [ Variant = Standard, DockPanel.Dock = Left ] {
                        Shape [ Geometry = @ChevronLeft, Fill = @OnSurfaceVariant, Width = 18, Height = 18 ]
                    }
                    IconButton x:name="PART_NextButton" [ Variant = Standard, DockPanel.Dock = Right ] {
                        Shape [ Geometry = @ChevronRight, Fill = @OnSurfaceVariant, Width = 18, Height = 18 ]
                    }
                    TextBlock x:name="PART_MonthLabel"
                        [ Text                = "",
                          Style               = @TitleSmall,
                          Foreground          = @OnSurface,
                          HorizontalAlignment = Center,
                          VerticalAlignment   = Center ]
                }
                // Weekday initials, Sunday-first (matches the grid's
                // FirstColumn = 1st-of-month weekday).
                UniformGrid [ Columns = 7 ] {
                    TextBlock [ Text = "S", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                    TextBlock [ Text = "M", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                    TextBlock [ Text = "T", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                    TextBlock [ Text = "W", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                    TextBlock [ Text = "T", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                    TextBlock [ Text = "F", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                    TextBlock [ Text = "S", Style = @LabelSmall, Foreground = @OnSurfaceVariant, HorizontalAlignment = Center ]
                }
                // Day cells — built by the control.
                UniformGrid x:name="PART_DayGrid" [ Columns = 7 ]
            }
        }
    }
    Style [TargetType = DatePicker] {
        Template = @DefaultDatePicker;
    }
}
