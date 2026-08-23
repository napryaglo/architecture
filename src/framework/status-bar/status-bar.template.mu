// Default theme entries for the status-bar family — StatusBar
// (bottom strip), StatusBarItem (one cell), StatusBarSeparator.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources StatusBars {
    // ── StatusBar: bottom strip ────────────────────────────────────
    // ItemsControl wrapping each item in a StatusBarItem. The default
    // ItemsPanel is a DockPanel with LastChildFill=true so authors can
    // dock left/right cells via `DockPanel.Dock` on each item and put a
    // stretchy middle one last. Chrome is a single Border on top of
    // @SurfaceContainerLow.
    Template x:key="DefaultStatusBar" [TargetType = StatusBar] {
        Border
            [ Fill      = @SurfaceContainerLow,
              Padding         = (4,2,4,2) ] {
            // Top rule — was Border BorderThickness (0,1,0,0); now a
            // horizontal oriented Line docked Top so it stretches the full
            // width at 1dp along the bar's top edge.
            DockPanel [ LastChildFill = true ] {
                Line [ DockPanel.Dock = Top, Orientation = Horizontal, Stroke = (@OutlineVariant, 1) ]
                ItemsPresenter
            }
        }
    }

    // ── StatusBar: DockPanel items panel ───────────────────────────
    // Dockable cells out of the box. Setting DockPanel.Dock on a
    // StatusBarItem in markup pins it to the corresponding edge; the
    // last un-docked cell fills the residue.
    ItemsPanelTemplate x:key="DefaultStatusBarPanel" {
        DockPanel [ LastChildFill = true ]
    }

    Style [TargetType = StatusBar] {
        Template = @DefaultStatusBar;
        ItemsPanel = @DefaultStatusBarPanel;
    }

    // ── StatusBarItem (one cell) ───────────────────────────────────
    // Padded ContentPresenter. No state triggers — status cells are
    // read-only chrome, not interactive surfaces, so they don't react
    // to IsMouseOver / IsPressed.
    //
    // No Foreground / FontSize setters here: those DPs live on TextBlock,
    // not on Visual / Control / ContentControl, so a Style setter targeting
    // the StatusBarItem type would be silently dropped by apply_setter.
    // Consumers set Foreground / FontSize on the TextBlock they place
    // inside the Content (bound to @OnSurfaceVariant so theme switches
    // re-tint).
    Template x:key="DefaultStatusBarItem" [TargetType = StatusBarItem] {
        Border [ Padding = (8,2,8,2) ] {
            ContentPresenter
        }
    }
    Style [TargetType = StatusBarItem] {
        Template = @DefaultStatusBarItem;
    }

    // ── StatusBarSeparator (vertical divider) ──────────────────────
    // 1-px line painted by the class's RenderOverride. The Style
    // supplies Width / MinHeight / LineBrush so the divider tints
    // follow the active theme.
    Style [TargetType = StatusBarSeparator] {
        Width = 9;
        MinHeight = 16;
        LineBrush = @OutlineVariant;
    }
}
