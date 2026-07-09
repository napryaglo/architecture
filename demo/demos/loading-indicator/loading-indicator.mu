import LoadingIndicatorVM from "./loading-indicator-vm.mjs"

// loading-indicator.mu — M3 2024 LoadingIndicator showcase. Two variants
// side by side (ActiveIndicator on a transparent ground, Contained on a
// filled circle), both bound to the VM's shared IsActive flag so a single
// Pause/Resume button starts and stops the shared spin. The headline trait
// is the variable-amplitude oscillation: the @Primary arc rotates
// continuously while its sweep grows and shrinks — distinct from
// ProgressIndicator's constant-length ring.
//
// Theme swap — the arc's @Primary and the Contained circle's
// @SurfaceContainerHighest ride DynamicResource, so light ↔ dark re-tint
// live. The spin itself is owned by the control (a looping Storyboard on
// the shared animation clock), not the template.

resources LoadingIndicatorDemo {
    DataTemplate x:key="LoadingIndicatorTemplate" [DataType = LoadingIndicatorVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            StackPanel [ Orientation = Vertical, Margin = (32,32,32,32) ] {
                TextBlock
                    [ Text       = "LoadingIndicator — M3's \"still working\" spinner (variable-amplitude sweep)",
                      Style      = @TitleMedium,
                      Foreground = @OnSurface,
                      Margin     = (0,0,0,8) ]
                TextBlock
                    [ Text         = "A single @Primary arc rotates while its sweep grows and shrinks — the M3 2024 loading affordance, distinct from ProgressIndicator's fixed ring.",
                      Style        = @BodyMedium,
                      Foreground   = @OnSurfaceVariant,
                      TextWrapping = Wrap,
                      Margin       = (0,0,0,32) ]

                StackPanel [ Orientation = Horizontal, Margin = (0,0,0,32) ] {
                    // ActiveIndicator — bare arc.
                    StackPanel [ Orientation = Vertical, Margin = (0,0,64,0) ] {
                        LoadingIndicator
                            [ Variant             = ActiveIndicator,
                              IsActive            = $IsActive,
                              HorizontalAlignment = Center ]
                        TextBlock
                            [ Text                = "Active indicator",
                              Style               = @LabelMedium,
                              Foreground          = @OnSurfaceVariant,
                              HorizontalAlignment = Center,
                              Margin              = (0,16,0,0) ]
                    }
                    // Contained — arc on a filled circle.
                    StackPanel [ Orientation = Vertical ] {
                        LoadingIndicator
                            [ Variant             = Contained,
                              IsActive            = $IsActive,
                              HorizontalAlignment = Center ]
                        TextBlock
                            [ Text                = "Contained",
                              Style               = @LabelMedium,
                              Foreground          = @OnSurfaceVariant,
                              HorizontalAlignment = Center,
                              Margin              = (0,16,0,0) ]
                    }
                }

                // Pause / Resume — flips the shared IsActive; the label
                // tracks the current state.
                Button
                    [ Variant             = Filled,
                      Command             = $Toggle,
                      HorizontalAlignment = Left ] {
                    TextBlock [ Text = $ToggleLabel ]
                }
            }
        }
    }
}
