import AnimationVM from "./animation-vm.mjs"

// animation.mu — animation engine showcase.
//
// Five rows demonstrating the dimensions we ship:
//   * Slide       — single From/To DoubleAnimation on Width with
//                   CubicOut easing.
//   * Bounce loop — RepeatBehavior=Infinity + AutoReverse on Width;
//                   QuadInOut easing.
//   * Pulse      — ThicknessAnimationUsingKeyFrames walks Padding
//                   through three waypoints.
//   * Colour fade — SolidColorBrushAnimation, cubic-bezier easing.
//   * Bezier      — two curves side-by-side (linear vs. overshoot).
//
// All wiring is on AnimationVM.OnViewMounted (FindName + AddClickHandler
// for each row). Trigger-action equivalents live in
// animation-declarative.mu / animation-named.mu / animation-triggers.mu.
//
// Packaged as a DataTemplate keyed off AnimationVM.

resources AnimationDemo {
    DataTemplate [DataType = AnimationVM] {
        Border x:root
            [ Fill      = @Surface,
              Stroke     = Pen [ Brush = @OutlineVariant ] ] {
            // x:root owns the NameScope so the inner x:names register and
            // the VM's OnViewMounted FindName resolves them.
            DockPanel {
                // Header
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Animation — From/To, AutoReverse + Repeat, keyframes",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                // Body
                StackPanel [ Orientation = Vertical, Margin = (20,20,20,20) ] {
                    // ── Slide ──
                    StackPanel [ Orientation = Vertical, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Slide — Width animates 100 → 300 with CubicOut easing.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        StackPanel [ Orientation = Horizontal ] {
                            Button x:name="slideBtn" [ Width = 90 ] {
                                TextBlock [ Text = "Play" ]
                            }
                            Border x:name="slideTarget"
                                [ Fill   = #4caf50,
                                  Width        = 100,
                                  Height       = 24,
                                  CornerRadius = 4,
                                  Margin       = (20,4,0,0) ]
                        }
                        TextBlock
                            [ Text       = "Click to reset and animate. Each click cancels any in-flight slide.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // ── Bouncing loop ──
                    StackPanel [ Orientation = Vertical, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Bouncing loop — Width 100 ↔ 250, AutoReverse + Infinity.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        StackPanel [ Orientation = Horizontal ] {
                            Button x:name="loopBtn" [ Width = 90 ] {
                                TextBlock [ Text = "Start" ]
                            }
                            Border x:name="loopTarget"
                                [ Fill   = @Primary,
                                  Width        = 100,
                                  Height       = 24,
                                  CornerRadius = 4,
                                  Margin       = (20,4,0,0) ]
                        }
                        TextBlock
                            [ Text       = "Click again to Stop — the animation slot releases and Width returns to 100.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // ── Pulse keyframes ──
                    StackPanel [ Orientation = Vertical, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Padding ripple — ThicknessAnimationUsingKeyFrames, 4 waypoints.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        StackPanel [ Orientation = Horizontal ] {
                            Button x:name="pulseBtn" [ Width = 90 ] {
                                TextBlock [ Text = "Play" ]
                            }
                            Border x:name="pulseTarget"
                                [ Fill      = #4caf50,
                                  Stroke     = Pen [ Brush = @Primary ],
                                  CornerRadius    = 4,
                                  Margin          = (20,4,0,0),
                                  Padding         = (8) ] {
                                TextBlock [ Text = "Padding ripple", FontSize = 11 ]
                            }
                        }
                        TextBlock
                            [ Text       = "Padding cycles (8) → (24, 8, 24, 8) → (8, 24, 8, 24) → (8).",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // ── Brush colour fade ──
                    StackPanel [ Orientation = Vertical, Margin = (0,0,0,24) ] {
                        TextBlock
                            [ Text       = "Brush colour fade — SolidColorBrushAnimation on Fill, cubic-bezier easing.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        StackPanel [ Orientation = Horizontal ] {
                            Button x:name="colorBtn" [ Width = 90 ] {
                                TextBlock [ Text = "Play" ]
                            }
                            Border x:name="colorTarget"
                                [ Fill   = @Primary,
                                  Width        = 140,
                                  Height       = 24,
                                  CornerRadius = 4,
                                  Margin       = (20,4,0,0) ]
                        }
                        TextBlock
                            [ Text       = "Fill brush fades blue → green → blue using CSS-style ease-in-out.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }

                    // ── Cubic-bezier easing comparison ──
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Cubic-bezier easing — same animation, two control-point profiles.",
                              FontSize   = 12,
                              FontWeight = Bold,
                              Margin     = (0,0,0,8) ]
                        StackPanel [ Orientation = Horizontal ] {
                            Button x:name="bezierBtn" [ Width = 90 ] {
                                TextBlock [ Text = "Play both" ]
                            }
                            StackPanel [ Orientation = Vertical, Margin = (20,0,0,0) ] {
                                Border x:name="bezierA"
                                    [ Fill   = @Primary,
                                      Width        = 100,
                                      Height       = 14,
                                      CornerRadius = 2,
                                      Margin       = (0,2,0,2) ]
                                Border x:name="bezierB"
                                    [ Fill   = #4caf50,
                                      Width        = 100,
                                      Height       = 14,
                                      CornerRadius = 2,
                                      Margin       = (0,2,0,2) ]
                            }
                        }
                        TextBlock
                            [ Text       = "Top: linear. Bottom: cubicBezier(0.68, -0.55, 0.27, 1.55) — anticipate + overshoot.",
                              FontSize   = 11,
                              Foreground = @OnSurfaceVariant,
                              Margin     = (0,8,0,0) ]
                    }
                }
            }
        }
    }
}
