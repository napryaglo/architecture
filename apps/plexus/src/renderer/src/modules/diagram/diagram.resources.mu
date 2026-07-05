// diagram.resources.mu — view resources for Plexus's diagram editor, ported
// from the Diagrammer demo (demo/demos/diagram) and distributed across the
// shell regions. Merged app-global by app.mu (`merge DiagramResources`).
//
// Holds: the icon geometries (align/distribute/group/ungroup, baked from SVG)
// and the four boolean-combine glyphs (baked from the Material Symbols font at
// compile time); the toolbar-button template the Commands region iterates; the
// draggable toolbox tile; the ToolBox capability's shapes panel; and the CANVAS
// itself — a `DataTemplate[DataType=DiagramDocument]` the content host presents
// for the active diagram document (materializing the Diagram control in-tree).

import ToolBoxService from "./services/diagram-panel-services.js"

resources DiagramResources {
    // ── Icon geometries ─────────────────────────────────────────────────
    // SVG → shared Geometry at compile time (paint dropped; a Shape paints
    // each with a theme brush). @alignLeft, @group, @distributeHorizontal, …
    include "assets/icons/*.svg"

    // Boolean-combine glyphs baked from the Material Symbols font into
    // PathGeometry at COMPILE time (one per name). The font is compile-time
    // only — the baked geometry ships, not the .ttf. Venn glyphs map onto the
    // set ops: union → @join, intersect → @join_inner, subtract → @join_left,
    // exclude → @difference.
    glyphs "assets/material-symbols-outlined.ttf" {
        join
        join_inner
        join_left
        difference
    }

    // ── Canvas ItemsPanel — a paginated canvas whose measured extent grows
    // as nodes move/drop past the bounds (the enclosing ScrollViewer in the
    // Diagram's own template tracks it). ──
    ItemsPanelTemplate x:key="DiagramCanvasPanel" {
        PaginatedCanvas [ PageWidth = 800, PageHeight = 600 ]
    }

    // ── Canvas — the diagram surface, materialized in-tree ──────────────
    // The Content region presents the active DiagramDocument
    // (DocumentsContentHostService.ActiveDocument) through this template.
    // Because the Diagram is created BY the template — attached in the live
    // tree — its alignment / resize / connector-interaction adorners mount
    // against a live AdornerLayer with no detached-build re-assert hack.
    // Mutator auto-wires from the DataContext (DiagramDocument IS a
    // DiagramMutator); the control publishes itself back onto the document's
    // ActiveView (IDiagramViewHost) so the shell's Commands / Inspector regions
    // reach its editing commands + selection-format state. DropReceiver = $Self
    // (the Diagram is on every canvas drop's bubble path). Mirrors the
    // Diagrammer demo's Diagram declaration (demo/demos/diagram).
    DataTemplate [ DataType = DiagramDocument ] {
        Diagram
            [ ItemsSource                  = $Nodes,
              Connectors                   = $Connectors,
              ItemsPanel                   = @DiagramCanvasPanel,
              SelectionMode                = Extended,
              AllowMarqueeSelection        = true,
              AlignmentGuidesEnabled       = true,
              SelectionResizeEnabled       = true,
              ConnectorInteractionsEnabled = true,
              ReflectSelectionToItems      = true,
              DropReceiver                 = $Self,
              Focusable                    = true ]
    }

    // ── Toolbox ItemsPanel — 2-column grid so the tiles fit a narrow pane ─
    ItemsPanelTemplate x:key="DiagramToolboxPanel" {
        WrapPanel
    }

    // ── Toolbox tile — a draggable picture + label. The picture is the
    // ToolboxShape's PreviewNode (a per-Kind Figure sized 48×48) slotted into a
    // ContentControl. Dragging emits the `mural/node-kind` payload; dropping on
    // the canvas fires the Diagram's ItemDropped → Document.CreateNode. ──
    DataTemplate x:key="DiagramTileTemplate" [DataType = ToolboxShape] {
        Border x:root
            [ IsDraggable     = true,
              OnDragStart     = $BeginKindDragData,
              Background      = @Surface,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1),
              CornerRadius    = 4,
              Padding         = (4,8,4,8),
              Margin          = (2,0,2,4) ] {
            StackPanel [ Orientation = Vertical, HorizontalAlignment = Center ] {
                ContentControl
                    [ Content             = $PreviewNode,
                      Width               = 48,
                      Height              = 48,
                      HorizontalAlignment = Center ]
                TextBlock
                    [ Text                = $Label,
                      FontSize            = 10,
                      Foreground          = @OnSurface,
                      Margin              = (0,4,0,0),
                      HorizontalAlignment = Center ]
            }
        }
    }

    // ── ToolBox capability panel — the shapes palette in the left pane.
    // Overrides the generic `DataTemplate [DataType = PlexusPanelService]` for
    // the ToolBoxService subtype (exact-type match wins), rendering the live
    // $Shapes through the toolbox tile. ──
    DataTemplate [DataType = ToolBoxService] {
        // No explicit Width — the shell's side pane now has a definite Width and
        // a Star content column (see @PlexusSideContentPane), so this content
        // measures against the pane width and the WrapPanel wraps to it.
        Border [ Padding = (8) ] {
            DockPanel {
                TextBlock
                    [ DockPanel.Dock = Top,
                      Text           = "Shapes",
                      Style          = @LabelMedium,
                      Foreground     = @OnSurfaceVariant,
                      Margin         = (2,0,0,8) ]
                TextBlock
                    [ DockPanel.Dock = Bottom,
                      Text           = "Drag a shape onto the canvas. Click to select; Ctrl-click to toggle; Shift-click to range-extend; drag-rectangle to marquee; Delete removes the selection.",
                      TextWrapping   = Wrap,
                      FontSize       = 10,
                      MaxWidth       = 100,
                      Foreground     = @OnSurfaceVariant,
                      Margin         = (2,8,2,0) ]
                // HorizontalScrollEnabled = false so the ScrollViewer measures
                // its content at the viewport width instead of +Infinity —
                // otherwise the WrapPanel gets unbounded width and never wraps
                // (overflow becomes horizontal scroll). The palette only scrolls
                // vertically.
                ScrollViewer [ IsAutoHideScrollBars = false, HorizontalScrollEnabled = false ] {
                    ItemsControl [ ItemsSource = $Shapes, ItemsPanel = @DiagramToolboxPanel ]
                }
            }
        }
    }
}
