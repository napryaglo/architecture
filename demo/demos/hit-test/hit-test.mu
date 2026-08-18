import HitTestVM from "./hit-test-vm.mjs"

// hit-test.mu — a single standalone Heart shape. The Heart draws its own
// silhouette (orange fill, magenta 2px stroke tracing the outline) and,
// in ArrangeOverride, publishes that same silhouette as its
// HitTestGeometry — so picking is confined to the outline for free.
//
//   * Only clicks INSIDE the heart outline hit the shape and flip
//     IsToggled — clicks in the bounding-box corners fall through and do
//     nothing (heart-hit-behavior wires the click; the shape's own
//     HitTestGeometry is what rejects the corners).
//   * `when ($IsToggled)` swaps the fill orange↔white; the next inside-
//     click flips it back.

resources HitTestDemo {
    // Magenta 2px outline pen for the heart's stroke.
    Pen x:key="HeartOutlinePen" [ Brush = #ff00ff, Thickness = 3 ]

    DataTemplate [DataType = HitTestVM] {
        Border x:root [ Fill = @Surface ] {
            DockPanel {
                // ── Header ─────────────────────────────────────────
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (20,14,20,14) ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text       = "Hit test",
                              FontSize   = 18,
                              FontWeight = Bold,
                              Foreground = @OnPrimary ]
                        TextBlock
                            [ Text         = "A single Heart shape. It publishes its own outline as HitTestGeometry, so only clicks inside the heart toggle the fill orange↔white — clicks in the bounding-box corners fall through.",
                              FontSize      = 12,
                              Foreground    = @OnPrimary,
                              TextWrapping  = Wrap,
                              Margin        = (0,4,0,0) ]
                    }
                }

                // ── Stage — the custom HeartPresenter control, centred ──
                // Content is a Button, presented on top of the heart chrome
                // and clipped to the heart outline.
                HeartPresenter x:name="heartShape"
                    [ Fill                = #ff8c00,
                      Stroke              = @HeartOutlinePen,
                      Width               = 260,
                      Height              = 240,
                      ClipChildren        = true,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Center,
                      Content             = Button
                          [ HorizontalAlignment = Center,
                            VerticalAlignment   = Center,
                            Content             = TextBlock [ Text = "Click Me! This is a very long long label that runs well past the heart so you can see the content clipped to the outline." ] ] ]
            }
        }

        // Inside-outline click flips IsToggled (wired by the behavior);
        // while toggled, the heart fill reads white instead of orange.
        when ( $IsToggled ) {
            heartShape.Fill = #ffffff;
        }
    }
}
