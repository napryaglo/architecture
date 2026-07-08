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

    // The activity bar's header / footer action lists live INLINE in the
    // @ActivityBarRail template (navigation.template.mu), presenting the
    // NavigationService's HeaderActions / FooterActions — so each rail
    // materialises its own (a shared keyed Visual can't parent into multiple
    // rails). This template just points the rail at that chrome + its item
    // container style.
    DataTemplate [DataType = NavigationService] {
        NavigationRail
            [ ItemsSource        = $Items,
              SelectedItem       = $SelectedItem,
              Template           = @ActivityBarRail,
              ItemContainerStyle = @ActivityBarItem ]
    }

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
                    // Presents the NavigationService, rendered by
                    // DataTemplate[NavigationService] as an @ActivityBarRail.
                    ContentControl x:name="PART_NavHost"
                        [ DockPanel.Dock = Left, Content = $service(NavigationService) ]

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

                    // Inspector region — presents the InspectorService, a HOST for
                    // multiple dynamically-added inspectors, rendered by
                    // DataTemplate[InspectorService] as a pinned, collapsible panel
                    // stack (VS-style property panels). Something in the app Add()s
                    // an inspector (e.g. a diagram's "Format Shape" command adds a
                    // DiagramInspector → the Format Shape pane). Empty ⇒ zero-width ⇒
                    // the region collapses.
                    // Definite Width lives HERE (the docked element the adjacent
                    // Splitter resizes as its previous sibling) — NOT pinned on the
                    // inner InspectorStack, or the drag would grow this presenter
                    // while the visible pane stayed fixed and the content host
                    // absorbed the change. Everything below fills this width.
                    ContentPresenter x:name="PART_InspectorHost"
                        [ DockPanel.Dock = Right,
                          Width          = 300,
                          Content        = $service(InspectorService) ]
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

    // ── Base single-content host ────────────────────────────────────────
    // The base ContentHostService presents ONE object at a time: whatever
    // View() last set, dispatched to a DataTemplate by its runtime type.
    // Without this template a base-host instance rendered through
    // `$service(ContentHostService)` falls to ContentPresenter's stringify path
    // and reads "[object Object]". DocumentsContentHostService (below) is a
    // more-specific match, so the TDI TabControl still wins for the tabbed-
    // document host; single-content consumers (e.g. the demo platform's group
    // content) resolve THIS one.
    //
    // The Content is bound with a SERVICE binding (`$service(…).Content`), not a
    // DataContext binding (`$Content`). A `$Content` here is self-defeating: the
    // presenter's DataContext is the service, but ContentPresenter re-points its
    // OWN DataContext to whatever it presents (the resolved content), so after
    // the first View() the `$Content` source is clobbered and never updates.
    // The service binding resolves through the provider instead, so it stays
    // reactive to every View() swap. (This mirrors the proven pre-TabControl
    // shell binding on PART_ContentHost.)
    DataTemplate [DataType = ContentHostService] {
        ContentPresenter [ Content = $service(ContentHostService).Content ]
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
    //
    // DataType is nominal here: the template is KEYED and applied explicitly as
    // the TabControl's ItemTemplate (never type-dispatched), so a keyed template
    // registers under its key alone — the DataType never drives resolution. The
    // compiler nonetheless requires a DataType on every DataTemplate, and the
    // framework ships no concrete IDocument class to name, so this carries the
    // structurally-compatible RailAction (also a Command-bearing row) as a
    // placeholder. See the note in the shell tests.
    DataTemplate x:key="DocumentTabHeaderTemplate" [DataType = RailAction] {
        StackPanel [ Orientation = Horizontal, VerticalAlignment = Center ] {
            TextBlock [ Text = $Title, VerticalAlignment = Center, Margin = (4,0,0,0) ]
            IconButton
                [ Variant          = Standard,
                  Command          = $service(ContentHostService).CloseDocumentCommand,
                  CommandParameter = $Id,
                  Margin           = (2,0,0,0) ] {
                Shape [ Geometry = @IconClose, Fill = @OnSurfaceVariant, Width = 14, Height = 14 ]
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

    // ── Inspector region — a pinned, collapsible inspector-panel stack ──────
    // The InspectorService hosts a dynamic set of inspectors; the region renders
    // it as a vertical stack of collapsible panels (@DefaultInspectorStack). Each
    // panel's BODY is the inspector rendered through its own
    // DataTemplate[DataType=<inspector>]; the titled, collapsible chrome comes from
    // the InspectorPanel container. An empty host shows "(EMPTY)" (so a wired-but-
    // empty region is legible, not a blank void).
    DataTemplate [DataType = InspectorService] {
        InspectorStack [ ItemsSource = $Inspectors ]
    }

    // Vertical panel host for the inspector stack.
    ItemsPanelTemplate x:key="InspectorStackPanel" {
        StackPanel [ Orientation = Vertical ]
    }

    // InspectorStack chrome: a bordered, definite-min-width column hosting the
    // panel stack (scrolled), with an "(EMPTY)" placeholder shown while the host
    // has no inspectors. MinWidth keeps the docked-Right region visible so the
    // placeholder (and the wiring it proves) is always on screen.
    Template x:key="DefaultInspectorStack" [TargetType = InspectorStack] {
        // No fixed width here — the pane's width lives on PART_InspectorHost (the
        // resizable docked presenter); this chrome fills it.
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerLow,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1,0,0,0) ] {
            Grid {
                // No wrapping ScrollViewer: a ScrollViewer arranges its content at
                // the content's DESIRED width (a vertical StackPanel desires only
                // its widest child), so panels would size to their header text
                // instead of filling the pane. The ItemsPresenter sits directly in
                // the Grid so the StackPanel arranges each InspectorPanel at the
                // full pane width. Tall panel bodies scroll via their own inner
                // ScrollViewer (e.g. the Format Shape body).
                ItemsPresenter x:name="PART_ItemsPresenter"
                TextBlock x:name="PART_Empty"
                    [ Text                = "(EMPTY)",
                      Visibility          = Collapsed,
                      HorizontalAlignment = Center,
                      VerticalAlignment   = Top,
                      Margin              = (0,16,0,0),
                      Style               = @LabelMedium,
                      Foreground          = @OnSurfaceVariant ]
            }
        }
        when ( HasItems = false ) { PART_Empty.Visibility = Visible; }
    }
    Style [TargetType = InspectorStack] {
        Template   = @DefaultInspectorStack;
        ItemsPanel = @InspectorStackPanel;
    }

    // ── InspectorPanel — one titled, collapsible section ────────────────────
    // Header bar: a chrome-less toggle (chevron + title) that fills the row and
    // flips IsExpanded via ToggleExpandedCommand, plus a close affordance docked
    // right (reaches the host via $service and passes the inspector's Id). Body:
    // the ContentPresenter ContentControl slots the inspector into — hidden by
    // the `when (IsExpanded = false)` trigger so the panel shrinks to its header.
    Template x:key="DefaultInspectorPanel" [TargetType = InspectorPanel] {
        Border x:name="PART_Border"
            [ Background      = @SurfaceContainerLow,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (0,0,0,1) ] {
            DockPanel [ LastChildFill = true ] {
                Border x:name="PART_HeaderBar"
                    [ DockPanel.Dock = Top,
                      Background     = @SurfaceContainer,
                      Padding        = (4,2,4,2) ] {
                    DockPanel [ LastChildFill = true ] {
                        IconButton
                            [ DockPanel.Dock  = Right,
                              Variant          = Standard,
                              Command          = $service(InspectorService).CloseInspectorCommand,
                              CommandParameter = $Id ] {
                            Shape [ Geometry = @IconClose, Fill = @OnSurfaceVariant, Width = 14, Height = 14 ]
                        }
                        IconButton x:name="PART_HeaderToggle"
                            [ Variant = Standard,
                              Command = $$ToggleExpandedCommand ] {
                            StackPanel [ Orientation = Horizontal, VerticalAlignment = Center, HorizontalAlignment = Left ] {
                                Shape x:name="PART_Chevron"
                                    [ Geometry   = @ChevronDown,
                                      Fill       = @OnSurfaceVariant,
                                      Width      = 12,
                                      Height     = 12,
                                      Margin     = (0,0,6,0) ]
                                TextBlock
                                    [ Text       = $Title,
                                      Style      = @LabelMedium,
                                      Foreground = @OnSurfaceVariant ]
                            }
                        }
                    }
                }
                ContentPresenter x:name="PART_Body"
            }
        }
        when ( IsExpanded = false ) {
            PART_Body.Visibility = Collapsed;
            PART_Chevron.Geometry = @ChevronRight;
        }
    }
    Style [TargetType = InspectorPanel] {
        Template = @DefaultInspectorPanel;
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
