// Default theme entry for the bottom-app-bar family — BottomAppBar
// (M3 bottom action strip; leading icon-button row + trailing FAB slot).
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources BottomAppBars {
    // ── BottomAppBar: M3 bottom action strip ───────────────────────
    // Single shape (no size variants). 80dp tall, @SurfaceContainer
    // container with Level2 resting elevation. A 2-column Grid: the
    // leading star column holds PART_ActionsStack (a horizontal row of
    // icon buttons the class mirrors the Actions collection into), the
    // trailing Auto column holds PART_FabSlot (a Border whose Child the
    // class swaps to the FloatingAction DP value).
    //
    // Density / coarse-pointer padding triggers loosen the action row
    // for compact/comfortable modes and touch input, matching the
    // adaptive-trigger pattern the button + list families use.
    Template x:key="DefaultBottomAppBar" [TargetType = BottomAppBar] {
        Border x:name="PART_Border"
            [ Background = @SurfaceContainer,
              Height     = 80,
              Effect     = @ElevationLevel2 ] {
            Grid {
                ColumnDefinitions {
                    ColumnDefinition [ Width = GridLength.Star ]
                    ColumnDefinition [ Width = GridLength.Auto ]
                }
                StackPanel x:name="PART_ActionsStack"
                    [ Grid.Column         = 0,
                      Orientation         = Horizontal,
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Left,
                      Margin              = (4,0,4,0) ]
                Border x:name="PART_FabSlot"
                    [ Grid.Column         = 1,
                      VerticalAlignment   = Center,
                      HorizontalAlignment = Right,
                      Margin              = (8,0,16,0) ]
            }
        }
        when ( ThemeManager.Density = Compact ) { PART_ActionsStack.Margin = (0,0,0,0); }
        when ( ThemeManager.Density = Comfortable ) { PART_ActionsStack.Margin = (8,0,8,0); }
        when ( ThemeManager.Pointer = Coarse ) { PART_ActionsStack.Margin = (8,0,8,0); }
    }

    Style [TargetType = BottomAppBar] {
        Template = @DefaultBottomAppBar;
    }
}
