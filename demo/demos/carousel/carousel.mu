import CarouselVM from "./carousel-vm.mjs"
import CarouselCard from "./carousel-vm.mjs"

// carousel.mu — M3 multi-browse Carousel showcase. A row of hero cards the
// prev/next chevrons page through one at a time (an eased slide on the
// animation clock); ActiveIndex binds TwoWay and drives the "card N of M"
// caption. Each card is a Filled Card rendered from CarouselCard by the
// DataTemplate below.
//
// Theme swap — the cards' @SecondaryContainer chrome and @Surface page ride
// the active scheme.

resources CarouselDemo {
    // One hero card, keyed off CarouselCard for the Carousel's ItemTemplate.
    DataTemplate x:key="CarouselCardTemplate" [DataType = CarouselCard] {
        Card [ Variant = Filled ] {
            StackPanel [ Orientation = Vertical, VerticalAlignment = Bottom ] {
                TextBlock
                    [ Text       = $Title,
                      Style      = @HeadlineSmall,
                      Foreground = @OnSurface ]
                TextBlock
                    [ Text         = $Subtitle,
                      Style        = @BodyMedium,
                      Foreground   = @OnSurfaceVariant,
                      TextWrapping = Wrap,
                      Margin       = (0,4,0,0) ]
            }
        }
    }

    DataTemplate [DataType = CarouselVM] {
        Border [ Fill = @Surface, BorderBrush = @OutlineVariant, BorderThickness = (1) ] {
            StackPanel [ Orientation = Vertical, Margin = (32,32,32,32) ] {
                TextBlock
                    [ Text       = "Carousel — M3 multi-browse hero-card scroller",
                      Style      = @TitleMedium,
                      Foreground = @OnSurface,
                      Margin     = (0,0,0,24) ]

                Carousel
                    [ ItemsSource  = $Items,
                      ItemTemplate = @CarouselCardTemplate,
                      ActiveIndex  = $ActiveIndex,
                      VisibleCount = 3,
                      ItemWidth    = 220,
                      ItemHeight   = 240 ]

                TextBlock
                    [ Text       = $Caption,
                      Style      = @LabelLarge,
                      Foreground = @OnSurfaceVariant,
                      Margin     = (0,16,0,0) ]
            }
        }
    }
}
