import AnimationTriggersVM from "./animation-triggers-vm.mjs"

// animation-triggers.mu — declarative trigger-action showcase covering
// the advanced shapes:
//
//   * `when() { on enter / on exit }` — animate on a property-trigger
//     edge (hover IN → fade up; hover OUT → fade back). Setters and
//     actions coexist in the same when() block.
//   * `on Loaded { … }` — fire once when a Visual first attaches to a
//     target. Useful for entry animations that run without any user
//     interaction.
//   * `Storyboard.TargetName=...` — animate a SIBLING Visual rather
//     than the firing Button. Resolved via FindName at trigger-fire
//     time, falling back to the firing Visual when the name doesn't
//     resolve.
//
// Packaged as a DataTemplate keyed off AnimationTriggersVM; the implicit
// Button style lives in the template root's local resources so it
// scopes to this demo only.

resources AnimationTriggersDemo {
    DataTemplate [DataType = AnimationTriggersVM] {
        Border x:root
            [ Fill      = @Surface,
              Stroke     = Pen [ Brush = @OutlineVariant ] ] {
            // x:root marks this Border as the NameScope owner so the
            // inner `x:name="banner"` / `x:name="bannerBtn"` registrations
            // resolve via FindName at trigger-fire time.
            resources: {
                // PropertyTrigger enter/exit actions — hover edges
                // trigger setters AND storyboards together. Every
                // Button in this template's subtree picks it up.
                Style [TargetType = Button] {
                    on Loaded {
                        BeginStoryboard { DoubleAnimation [TargetProperty = Width, From = 60, To = 140, Duration = 500] }
                    }
                    on Click {
                        BeginStoryboard { DoubleAnimation [TargetName = banner, TargetProperty = Width, From = 80, To = 320, Duration = 500] }
                    }
                    when ( IsMouseOver ) {
                        on enter {
                            BeginStoryboard { DoubleAnimation [TargetProperty = Height, To = 36, Duration = 180] }
                        }
                        on exit {
                            BeginStoryboard { DoubleAnimation [TargetProperty = Height, To = 28, Duration = 180] }
                        }
                    }
                }
            }
            DockPanel {
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Trigger actions — enter/exit, Loaded, TargetName",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (20,24,20,20) ] {
                    // Hover row: each Button auto-grows on Loaded, then
                    // grows taller on hover-enter and shrinks on
                    // hover-exit (the implicit style provides both).
                    StackPanel [ Orientation = Vertical, Margin = (0,0,0,28) ] {
                        TextBlock
                            [ Text       = "Hover an entry — `when(IsMouseOver) { on enter / on exit }` drives Height.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        StackPanel [ Orientation = Vertical ] {
                            Button [ Height = 28, Margin = (0,0,0,6) ] {
                                TextBlock [ Text = "Hover me" ]
                            }
                            Button [ Height = 28, Margin = (0,0,0,6) ] {
                                TextBlock [ Text = "Hover me too" ]
                            }
                            Button [ Height = 28, Margin = (0,0,0,6) ] {
                                TextBlock [ Text = "And me" ]
                            }
                        }
                        TextBlock
                            [ Text       = "On first mount the same buttons run the Loaded storyboard — Width grows from 60 to 140.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,12,0,0) ]
                    }

                    // TargetName row: clicking the Button animates a
                    // NAMED sibling Border. The animation's
                    // TargetName=banner field resolves to whichever
                    // descendant of the template root carries
                    // `x:name="banner"`.
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "`TargetName=banner` redirects the storyboard target to the named sibling Border.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        Button x:name="bannerBtn" [ Width = 200, Height = 28, Margin = (0,0,0,12) ] {
                            TextBlock [ Text = "Animate banner" ]
                        }
                        Border x:name="banner"
                            [ Fill   = #ff9800,
                              Width        = 80,
                              Height       = 20,
                              CornerRadius = 4 ]
                    }
                }
            }
        }
    }
}
