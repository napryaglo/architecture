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
              ItemContainerStyle = @ActivityBarItem,
              Header             = @RailHeaderActions,
              Footer             = @RailFooterActions ]
    }

    // Rail chrome-slot action lists — the Header (top) and Footer (bottom)
    // slots of the activity bar present the NavigationService's HeaderActions /
    // FooterActions (a settings gear, help, account, …). Each is a shared
    // ItemsControl slotted into the rail's Header/Footer content DP; its
    // DataContext is the NavigationService (inherited from the rail), so
    // $HeaderActions / $FooterActions resolve. Empty collections render nothing,
    // so a shell that contributes no actions shows a bare rail.
    ItemsPanelTemplate x:key="RailActionsPanel" {
        StackPanel [ Orientation = Vertical ]
    }
    ItemsControl x:key="RailHeaderActions"
        [ ItemsSource = $HeaderActions, ItemsPanel = @RailActionsPanel ]
    ItemsControl x:key="RailFooterActions"
        [ ItemsSource = $FooterActions, ItemsPanel = @RailActionsPanel ]

    // One rail action → an icon-only button that invokes its Command. Icon is
    // the app-supplied Geometry the RailAction carries (the framework ships no
    // icons); empty until the app provides one.
    DataTemplate [DataType = RailAction] {
        IconButton [ Variant = Standard, Command = $Command ] {
            Shape [ Geometry = $Icon, Fill = @OnSurfaceVariant, Width = 22, Height = 22 ]
        }
    }

    Template x:key="DefaultEditorShell" [TargetType = EditorShell] {
        Border [ Background = @Surface ] {
            AdornerDecorator {
                DockPanel [ LastChildFill = true ] {
                    Border x:name="PART_HeaderHost" [ DockPanel.Dock = Top ]

                    // Command toolbar — data-driven. The ToolbarService filters
                    // the app's declared CommandDefinitions by the active
                    // document's command contexts and dispatches each to that
                    // document; the strip is empty (and collapses) until an app
                    // registers commands + a command-target document is active.
                    Border x:name="PART_CommandHost"
                        [ DockPanel.Dock  = Top,
                          Background      = @SurfaceContainer,
                          BorderBrush     = @OutlineVariant,
                          BorderThickness = (0,0,0,1),
                          Padding         = (8,4,8,4) ] {
                        ItemsControl
                            [ ItemsSource = $service(ToolbarService).VisibleCommands,
                              ItemsPanel  = @CommandBarPanel ]
                    }

                    StatusBar x:name="PART_StatusHost"
                        [ DockPanel.Dock = Bottom,
                          DataContext    = $service(StatusService),
                          ItemsSource    = $Items ]

                    // capabilities navigation rail — the shell's activity bar.
                    ContentControl [ DockPanel.Dock = Left, Content = $service(NavigationService) ]

                    // Left panel for interacting with the selected capability —
                    // a titled side pane (VSCode Explorer shape). A DEFINITE Width
                    // + a Star content column (see DefaultShellSideContentPane) so
                    // capability content has a bounded width to lay out against and
                    // the drag handle below can resize it. Header = the active
                    // capability's name; Commands = the active service's
                    // HeaderCommands; Content = the active service, rendered by its
                    // DataTemplate.
                    ShellSideContentPane x:name="PART_SidePane"
                        [ DockPanel.Dock = Left,
                          Width          = 240,
                          Header         = $service(NavigationService).SelectedItem.Label,
                          Commands       = $service(NavigationService).ActiveService.HeaderCommands,
                          Content        = $service(NavigationService).ActiveService ]

                    // Drag handle to resize the side pane. A Splitter resizes its
                    // PREVIOUS sibling, so docked Left right after the pane it
                    // rewrites the ShellSideContentPane's Width; Orientation
                    // defaults to Vertical (ew-resize).
                    Splitter [ DockPanel.Dock = Left, Width = 6 ]

                    // Inspector region — presents the active document's Inspector
                    // (a document exposes one when it has properties to edit; a
                    // DiagramDocument → DiagramInspector → the Format Shape pane).
                    // Empty (collapsed) when the active document has no inspector.
                    // The pane owns its own width/chrome, so this presenter is bare.
                    ContentPresenter x:name="PART_InspectorHost"
                        [ DockPanel.Dock = Right,
                          Content        = $service(ContentHostService).ActiveDocument.Inspector ]
                    Splitter
                        [ DockPanel.Dock   = Right,
                          Width            = 6,
                          Orientation      = Vertical,
                          ReverseDirection = true ]

                    // Content region — presents the ContentHostService ITSELF
                    // (fill, via LastChildFill). The default host is a
                    // DocumentsContentHostService, rendered by
                    // `DataTemplate[DocumentsContentHostService]` as a TabControl
                    // (tab headers + the active document's body — the editor
                    // group). A plain ContentHostService (no matching template)
                    // falls back to presenting its Content; apps swapping in
                    // their own host supply the matching DataTemplate.
                    ContentPresenter x:name="PART_ContentHost"
                        [ Content = $service(ContentHostService) ]
                }
            }
        }
    }

    // Command bar: horizontal row; one button per CommandViewModel the
    // ToolbarService surfaces (Command = the VM's RelayCommand; icon = the
    // CommandDefinition's Icon).
    ItemsPanelTemplate x:key="CommandBarPanel" {
        StackPanel [ Orientation = Horizontal ]
    }
    DataTemplate [DataType = CommandViewModel] {
        IconButton [ Variant = Standard, Command = $Command, Margin = (1,0,1,0) ] {
            Shape [ Geometry = $Definition.Icon, Fill = @OnSurfaceVariant, Width = 20, Height = 20 ]
        }
    }

    // ── Documents area — the editor group ──────────────────────────────
    // The content host is a DocumentsContentHostService (the shell's default
    // under ContentHostService.Key). It renders as a TabControl: the header
    // strip lists the open documents, and the TabControl's content area shows
    // the active document's body through ITS DataTemplate (e.g. a
    // DataTemplate[DiagramDocument] painting a canvas). SelectedItem TwoWay-
    // binds to ActiveDocument so clicking a tab activates it and an
    // Open()/Close() re-selects. ItemTemplate is the TAB HEADER (WPF
    // semantics) — title + close.
    DataTemplate [DataType = DocumentsContentHostService] {
        TabControl
            [ ItemsSource  = $OpenDocuments,
              SelectedItem = $ActiveDocument,
              ItemTemplate = @DocumentTabHeaderTemplate ]
    }

    // One tab header: title + a close affordance, rendered for every IDocument
    // (each carries Title / Id). DataContext is the document. Close reaches the
    // host via `$service` and passes the document's Id. The close glyph is a
    // text "✕" (the framework ships no icons). The title leaves Foreground
    // UNSET so it inherits the TabItem's selection ink (@OnSurfaceVariant at
    // rest, @Primary when selected — see the TabItem Style).
    DataTemplate x:key="DocumentTabHeaderTemplate" [DataType = RailAction] {
        StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
            TextBlock [ Text = $Title, VerticalAlignment = Center, Margin = (4,0,0,0) ]
            IconButton
                [ Variant          = Standard,
                  Command          = $service(ContentHostService).CloseDocumentCommand,
                  CommandParameter = $Id,
                  Margin           = (2,0,0,0) ] {
                TextBlock [ Text = "✕", FontSize = 11, Foreground = @OnSurfaceVariant ]
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

    // ── ShellSideContentPane — a titled side pane (VSCode Explorer shape) ──
    // A header bar pairing a title (Header, left) with a Commands block (right),
    // over the pane's Content. Header = the title STRING; Commands = a free
    // content slot (a button row, a "…" menu); Content = the pane body.
    //
    // Layout is a two-row Grid — NOT a DockPanel — for one reason: ContentControl
    // binds Content to the FIRST ContentPresenter in the template's depth-first
    // walk. Declaring the content presenter FIRST (positioned into row 1 by
    // Grid.Row) makes it that presenter; PART_Commands is a second, independent
    // ContentPresenter the base ignores. In a DockPanel the fill child must be
    // last, which would put the content presenter after Commands and mis-bind.
    Template x:key="DefaultShellSideContentPane" [TargetType = ShellSideContentPane] {
        Border
            [ Background      = $$Background,
              BorderBrush     = $$BorderBrush,
              BorderThickness = $$BorderThickness ] {
            Grid {
                // Star column: the content fills the pane's definite Width (set
                // on the pane instance in DefaultEditorShell), so capability
                // content has a bounded width to lay out against (a WrapPanel
                // wraps to it) and reflows live as the resize Splitter rewrites
                // that Width. The pane is docked (not in the fill region), so
                // Star fills the pane's own width, not the shell's content area.
                ColumnDefinitions {
                    ColumnDefinition [ Width = GridLength.Star ]
                }
                RowDefinitions {
                    RowDefinition [ Height = GridLength.Auto ] // header bar
                    RowDefinition [ Height = GridLength.Star ] // content body
                }

                // Content body FIRST → the ContentPresenter ContentControl uses.
                ContentPresenter x:name="PART_ContentHost" [ Grid.Row = 1 ]

                // Header bar: title fills, commands docked right. A DockPanel
                // (not a Grid) so it sizes to content without needing row defs.
                Border x:name="PART_Header"
                    [ Grid.Row = 0,
                      Padding  = (@Spacing3,@Spacing2,@Spacing2,@Spacing2) ] {
                    DockPanel [ LastChildFill = true ] {
                        ContentPresenter x:name="PART_Commands"
                            [ DockPanel.Dock    = Right,
                              Content           = $$Commands,
                              VerticalAlignment = Center ]
                        TextBlock x:name="PART_Title"
                            [ Style             = @TitleSmall,
                              Text              = $$Header,
                              Foreground        = @OnSurfaceVariant,
                              VerticalAlignment = Center ]
                    }
                }
            }
        }
    }
    Style [TargetType = ShellSideContentPane] {
        Template = @DefaultShellSideContentPane;
        Background = @SurfaceContainer;
    }
}
