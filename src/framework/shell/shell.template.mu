// Default theme entries for the shell family — EditorShell and
// ViewerShell, the two application-shell variants.
//
// Both compose existing chrome (TopAppBar, ToolBar, NavigationRail,
// StatusBar, …) into named region hosts. The shell is services-driven: it
// takes no body children. Each region host binds its content declaratively
// via `$service(Token)` — the Navigation host to the NavigationService
// (whose destinations flatten from the modules composed on the Application),
// the Inspector / Status hosts to their services. An app composes a shell by
// declaring modules and registering services, not by tagging children:
//
//     Application {
//         .modules: { DiagramModule; LayersModule; … }
//         resources: { EditorShell x:root { } }
//     }
//
// Merged into the root MuralFramework dictionary via an `import` clause
// in src/resources/framework.resources.mu.

resources Shells {
    // ── EditorShell — full editing chrome ──────────────────────────
    // Region → DockPanel edge (Content fills the remainder):
    //   Header     → Top      (PART_HeaderHost,    single)
    //   Commands   → Top      (PART_CommandHost,   stacked: menu+toolbar)
    //   Status     → Bottom   (PART_StatusHost,    single)
    //   Navigation → Left     (PART_NavHost,       single, stretches)
    //   Inspector  → Right    (PART_InspectorHost, single)
    //   Content    → fill     (PART_ContentHost,   single)
    //
    // Dock order matters: edges are consumed top-down in child order,
    // and PART_ContentHost is last so LastChildFill hands it the
    // remaining rectangle. The hosts ship empty and zero-size — an
    // unused region simply collapses.

    DataTemplate [DataType = NavigationService] {
        NavigationRail
            [ ItemsSource        = $Items,
              SelectedItem       = $SelectedItem,
              Template           = @ActivityBarRail,
              ItemContainerStyle = @ActivityBarItem ]
    }

    Template x:key="DefaultEditorShell" [TargetType = EditorShell] {
        Border [ Background = @Surface ] {
            AdornerDecorator {
                DockPanel [ LastChildFill = true ] {
                    Border x:name="PART_HeaderHost" [ DockPanel.Dock = Top ]
                    StackPanel x:name="PART_CommandHost"
                        [ DockPanel.Dock = Top,
                          Orientation    = Vertical ]
                    Border x:name="PART_StatusHost"
                        [ DockPanel.Dock = Bottom,
                          DataContext    = $service(StatusService) ]

                    // capabilities navigation rail — the shell's activity bar.
                    ContentControl [ DockPanel.Dock = Left, Content = $service(NavigationService) ]

                    // left sided panel that helps to interact with the selected capability
                    ContentControl
                        [ DockPanel.Dock = Left,
                          Width          = 300,
                          Background     = @SurfaceContainer,
                          Content        = $service(NavigationService).ActiveService ]

                    Border x:name="PART_InspectorHost"
                        [ DockPanel.Dock = Right,
                          DataContext    = $service(InspectorService) ]
                    // Content region — presents the active capability's service.
                    // NavigationService.ActiveService tracks the selected
                    // destination's Capability.ServiceKey (resolved from the
                    // container), so selecting a rail item swaps the content
                    // shown here (fill, via LastChildFill).
                    ContentPresenter x:name="PART_ContentHost"
                }
            }
        }
    }
    Style [TargetType = EditorShell] {
        Template = @DefaultEditorShell;
    }

    // ── ViewerShell — readonly, navigable view set ─────────────────
    // A header plus a left navigation strip switching between read-only
    // content views. No command surface, inspector, or status bar.
    //   Header     → Top   (PART_HeaderHost, single)
    //   Navigation → Left  (PART_NavHost,    single, stretches)
    //   Content    → fill  (PART_ContentHost, single)
    Template x:key="DefaultViewerShell" [TargetType = ViewerShell] {
        Border [ Background = @Surface ] {
            DockPanel [ LastChildFill = true ] {
                Border x:name="PART_HeaderHost" [ DockPanel.Dock = Top ]
                Border x:name="PART_NavHost"
                    [ DockPanel.Dock = Left,
                      DataContext    = $service(NavigationService) ]
                ContentPresenter x:name="PART_ContentHost"
                    [ Content = $service(NavigationService).ActiveService ]
            }
        }
    }
    Style [TargetType = ViewerShell] {
        Template = @DefaultViewerShell;
    }
}
