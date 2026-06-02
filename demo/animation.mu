// animation.mu — animation engine showcase.
//
// Three rows demonstrating the dimensions we ship:
//   * Slide       — single From/To DoubleAnimation on Width with
//                   CubicOut easing.
//   * Bounce loop — RepeatBehavior=Infinity + AutoReverse on Width;
//                   QuadInOut easing.
//   * Pulse      — ThicknessAnimationUsingKeyFrames walks Padding
//                   through three waypoints.
//
// All wiring is host-side in `demo/platform/demos/animation.mjs` —
// trigger-action `BeginStoryboard` for declarative `.mu` markup is a
// follow-up that needs compiler support.

Application{
    resources: {
        @paper    = #ffffff
        @hairline = #e2e8f0
        @primary  = #1976d2
        @primInk  = #ffffff
        @hint     = #6b7280
        @accent   = #4caf50

        Border x:root [Background=@paper, BorderBrush=@hairline,
                       BorderThickness=(1)]{
            DockPanel{
                // Header
                Border[DockPanel.Dock=Top,
                       Background=@primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="Animation — From/To, AutoReverse + Repeat, keyframes",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@primInk]
                }

                // Body
                StackPanel[Orientation=Vertical, Margin=(20,20,20,20)]{

                    // ── Slide ──
                    StackPanel[Orientation=Vertical, Margin=(0,0,0,24)]{
                        TextBlock[Text="Slide — Width animates 100 → 300 with CubicOut easing.",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        StackPanel[Orientation=Horizontal]{
                            Button x:name="slideBtn"[Width=90]{
                                TextBlock[Text="Play"]
                            }
                            Border x:name="slideTarget"
                                  [Background=@accent, Width=100, Height=24,
                                   CornerRadius=4, Margin=(20,4,0,0)]
                        }
                        TextBlock[Text="Click to reset and animate. Each click cancels any in-flight slide.",
                                  FontSize=11, Foreground=@hint,
                                  Margin=(0,8,0,0)]
                    }

                    // ── Bouncing loop ──
                    StackPanel[Orientation=Vertical, Margin=(0,0,0,24)]{
                        TextBlock[Text="Bouncing loop — Width 100 ↔ 250, AutoReverse + Infinity.",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        StackPanel[Orientation=Horizontal]{
                            Button x:name="loopBtn"[Width=90]{
                                TextBlock[Text="Start"]
                            }
                            Border x:name="loopTarget"
                                  [Background=@primary, Width=100, Height=24,
                                   CornerRadius=4, Margin=(20,4,0,0)]
                        }
                        TextBlock[Text="Click again to Stop — the animation slot releases and Width returns to 100.",
                                  FontSize=11, Foreground=@hint,
                                  Margin=(0,8,0,0)]
                    }

                    // ── Pulse keyframes ──
                    StackPanel[Orientation=Vertical, Margin=(0,0,0,24)]{
                        TextBlock[Text="Padding ripple — ThicknessAnimationUsingKeyFrames, 4 waypoints.",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        StackPanel[Orientation=Horizontal]{
                            Button x:name="pulseBtn"[Width=90]{
                                TextBlock[Text="Play"]
                            }
                            Border x:name="pulseTarget"
                                  [Background=@accent,
                                   BorderBrush=@primary, BorderThickness=(1),
                                   CornerRadius=4, Margin=(20,4,0,0),
                                   Padding=(8)]{
                                TextBlock[Text="Padding ripple", FontSize=11]
                            }
                        }
                        TextBlock[Text="Padding cycles (8) → (24, 8, 24, 8) → (8, 24, 8, 24) → (8).",
                                  FontSize=11, Foreground=@hint,
                                  Margin=(0,8,0,0)]
                    }

                    // ── Brush colour fade ──
                    StackPanel[Orientation=Vertical, Margin=(0,0,0,24)]{
                        TextBlock[Text="Brush colour fade — SolidColorBrushAnimation on Background, cubic-bezier easing.",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        StackPanel[Orientation=Horizontal]{
                            Button x:name="colorBtn"[Width=90]{
                                TextBlock[Text="Play"]
                            }
                            Border x:name="colorTarget"
                                  [Background=#1976d2, Width=140, Height=24,
                                   CornerRadius=4, Margin=(20,4,0,0)]
                        }
                        TextBlock[Text="Background brush fades blue → green → blue using CSS-style ease-in-out.",
                                  FontSize=11, Foreground=@hint,
                                  Margin=(0,8,0,0)]
                    }

                    // ── Cubic-bezier easing comparison ──
                    StackPanel[Orientation=Vertical]{
                        TextBlock[Text="Cubic-bezier easing — same animation, two control-point profiles.",
                                  FontSize=12, FontWeight=Bold,
                                  Margin=(0,0,0,8)]
                        StackPanel[Orientation=Horizontal]{
                            Button x:name="bezierBtn"[Width=90]{
                                TextBlock[Text="Play both"]
                            }
                            StackPanel[Orientation=Vertical, Margin=(20,0,0,0)]{
                                Border x:name="bezierA"
                                      [Background=@primary, Width=100, Height=14,
                                       CornerRadius=2, Margin=(0,2,0,2)]
                                Border x:name="bezierB"
                                      [Background=@accent, Width=100, Height=14,
                                       CornerRadius=2, Margin=(0,2,0,2)]
                            }
                        }
                        TextBlock[Text="Top: linear. Bottom: cubicBezier(0.68, -0.55, 0.27, 1.55) — anticipate + overshoot.",
                                  FontSize=11, Foreground=@hint,
                                  Margin=(0,8,0,0)]
                    }
                }
            }
        }
    }
}
