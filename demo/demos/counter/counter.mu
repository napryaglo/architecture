import CounterVM from "./counter-vm.mjs"

// counter.mu — a ResourceDictionary holding the demo's DataTemplate.
// The template is parameterized by CounterVM: when the platform shell
// sets PageView.Content to a CounterVM instance, the ContentControl
// machinery walks Application resources, finds this template by its
// DataType, applies it, and sets the produced Visual's DataContext
// to the CounterVM so the $-bindings inside the template resolve.

resources CounterDemo {
    DataTemplate x:key="CounterTemplate" [DataType = CounterVM] {
        Border [ Background = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            Canvas {
                TextBlock
                    [ Canvas.Left = 24,
                      Canvas.Top  = 20,
                      FontSize    = 14,
                      Foreground  = @OnSurfaceVariant,
                      Text        = "Counter:" ]

                TextBlock
                    [ Canvas.Left = 24,
                      Canvas.Top  = 40,
                      FontSize    = 42,
                      FontWeight  = Bold,
                      Foreground  = @Primary,
                      Text        = {{ String($Count) }} ]

                TextBlock
                    [ Canvas.Left = 170,
                      Canvas.Top  = 124,
                      FontSize    = 12,
                      Foreground  = @OnSurfaceVariant,
                      Text        = "Step:" ]

                ComboBox
                    [ Canvas.Left  = 170,
                      Canvas.Top   = 140,
                      Width        = 164,
                      Items        = $Steps,
                      SelectedItem = $Step ]

                Button [ Canvas.Left = 24, Canvas.Top = 140, Width = 80, Command = $Increment ] {
                    TextBlock [ Text = "+ Step" ]
                }

                Button [ Canvas.Left = 24, Canvas.Top = 190, Width = 80, Command = $Reset ] {
                    TextBlock [ Text = "Reset" ]
                }

                TextBlock
                    [ Canvas.Left  = 24,
                      Canvas.Top   = 232,
                      Width        = 312,
                      FontSize     = 12,
                      Foreground   = @OnSurfaceVariant,
                      TextWrapping = Wrap,
                      Text         = "The ComboBox sets Step. Increment adds Step to Count and stops at 10. Reset always works." ]
            }
        }
    }
}
