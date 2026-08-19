import SideSheetVM from "./side-sheet-vm.mjs"

// side-sheet.mu — M3 SideSheet showcase (Modal variant). A page body with
// an "Open" button; the trailing-edge Modal sheet floats over a dismissable
// scrim. IsOpen binds TwoWay: the Open command raises it, the sheet's own
// ✕ / scrim lower it, and the VM tracks both so Open works after a dismiss.
//
// The SideSheet sits in the same Grid cell as the page body — the Modal
// variant contributes 0 to in-flow layout (it mounts its sheet + scrim onto
// the overlay layer when open), so it doesn't perturb the page beneath.
//
// Theme swap — the sheet's @SurfaceContainerLow chrome, the @OnSurface title
// ink, and the scrim all ride DynamicResource, so light ↔ dark re-tint live.

resources SideSheetDemo {
    DataTemplate [DataType = SideSheetVM] {
        Border [ Fill = @Surface, Stroke = Pen [ Brush = @OutlineVariant ], BorderThickness = (1) ] {
            Grid {
                // Page body.
                StackPanel [ Orientation = Vertical, Margin = (32,32,32,32) ] {
                    TextBlock
                        [ Text       = "SideSheet — M3's lateral supplementary surface (Modal)",
                          Style      = @TitleMedium,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,8) ]
                    TextBlock
                        [ Text         = "The Modal variant floats a trailing-edge sheet over a scrim; dismiss it with the ✕ in the sheet header or by tapping the scrim. IsOpen binds TwoWay, so this stays in sync.",
                          Style        = @BodyMedium,
                          Foreground   = @OnSurfaceVariant,
                          TextWrapping = Wrap,
                          Margin       = (0,0,0,24) ]
                    Button
                        [ Variant             = Filled,
                          Command             = $Open,
                          HorizontalAlignment = Left ] {
                        TextBlock [ Text = "Open side sheet" ]
                    }
                }

                // Modal side sheet — 0 in flow; mounts to the overlay on open.
                SideSheet
                    [ Variant = Modal,
                      Anchor  = Right,
                      Title   = "Details",
                      IsOpen  = $IsOpen ] {
                    StackPanel [ Orientation = Vertical ] {
                        TextBlock
                            [ Text         = "A Modal side sheet holds supplementary content — filters, details, a tool palette — without leaving the page.",
                              Style        = @BodyMedium,
                              Foreground   = @OnSurface,
                              TextWrapping = Wrap,
                              Margin       = (0,0,0,12) ]
                        TextBlock
                            [ Text         = "Standard side sheets dock in-flow instead, reflowing the page beside them.",
                              Style        = @BodyMedium,
                              Foreground   = @OnSurfaceVariant,
                              TextWrapping = Wrap ]
                    }
                }
            }
        }
    }
}
