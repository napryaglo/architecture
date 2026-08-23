// Default theme entries for the SearchBar control.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources SearchBars {
    // ── SearchBar: M3 search-field wrapper around TextBox ──────────
    // Same DockPanel anatomy as ListBoxItem (leading | content | trailing)
    // but the centre column hosts the inherited TextBox's ScrollViewer +
    // TextEditorSurface instead of a ContentPresenter. The leading +
    // trailing slots are class-managed Borders (see search-bar.ts) so
    // findFirstContentPresenter doesn't need to walk past them — TextBox
    // doesn't use the ContentPresenter slot, so there's no contest.
    //
    // @ShapeSmall (8dp) gives a rounded-rect SearchBar; the resting
    // background is @SurfaceContainerHigh so the field reads as
    // elevated against neutral surrounding chrome.
    Template x:key="DefaultSearchBar" [TargetType = SearchBar] {
        Border x:name="PART_Border"
            [ Fill      = @SurfaceContainerHigh,
              Stroke     = Pen [ Brush = #00000000 ],
              CornerRadius    = @ShapeSmall,
              Padding         = (@Spacing3,@Spacing2,@Spacing3,@Spacing2),
              Height          = 56 ] {
            DockPanel [ LastChildFill = true ] {
                Border x:name="PART_LeadingSlot"
                    [ DockPanel.Dock    = Left,
                      VerticalAlignment = Center,
                      Margin            = (0,0,@Spacing2,0) ]
                Border x:name="PART_TrailingSlot"
                    [ DockPanel.Dock    = Right,
                      VerticalAlignment = Center,
                      Margin            = (@Spacing2,0,0,0) ]
                ScrollViewer x:name="PART_Scroll" {
                    TextEditorSurface x:name="PART_Editor"
                }
            }
        }
        when ( IsMouseOver ) { PART_Border.Fill = @SurfaceContainerHighest; }
        when ( IsFocused ) { PART_Border.Fill = @SurfaceContainerHighest; }
        when ( IsEnabled = false ) { PART_Border.Opacity = @DisabledContentOpacity; }
        // Adaptive layout — Compact tightens the field, Comfortable
        // loosens it, Coarse pointer widens the touch target. Padding +
        // Height both retune off the 56dp / (12,8,12,8) resting field so
        // the stadium chrome and its hit area track density together.
        when ( ThemeManager.Density = Compact ) {
            PART_Border.Padding = (@Spacing2,@Spacing1,@Spacing2,@Spacing1);
            PART_Border.Height = 48;
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Border.Padding = (@Spacing4,@Spacing3,@Spacing4,@Spacing3);
            PART_Border.Height = 64;
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Border.Padding = (@Spacing3,@Spacing3,@Spacing3,@Spacing3);
            PART_Border.Height = 64;
        }
    }

    Style [TargetType = SearchBar] {
        Template = @DefaultSearchBar;
        Foreground = @OnSurface;
        SelectionBrush = @SecondaryContainer;
        CaretBrush = @OnSurface;
        // Body Medium (§ 18.13 — input text unified at 14 with labels).
        FontFamily = @BodyMediumFont;
        FontWeight = @BodyMediumWeight;
        FontSize = @BodyMediumSize;
        LineHeight = @BodyMediumLineHeight;
        LetterSpacing = @BodyMediumTracking;
    }
}
