// animation-declarative.mu — declarative trigger-action showcase.
//
// All animation wiring lives in the markup via Style EventTriggers — no
// host-side JS, no Visual.BeginAnimation. The implicit style targets
// Button, so every Button in the demo picks up the same on-Click
// animation; per-row visual differences come from each row's Target
// (the Border alongside the button) carrying different initial
// properties.
//
// Pattern:
//   style[targettype=Button]{
//       on Click {
//           BeginStoryboard {
//               DoubleAnimation[TargetProperty=Width, From=80, To=240, Duration=400]
//           }
//       }
//   }
//
// The animation TargetProperty matches a DP on the Button itself —
// declarative form animates the firing Visual. Animating siblings or
// named targets needs `Storyboard.TargetName` support which lands in a
// follow-up.

Application{
    resources: {
        @paper    = #ffffff
        @hairline = #e2e8f0
        @primary  = #1976d2
        @primInk  = #ffffff
        @hint     = #6b7280

        // Implicit style on Button — every Button in this demo's tree
        // picks it up automatically (no Style=... binding needed). The
        // single EventTrigger fires a fresh Storyboard per click.
        style[targettype=Button]{
            on Click {
                BeginStoryboard {
                    DoubleAnimation[TargetProperty=Width, From=80, To=240, Duration=400]
                }
            }
        }

        Border x:root [Background=@paper, BorderBrush=@hairline,
                       BorderThickness=(1)]{
            DockPanel{
                // Header
                Border[DockPanel.Dock=Top,
                       Background=@primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="Declarative animation — on Click { BeginStoryboard { ... } }",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@primInk]
                }

                StackPanel[Orientation=Vertical, Margin=(20,24,20,20)]{
                    TextBlock[Text="Click any Button. The style's EventTrigger animates the Button's own Width from 80 to 240 over 400 ms — no host-side handler wired.",
                              FontSize=12, Foreground=@hint,
                              Margin=(0,0,0,16)]
                    StackPanel[Orientation=Vertical]{
                        Button [Width=80, Margin=(0,0,0,8)]{
                            TextBlock[Text="Slide A"]
                        }
                        Button [Width=80, Margin=(0,0,0,8)]{
                            TextBlock[Text="Slide B"]
                        }
                        Button [Width=80, Margin=(0,0,0,8)]{
                            TextBlock[Text="Slide C"]
                        }
                    }
                    TextBlock[Text="Each Button carries its own animation instance — clicking them simultaneously plays independent storyboards (each baseline-captures From=80 at fire time).",
                              FontSize=11, Foreground=@hint,
                              Margin=(0,16,0,0)]
                }
            }
        }
    }
}
