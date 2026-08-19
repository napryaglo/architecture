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
            [ Fill      = @Surface,
              Stroke     = Pen [ Brush = @OutlineVariant ],
              BorderThickness = (0,0,0,1) ] {
            DockPanel [ LastChildFill = true ] {
                ItemsPresenter x:name="PART_ItemsPresenter" [ DockPanel.Dock = Top ]
                // The active tab's BODY. SelectedContent (a property of the
                // templated TabControl) normalises the data-driven vs composed-
                // markup paths (see TabControl) so a single presenter shows the
                // right thing: a data row is dispatched through its DataTemplate;
                // a composed TabItem's Content is slotted directly. `$$` is a
                // TEMPLATE binding to the templated parent's SelectedContent — a
                // plain `$SelectedContent` would bind against the TabControl's
                // DataContext (the content-host service) and resolve to nothing.
                // ReuseContentViews: re-selecting a tab returns that document's
                // existing view rather than rebuilding it — essential when the
                // body owns shared Visuals (a Diagram's items ARE the document's
                // Figures; a rebuilt Diagram would re-parent them and crash).
                ContentPresenter x:name="PART_ContentSlot"
                    [ Content = $$SelectedContent, ReuseContentViews = true ]
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
    // The tab HEADER routes through a ContentPresenter (Content = $$Header,
    // ContentTemplate = $$HeaderTemplate) so it renders BOTH shapes:
    //   * a plain string Header (composed `TabItem[Header="Files"]`) —
    //     stringified into a TextBlock that inherits the M3 typography +
    //     selection ink set on the Style below (TextBlock.* inherited DPs);
    //   * a data row + HeaderTemplate (the data path — TabControl copies its
    //     ItemTemplate onto each TabItem's HeaderTemplate) — e.g. a document
    //     tab's title + close button. A header template that leaves its label
    //     Foreground unset inherits the selection ink too.
    Template x:key="DefaultTabItem" [TargetType = TabItem] {
        Border x:name="PART_Tab"
            [ Fill      = #00000000,
              Stroke     = Pen [ Brush = #00000000 ],
              BorderThickness = (0,0,0,2),
              Padding         = (@Spacing4,@Spacing1,@Spacing4,@Spacing1),
              Height          = 40 ] {
            ContentPresenter x:name="PART_Header"
                [ Content             = $$Header,
                  ContentTemplate     = $$HeaderTemplate,
                  HorizontalAlignment = Center,
                  VerticalAlignment   = Center ]
        }
        when ( IsSelected ) { PART_Tab.Stroke = Pen [ Brush = @Primary ]; }
        when ( IsMouseOver ) { PART_Tab.Fill = @StateHoverOverlay; }
        when ( IsFocused ) { PART_Tab.Fill = @StateFocusOverlay; }
        when ( IsPressed ) { PART_Tab.Fill = @StatePressOverlay; }
        when ( IsEnabled = false ) { PART_Tab.Opacity = @DisabledContentOpacity; }
        // Adaptive layout — Compact tightens the header's padding + height,
        // Comfortable loosens both, Coarse pointer enlarges the touch target
        // (>= the 48dp rest). Padding + Height both live on PART_Tab, the
        // tab's interactive header surface, so its hit area tracks these
        // retunes. Mirrors the list family's @Spacing / height ladder.
        when ( ThemeManager.Density = Compact ) {
            PART_Tab.Padding = (@Spacing3,@Spacing1,@Spacing3,@Spacing1);
            PART_Tab.Height = 40;
        }
        when ( ThemeManager.Density = Comfortable ) {
            PART_Tab.Padding = (@Spacing5,@Spacing3,@Spacing5,@Spacing3);
            PART_Tab.Height = 56;
        }
        when ( ThemeManager.Pointer = Coarse ) {
            PART_Tab.Padding = (@Spacing4,@Spacing3,@Spacing4,@Spacing3);
            PART_Tab.Height = 56;
        }
    }
    Style [TargetType = TabItem] {
        Template = @DefaultTabItem;
        // Header ink + M3 typography as INHERITED TextBlock properties — they
        // cascade into the header ContentPresenter's stringified label (and
        // into a HeaderTemplate's labels that don't override them). Selection
        // flips the ink to @Primary, matching the active-indicator underline.
        TextBlock.Foreground = @OnSurfaceVariant;
        // Full Title Small atom set (§ 18.13 — was Font/Weight/Size only, so
        // LineHeight/Tracking fell back to ambient). Cross-class inherited
        // writes into the header label, so not a `Style = @TitleSmall`.
        TextBlock.FontFamily = @TitleSmallFont;
        TextBlock.FontWeight = @TitleSmallWeight;
        TextBlock.FontSize   = @TitleSmallSize;
        TextBlock.LineHeight = @TitleSmallLineHeight;
        TextBlock.LetterSpacing = @TitleSmallTracking;
        when ( IsSelected ) { TextBlock.Foreground = @Primary; }
    }
}
