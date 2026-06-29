// Default theme entries for the shell family — EditorShell and
// ViewerShell, the two application-shell variants.
//
// Both compose existing chrome (TopAppBar, ToolBar, NavigationRail,
// StatusBar, …) into named region hosts; ShellBase routes each body
// child into the host matching its `Shell.Region` attached value, so an
// app author writes:
//
//     EditorShell {
//         TopAppBar      [Shell.Region=Header, Title="Editor"]
//         ToolBar        [Shell.Region=Commands] { … }
//         NavigationRail [Shell.Region=Navigation] { … }
//         Canvas         [Shell.Region=Content]      // or untagged
//         Border         [Shell.Region=Inspector] { … }
//         StatusBar      [Shell.Region=Status] { … }
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
    Template x:key="DefaultEditorShell" [TargetType=EditorShell] {
        Border [Background=@Surface] {
            AdornerDecorator {
                DockPanel [LastChildFill=true] {
                    Border     x:name="PART_HeaderHost"   [DockPanel.Dock=Top]
                    StackPanel x:name="PART_CommandHost"  [DockPanel.Dock=Top,    Orientation=Vertical]
                    Border     x:name="PART_StatusHost"   [DockPanel.Dock=Bottom]
                    Border     x:name="PART_NavHost"      [DockPanel.Dock=Left]
                    Border     x:name="PART_InspectorHost" [DockPanel.Dock=Right]
                    Border     x:name="PART_ContentHost"
                }
            }
        }
    }
    Style [TargetType=EditorShell] {
        Template = @DefaultEditorShell;
    }

    // ── ViewerShell — readonly, navigable view set ─────────────────
    // A header plus a left navigation strip switching between read-only
    // content views. No command surface, inspector, or status bar.
    //   Header     → Top   (PART_HeaderHost, single)
    //   Navigation → Left  (PART_NavHost,    single, stretches)
    //   Content    → fill  (PART_ContentHost, single)
    Template x:key="DefaultViewerShell" [TargetType=ViewerShell] {
        Border [Background=@Surface] {
            DockPanel [LastChildFill=true] {
                Border x:name="PART_HeaderHost" [DockPanel.Dock=Top]
                Border x:name="PART_NavHost"    [DockPanel.Dock=Left]
                Border x:name="PART_ContentHost"
            }
        }
    }
    Style [TargetType=ViewerShell] {
        Template = @DefaultViewerShell;
    }
}
