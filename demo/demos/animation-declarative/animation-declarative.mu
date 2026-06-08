import AnimationDeclarativeVM from "./animation-declarative-vm.mjs"

// animation-declarative.mu — declarative trigger-action showcase.
//
// All animation wiring lives in the markup via Style EventTriggers — no
// host-side JS, no Visual.BeginAnimation. The implicit style targets
// Button; it lives in the template's root Border's local resources so
// it ONLY applies to Buttons inside this demo's subtree (avoids
// colliding with the other animation demos that share the same
// Application when their resources are all merged in).
//
// Packaged as a DataTemplate keyed off AnimationDeclarativeVM.

ResourceDictionary {
    DataTemplate x:key="AnimationDeclarativeTemplate" [DataType=AnimationDeclarativeVM] {
        Border [Background=@Surface, BorderBrush=@OutlineVariant,
                BorderThickness=(1)]{
            resources: {
                // Implicit style on Button — every Button inside this
                // Border's subtree picks it up automatically. The
                // EventTrigger fires a fresh Storyboard per click.
                Style[TargetType=Button]{
                    on Click {
                        BeginStoryboard {
                            DoubleAnimation[TargetProperty=Width, From=80, To=240, Duration=400]
                        }
                    }
                }
            }
            DockPanel{
                // Header
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="Declarative animation — on Click { BeginStoryboard { ... } }",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                StackPanel[Orientation=Vertical, Margin=(20,24,20,20)]{
                    TextBlock[Text="Click any Button. The style's EventTrigger animates the Button's own Width from 80 to 240 over 400 ms — no host-side handler wired.",
                              FontSize=12, Foreground=@OnSurfaceVariant,
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
                              FontSize=11, Foreground=@OnSurfaceVariant,
                              Margin=(0,16,0,0)]
                }
            }
        }
    }
}
