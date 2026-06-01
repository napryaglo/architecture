// counter.mu — Button + ICommand + ComboBox demo.
//
// Demonstrates two control patterns wired through the same view-model:
//
//   * Button + ICommand — Increment / Reset commands bind to two
//     Material-UI Contained buttons. Increment's CanExecute guard
//     gates the +1 button at 10 without any extra UI glue.
//
//   * ComboBox + selection binding — a Step ComboBox lets the user
//     pick the increment delta from a list of options. SelectedItem
//     is two-way bound to the VM's `Step` property; the Increment
//     command reads `Step` when it fires.
//
// Compiled ahead-of-time to demo/counter.mu.js by
// `npx mural compile demo/counter.mu --out demo/counter.mu.js`.

Application{
    resources: {
        @paper      = #ffffff
        @ink        = #1f2937
        @hint       = #6b7280
        @hairline   = #e2e8f0
        @accent     = #1976d2

        Canvas x:root {
            Border[Canvas.Left=50, Canvas.Top=40,
                   Width=360, Height=280,
                   Background=@paper, BorderBrush=@hairline,
                   BorderThickness=(1), CornerRadius=8]{

                Canvas {

                    TextBlock[Canvas.Left=24, Canvas.Top=20,
                              FontSize=14, Foreground=@hint,
                              Text="Counter:"]

                    TextBlock[Canvas.Left=24, Canvas.Top=40,
                              FontSize=42, FontWeight=Bold,
                              Foreground=@accent,
                              Text={{ String($Count) }}]

                    TextBlock[Canvas.Left=170, Canvas.Top=124,
                              FontSize=12, Foreground=@hint,
                              Text="Step:"]

                    ComboBox[Canvas.Left=170, Canvas.Top=140,
                             Width=164,
                             Items=$Steps,
                             SelectedItem=$Step]

                    Button[Canvas.Left=24, Canvas.Top=140, Width=80,
                           Command=$Increment]{
                        TextBlock[Text="+ Step"]
                    }

                    Button[Canvas.Left=24, Canvas.Top=190, Width=80,
                           Command=$Reset]{
                        TextBlock[Text="Reset"]
                    }

                    TextBlock[Canvas.Left=24, Canvas.Top=232,
                              Width=312,
                              FontSize=12, Foreground=@hint,
                              TextWrapping=Wrap,
                              Text="The ComboBox sets Step. Increment adds Step to Count and stops at 10. Reset always works."]
                }
            }
        }
    }
}
