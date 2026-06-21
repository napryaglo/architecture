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
    // ShapeFull gives the M3 stadium-shape SearchBar look; the resting
    // background is @SurfaceContainerHigh so the field reads as
    // elevated against neutral surrounding chrome.
    Template x:key="DefaultSearchBar" [TargetType=SearchBar]{
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHigh,
                BorderBrush     = #00000000,
                BorderThickness = (0),
                CornerRadius    = @ShapeFull,
                Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2),
                Height          = 56 ] {
            DockPanel [LastChildFill=true] {
                Border x:name="PART_LeadingSlot"
                      [ DockPanel.Dock     = Left,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0),
                        Margin              = (0, 0, @Spacing2, 0) ]
                Border x:name="PART_TrailingSlot"
                      [ DockPanel.Dock     = Right,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0),
                        Margin              = (@Spacing2, 0, 0, 0) ]
                ScrollViewer x:name="PART_Scroll"{
                    TextEditorSurface x:name="PART_Editor"
                }
            }
        }
        when ( IsMouseOver )       { PART_Border.Background = @SurfaceContainerHighest; }
        when ( IsFocused )         { PART_Border.Background = @SurfaceContainerHighest; }
        when ( IsEnabled = false ) { PART_Border.Opacity    = @DisabledContentOpacity; }
    }

    Style [TargetType=SearchBar] {
        Template       = @DefaultSearchBar;
        Foreground     = @OnSurface;
        SelectionBrush = @SecondaryContainer;
        CaretBrush     = @OnSurface;
        FontFamily     = @BodyLargeFont;
        FontWeight     = @BodyLargeWeight;
        FontSize       = @BodyLargeSize;
        LineHeight     = @BodyLargeLineHeight;
        LetterSpacing  = @BodyLargeTracking;
    }
}
