// dashboard.mu — sample µ-mural source for the HTML demo.
//
// Demonstrates: a Canvas root with three positioned Borders styled
// via keyed styles, plus `when( IsMouseOver )` / `when( IsPressed )`
// triggers that re-skin each card as the pointer moves over it and
// presses down. The triggers exercise the runtime input pipeline:
// DOM PointerEvents → HtmlTarget → InputManager → IsMouseOver / IsPressed
// DPs → Style triggers fire → Background / BorderThickness setters
// invalidate render → SvgRenderer repaints the visual incrementally.
//
// Compiled ahead-of-time to demo/dashboard.mu.js by
// `npx mural compile demo/dashboard.mu --out demo/dashboard.mu.js`;
// demo/index.html imports the emitted module statically. Edit this
// file and re-run the compile command to refresh the demo.

Application{
    resources: {
        // Primary palette
        @primary        = #4caf50
        @primary:light  = #66bb6a
        @primary:dark   = #2e7d32
        @primary:edge   = #1b5e20

        // Danger palette
        @danger         = #d32f2f
        @danger:light   = #ef5350
        @danger:dark    = #b71c1c
        @danger:edge    = #7f0000

        // Paper palette
        @paper          = #ffffff
        @paper:hover    = #f5f5f5
        @paper:press    = #e0e0e0
        @hairline       = #d1d5db

        // Text
        @on:white       = #ffffff
        @ink            = #1f2937

        // Keyed Border styles. Each carries its own Background +
        // BorderBrush so the hover / press triggers can override the
        // style's defaults without colliding with explicit attributes
        // on the Border instance (an attribute set on the instance
        // always wins over a style-tier setter — that's why these
        // styles own the brushes instead of the Border attributes
        // setting them).
        style x:key="PrimaryCard" [targettype=Border]{
            Background      = @primary;
            BorderBrush     = @primary:edge;
            BorderThickness = (2);
            CornerRadius    = (8);
            Padding         = (16);
            when( IsMouseOver ){ Background = @primary:light; BorderThickness = (3); }
            when( IsPressed   ){ Background = @primary:dark;  BorderThickness = (4); }
        }

        style x:key="DangerCard" [targettype=Border]{
            Background      = @danger;
            BorderBrush     = @danger:edge;
            BorderThickness = (2);
            CornerRadius    = (8);
            Padding         = (16);
            when( IsMouseOver ){ Background = @danger:light; BorderThickness = (3); }
            when( IsPressed   ){ Background = @danger:dark;  BorderThickness = (4); }
        }

        style x:key="PaperCard" [targettype=Border]{
            Background      = @paper;
            BorderBrush     = @hairline;
            BorderThickness = (1);
            CornerRadius    = (6);
            Padding         = (20);
            when( IsMouseOver ){ Background = @paper:hover; BorderThickness = (2); }
            when( IsPressed   ){ Background = @paper:press; BorderThickness = (3); }
        }

        Canvas x:root {

            // Top-left card — primary palette + triggers via PrimaryCard.
            Border[Style=@PrimaryCard,
                   Canvas.Left=20, Canvas.Top=20,
                   Width=200, Height=80]{
                TextBlock[Text="Hello mural",
                          FontSize=20,
                          Foreground=@on:white]
            }

            // Top-right card — danger palette, same hover / press shape.
            Border[Style=@DangerCard,
                   Canvas.Left=240, Canvas.Top=20,
                   Width=200, Height=80]{
                TextBlock[Text="Danger zone",
                          FontSize=20,
                          Foreground=@on:white]
            }

            // Wide bottom panel — paper palette, subtler tint shift on
            // hover so the description stays readable.
            Border[Style=@PaperCard,
                   Canvas.Left=20, Canvas.Top=140,
                   Width=420, Height=160]{
                TextBlock[Text="Hover over the cards above to see Style triggers fire on IsMouseOver. Press and hold to see the IsPressed trigger lock in.",
                          FontSize=14,
                          TextWrapping=Wrap,
                          Foreground=@ink]
            }
        }
    }
}
