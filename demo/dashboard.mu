// dashboard.mu — sample µ-mural source for the HTML demo.
//
// Demonstrates: a Canvas root with three positioned Borders, an
// implicit Border Style with a brush resource, and TextBlock children
// using both the attribute form (`Text="…"`) and inherited foreground
// brushes.
//
// Compiled ahead-of-time to demo/dashboard.mu.js by
// `npx mural compile demo/dashboard.mu --out demo/dashboard.mu.js`;
// demo/index.html imports the emitted module statically. Edit this
// file and re-run the compile command to refresh the demo.

Application{
    resources: {
        @primary       = #4caf50
        @primary:dark  = #1b5e20
        @danger        = #d32f2f
        @danger:dark   = #7f0000
        @on:white      = #ffffff
        @ink           = #1f2937
        @hairline      = #d1d5db
        @paper         = #ffffff

        // Implicit Border style — every Border picks up these
        // defaults at construction (resolve_implicit_style walks to
        // Application.Resources).
        style[targettype=Border]{
            BorderThickness = (1)
            CornerRadius    = (6)
        }

        Canvas[x:root]{

            // Top-left card — uses the primary palette.
            Border[Canvas.Left=20, Canvas.Top=20,
                   Width=200, Height=80,
                   Background=@primary, BorderBrush=@primary:dark,
                   BorderThickness=(2), CornerRadius=(8),
                   Padding=(16)]{
                TextBlock[Text="Hello mural",
                          FontSize=20,
                          Foreground=@on:white]
            }

            // Top-right card — danger palette, same shape via the
            // implicit Style + explicit overrides.
            Border[Canvas.Left=240, Canvas.Top=20,
                   Width=200, Height=80,
                   Background=@danger, BorderBrush=@danger:dark,
                   BorderThickness=(2), CornerRadius=(8),
                   Padding=(16)]{
                TextBlock[Text="Danger zone",
                          FontSize=20,
                          Foreground=@on:white]
            }

            // Wide bottom panel — paper background, hairline border,
            // proves the implicit style is shadowed by the explicit
            // BorderBrush set on this instance.
            Border[Canvas.Left=20, Canvas.Top=140,
                   Width=420, Height=160,
                   Background=@paper, BorderBrush=@hairline,
                   Padding=(20)]{
                TextBlock[Text="Compiled from .mu source. Runtime parser used here so you can edit and reload.",
                          FontSize=14,
                          Foreground=@ink]
            }
        }
    }
}
