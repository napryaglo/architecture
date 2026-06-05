import AnimationNamedVM from "./animation-named-vm.mjs"

// animation-named.mu — named-storyboard showcase: Pause / Resume / Stop.
//
// Each Button runs a "loop" Storyboard from Loaded; hovering pauses it,
// un-hovering resumes, clicking stops permanently. The whole thing is
// declarative — no host-side JS.
//
// Pattern:
//   on Loaded {
//       BeginStoryboard [Name="loop"] {
//           DoubleAnimation[TargetProperty=Width, From=80, To=200,
//                           Duration=600, AutoReverse=true,
//                           RepeatBehavior=Infinity]
//       }
//   }
//   when( IsMouseOver ){
//       on enter { PauseStoryboard [Name="loop"] }
//       on exit  { ResumeStoryboard[Name="loop"] }
//   }
//   on Click { StopStoryboard [Name="loop"] }
//
// The named-storyboard registry is per-Visual: each Button's "loop"
// reference is its own — pausing one Button doesn't affect the others.
//
// Packaged as a DataTemplate keyed off AnimationNamedVM; the implicit
// Button style lives in the template root's local resources so it
// scopes to this demo only.

ResourceDictionary {
    DataTemplate x:key="AnimationNamedTemplate" [DataType=AnimationNamedVM] {
        Border [Background=#ffffff, BorderBrush=#e2e8f0,
                BorderThickness=(1)]{
            resources: {
                Style[TargetType=Button]{
                    on Loaded {
                        BeginStoryboard [Name="loop"] {
                            DoubleAnimation[TargetProperty=Width,
                                            From=80, To=240,
                                            Duration=800,
                                            AutoReverse=true,
                                            RepeatBehavior=Infinity]
                        }
                    }
                    when( IsMouseOver ){
                        on enter { PauseStoryboard  [Name="loop"] }
                        on exit  { ResumeStoryboard [Name="loop"] }
                    }
                    on Click { StopStoryboard [Name="loop"] }
                }
            }
            DockPanel{
                Border[DockPanel.Dock=Top,
                       Background=#1976d2, Padding=(16,12,16,12)]{
                    TextBlock[Text="Named storyboards — Begin / Pause / Resume / Stop",
                              FontSize=15, FontWeight=Bold,
                              Foreground=#ffffff]
                }

                StackPanel[Orientation=Vertical, Margin=(20,24,20,20)]{
                    TextBlock[Text="Each button starts a looping Width animation on Loaded. Hover pauses; un-hover resumes; click stops for good.",
                              FontSize=12, Foreground=#6b7280,
                              Margin=(0,0,0,16)]
                    StackPanel[Orientation=Vertical]{
                        Button [Height=28, Margin=(0,0,0,8)]{
                            TextBlock[Text="Loop A"]
                        }
                        Button [Height=28, Margin=(0,0,0,8)]{
                            TextBlock[Text="Loop B"]
                        }
                        Button [Height=28, Margin=(0,0,0,8)]{
                            TextBlock[Text="Loop C"]
                        }
                    }
                    TextBlock[Text="The named registry is per-Visual — pausing Loop A doesn't pause Loop B or C.",
                              FontSize=11, Foreground=#6b7280,
                              Margin=(0,16,0,0)]
                }
            }
        }
    }
}
