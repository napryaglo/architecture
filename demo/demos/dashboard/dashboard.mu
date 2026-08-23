import DashboardVM from "./dashboard-vm.mjs"

// dashboard.mu — sample µ-mural source for the HTML demo.
//
// Demonstrates: a Canvas root with three positioned Borders styled
// via keyed styles, plus `when( IsMouseOver )` / `when( IsPressed )`
// triggers that re-skin each card as the pointer moves over it and
// presses down. The triggers exercise the runtime input pipeline:
// DOM PointerEvents → HtmlTarget → InputManager → IsMouseOver / IsPressed
// DPs → Style triggers fire → Fill / BorderThickness setters
// invalidate render → SvgRenderer repaints the visual incrementally.
//
// Packaged as a DataTemplate keyed off DashboardVM. The card styles
// live alongside the template in the same ResourceDictionary; the
// `Dashboard*Card` prefix keeps them from colliding with other demos
// that merge their own resources into Application.current.Resources.

resources DashboardDemo {
    // Keyed Border styles. Each carries its own Fill +
    // BorderBrush so the hover / press triggers can override the
    // style's defaults without colliding with explicit attributes
    // on the Border instance (an attribute set on the instance
    // always wins over a style-tier setter — that's why these
    // styles own the brushes instead of the Border attributes
    // setting them).
    Style x:key="DashboardPrimaryCard" [TargetType = Border] {
        Fill = #4caf50;
        Stroke = (#1b5e20, 2);
        CornerRadius = (8);
        Padding = (16);
        when ( IsMouseOver ) {
            Fill = #66bb6a;
            Stroke = (#1b5e20, 3);
        }
        when ( IsPressed ) {
            Fill = #2e7d32;
            Stroke = (#1b5e20, 4);
        }
    }

    Style x:key="DashboardDangerCard" [TargetType = Border] {
        Fill = #d32f2f;
        Stroke = (#7f0000, 2);
        CornerRadius = (8);
        Padding = (16);
        when ( IsMouseOver ) {
            Fill = #ef5350;
            Stroke = (#7f0000, 3);
        }
        when ( IsPressed ) {
            Fill = #b71c1c;
            Stroke = (#7f0000, 4);
        }
    }

    Style x:key="DashboardPaperCard" [TargetType = Border] {
        Fill = @Surface;
        Stroke = (@OutlineVariant, 1);
        CornerRadius = (6);
        Padding = (20);
        when ( IsMouseOver ) {
            Fill = @SurfaceContainerHigh;
            Stroke = (@OutlineVariant, 2);
        }
        when ( IsPressed ) {
            Fill = @OutlineVariant;
            Stroke = (@OutlineVariant, 3);
        }
    }

    DataTemplate [DataType = DashboardVM] {
        Canvas {
            // Top-left card — primary palette + triggers via DashboardPrimaryCard.
            Border
                [ Style       = @DashboardPrimaryCard,
                  Canvas.Left = 20,
                  Canvas.Top  = 20,
                  Width       = 200,
                  Height      = 80 ] {
                TextBlock [ Text = "Hello mural", FontSize = 20, Foreground = @OnPrimary ]
            }

            // Top-right card — danger palette, same hover / press shape.
            Border
                [ Style       = @DashboardDangerCard,
                  Canvas.Left = 240,
                  Canvas.Top  = 20,
                  Width       = 200,
                  Height      = 80 ] {
                TextBlock [ Text = "Danger zone", FontSize = 20, Foreground = @OnPrimary ]
            }

            // Wide bottom panel — paper palette, subtler tint shift on
            // hover so the description stays readable.
            Border
                [ Style       = @DashboardPaperCard,
                  Canvas.Left = 20,
                  Canvas.Top  = 140,
                  Width       = 420,
                  Height      = 160 ] {
                TextBlock
                    [ Text         = "Hover over the cards above to see Style triggers fire on IsMouseOver. Press and hold to see the IsPressed trigger lock in.",
                      FontSize     = 14,
                      TextWrapping = Wrap,
                      Foreground   = @OnSurface ]
            }
        }
    }
}
