import BannerVM from "./banner-vm.mjs"

// banner.mu — M3 Banner showcase. Exercises the headline in-flow
// announcement shape: Content (message), the Leading icon slot, and the
// trailing Actions slot.
//
// What's exercised:
//   * Banner.Content — the headline + supporting message payload
//     (inherited from ContentControl), rendered in the centre slot.
//   * Banner.Leading — a Visual dropped into the leading icon slot.
//   * Banner.Actions — a trailing action Button whose Command dismisses
//     the Banner (a DataTemplate trigger collapses it on $Dismissed).
//   * A Restore button brings the Banner back so the slot wiring is
//     visible repeatedly.
//   * Theme swap — @Surface / @OutlineVariant / @Primary ride
//     DynamicResource.

resources BannerDemo {
    DataTemplate [DataType = BannerVM] {
        Border [ Fill = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            DockPanel {
                // Header strip
                Border [ DockPanel.Dock = Top, Fill = @Primary, Padding = (16,12,16,12) ] {
                    TextBlock
                        [ Text       = "Banner — M3's in-flow alert strip: Leading icon | message | trailing Actions.",
                          FontSize   = 15,
                          FontWeight = Bold,
                          Foreground = @OnPrimary ]
                }

                StackPanel [ Orientation = Vertical, Margin = (24,24,24,24) ] {
                    TextBlock
                        [ Text       = "Banner — Content + Leading + Actions slots",
                          FontWeight = Bold,
                          FontSize   = 14,
                          Foreground = @OnSurface,
                          Margin     = (0,0,0,16) ]

                    // The Banner itself — sits in the document flow. Leading
                    // carries a status glyph; Actions carries a Text Button
                    // wired to $Dismiss; Content is the message.
                    Banner x:name="AnnounceBanner"
                        [ Leading = TextBlock [ Text = "⚠", FontSize = 20, Foreground = @Primary ],
                          Actions = Button [ Variant = Text, Command = $Dismiss, Content = TextBlock [ Text = "Dismiss" ] ] ] {
                        TextBlock
                            [ Text         = "Your session will expire soon. Save your work to avoid losing changes.",
                              TextWrapping = Wrap,
                              Foreground   = @OnSurface ]
                    }

                    // Restore control — brings the dismissed Banner back.
                    Button
                        [ Variant             = Filled,
                          Command             = $Restore,
                          HorizontalAlignment = Left,
                          Margin              = (0,24,0,0),
                          Content             = TextBlock [ Text = "Restore banner" ] ]
                }
            }
        }

        // Dismiss collapses the Banner in place; Restore reverts it.
        when ( $Dismissed ) {
            AnnounceBanner.Visibility = Collapsed;
        }
    }
}
