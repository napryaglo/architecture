// Default theme entries for the tabs family — TabControl (the
// container) + TabItem (each header+content pair).
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Tabs {
    // ── TabControl: M3 horizontal tab strip + content area ────────
    // ItemsPresenter on top renders each TabItem's header surface;
    // ContentPresenter below shows the selected TabItem's Content.
    // Selection comes from the Selector base (TabControl extends
    // Selector); the content area binds to SelectedItem so any data-
    // driven swap reflects automatically.
    //
    // The active-indicator line — the 2dp @Primary underline that
    // tracks under the selected tab in M3 spec — is rendered per
    // TabItem (DefaultTabItem template below) rather than as a
    // separately-animated indicator. The simpler shape skips the
    // cross-tab animation but keeps the spec affordance.
    ItemsPanelTemplate x:key="DefaultTabControlPanel" {
        StackPanel [ Orientation = Horizontal ]
    }
    Template x:key="DefaultTabControl" [TargetType = TabControl] {
        Border x:name="PART_Border"
            [ Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (0,0,0,1) ] {
            DockPanel [ LastChildFill = true ] {
                ItemsPresenter x:name="PART_ItemsPresenter" [ DockPanel.Dock = Top ]
                ContentPresenter x:name="PART_ContentSlot" [ Content = $SelectedItem ]
            }
        }
    }
    Style [TargetType = TabControl] {
        Template = @DefaultTabControl;
        ItemsPanel = @DefaultTabControlPanel;
    }

    // ── TabItem: M3 tab header ─────────────────────────────────────
    // 48dp tall header surface — Label centred, 2dp active-indicator
    // line at the bottom edge that's transparent until IsSelected.
    // State-layer overlays fire on hover / focus / press over the
    // resting @Surface background.
    Template x:key="DefaultTabItem" [TargetType = TabItem] {
        Border x:name="PART_Tab"
            [ Background      = #00000000,
              BorderBrush     = #00000000,
              BorderThickness = (0,0,0,2),
              Padding         = (@Spacing4,@Spacing2,@Spacing4,@Spacing2),
              Height          = 48 ] {
            TextBlock x:name="PART_Label"
                [ Text                = $Header,
                  Foreground          = @OnSurfaceVariant,
                  FontFamily          = @TitleSmallFont,
                  FontWeight          = @TitleSmallWeight,
                  FontSize            = @TitleSmallSize,
                  LineHeight          = @TitleSmallLineHeight,
                  LetterSpacing       = @TitleSmallTracking,
                  HorizontalAlignment = Center,
                  VerticalAlignment   = Center ]
        }
        when ( IsSelected ) {
            PART_Tab.BorderBrush = @Primary;
            PART_Label.Foreground = @Primary;
        }
        when ( IsMouseOver ) { PART_Tab.Background = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Tab.Background = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Tab.Background = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Tab.Opacity = @DisabledContentOpacity; }
    }
    Style [TargetType = TabItem] {
        Template = @DefaultTabItem;
    }
}
