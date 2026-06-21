// Default theme entries for the tooltips family — the Tooltip
// ContentControl plus the CommandBase DataTemplate that renders
// command metadata inside a Tooltip's Content.
//
// ToolTipService (sibling tooltip-service.ts) has no chrome of its
// own — it manages a pooled Tooltip instance and an OverlayLayer
// mount, all programmatic.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Tooltips {

    // ── Tooltip — M3 plain/rich surface ────────────────────────────
    // The Tooltip is a ContentControl: its Content goes through a
    // ContentPresenter that handles strings (auto-TextBlock), VMs
    // (DataTemplate dispatch), and Visuals (slotted directly). Consumers
    // pick the shape by what they hand to ToolTipService.ToolTip — the
    // control itself stays one chrome.
    //
    // Default Visibility=Collapsed so a freshly-constructed Tooltip
    // doesn't paint until ToolTipService flips it Visible at show time.
    // ToolTipService keeps a single pooled instance; updating Content
    // and Visibility on the pooled instance is cheaper than allocating
    // chrome on every hover.
    //
    // Foreground=@InverseOnSurface on the Style so a string Content
    // (which ContentPresenter wraps in a TextBlock with no explicit
    // Foreground) inherits the correct ink for the @InverseSurface
    // background.
    Template x:key="DefaultTooltip" [TargetType=Tooltip] {
        Border [Background=@InverseSurface,
                CornerRadius=@ShapeExtraSmall,
                Padding=(@Spacing2, @Spacing1, @Spacing2, @Spacing1),
                MinHeight=24, MaxWidth=320,
                Effect=@Elevation2]{
            StackPanel [Orientation=Vertical] {
                ContentPresenter [Content=$Content]
                // Shortcut hint — M3 LabelSmall, 70% opacity for
                // secondary emphasis. Foreground is set explicitly
                // because the default TextBlock Style (basic.mu)
                // sets Foreground=@OnSurface at higher precedence
                // than the @InverseOnSurface that would otherwise
                // inherit from the Tooltip.
                TextBlock x:name="PART_Shortcut"
                          [Style=@LabelSmall, Text=$Shortcut,
                           Foreground=@InverseOnSurface,
                           Opacity=0.7,
                           Margin=(0,2,0,0)]
            }
        }
        when ( Shortcut = "" ) { PART_Shortcut.Visibility = Collapsed; }
    }

    // Tooltip Style — sets the M3 BodySmall atoms as the inherited
    // type scale so a plain-string Content (wrapped in an unstyled
    // TextBlock by ContentPresenter) renders at plain-tooltip metrics.
    // Rich-content templates (e.g., [DataType=CommandBase] below)
    // override these on a per-row basis with TitleSmall / BodySmall.
    Style [TargetType=Tooltip] {
        Template      = @DefaultTooltip;
        Visibility    = Collapsed;
        Foreground    = @InverseOnSurface;
        FontFamily    = @BodySmallFont;
        FontWeight    = @BodySmallWeight;
        FontSize      = @BodySmallSize;
        LineHeight    = @BodySmallLineHeight;
        LetterSpacing = @BodySmallTracking;
    }

    // CommandBase implicit DataTemplate. Resolved by ContentPresenter
    // when a Tooltip's Content is a CommandBase (RoutedCommand /
    // RelayCommand / consumer subclass). Renders the command's display
    // metadata using M3 rich-tooltip typography — TitleSmall for the
    // subhead (Text) and BodySmall for the supporting paragraph
    // (Description). The surrounding Tooltip chrome layers the shortcut
    // row on top (populated via Tooltip.Shortcut by ToolTipService).
    //
    // An empty Description binds an empty Text on the second TextBlock
    // — it consumes ~0 height and reads as a normal vertical gap.
    // A future Visibility-binding-from-empty-string converter would
    // collapse the row entirely; not worth shipping until the Visibility
    // DP grows a built-in "hide when empty string" helper.
    DataTemplate [DataType=CommandBase] {
        StackPanel [Orientation=Vertical] {
            // Foreground is pinned to @InverseOnSurface because the
            // default Style [TargetType=TextBlock] (basic.mu) sets
            // Foreground=@OnSurface at higher DP precedence than the
            // value that would otherwise inherit from the Tooltip.
            TextBlock [Style=@TitleSmall, Text=$Text,
                       Foreground=@InverseOnSurface,
                       TextWrapping=Wrap]
            TextBlock [Style=@BodySmall,  Text=$Description,
                       Foreground=@InverseOnSurface,
                       TextWrapping=Wrap,
                       Opacity=0.7,
                       Margin=(0,2,0,0)]
        }
    }
}
