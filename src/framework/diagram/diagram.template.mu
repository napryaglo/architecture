// Default theme entries for the diagram family — Diagram (the
// templated ItemsControl-derived workspace), Figure (the per-item
// movable shape host), and Group (the bbox-chrome overlay for
// hierarchical grouping). Each control owns its own Style here so
// applyDefaultStyle() lands the right Template the moment the
// constructor finishes.
//
// Merged into the root MuralFramework dictionary via an `import`
// clause in src/resources/framework.resources.mu.

resources Diagrams {
    // ── Figure: per-item shape host ────────────────────────────────
    //
    // Template = Canvas { Shape + TextBlock }. The Shape primitive
    // paints the Figure's Geometry / Fill / Stroke; the TextBlock
    // overlays LabelText centred on the same footprint. Width / Height
    // template-bind to the Figure's measured size so a resize re-paints
    // both children at the new dimensions (Figure._rebuildGeometry
    // re-scales the unit-1 source into Geometry whenever Width / Height
    // change, so the Shape's Geometry binding fires in lock-step with
    // the dimensional bindings).
    //
    // No ContentPresenter — the framework's intended use is items-are-
    // Figures (data and visual fused). The fallback wrap-non-Figure
    // path in Diagram.GetContainerForItemOverride sets Content but the
    // shape painted is the Figure's own, not the wrapped value; the
    // unused Content there is a known wart inherited from earlier
    // iterations and not in scope for this template.
    Template x:key="DefaultFigure" [TargetType = Figure] {
        Canvas {
            Shape x:name="PART_Shape"
                [ Geometry = $$Geometry,
                  Fill     = $$Fill,
                  Stroke   = $$Stroke,
                  Width    = $$Width,
                  Height   = $$Height ]
            TextBlock x:name="PART_Label" [ Text = $$LabelText, Width = $$Width, Height = $$Height ]
        }
    }
    Style [TargetType = Figure] {
        Template = @DefaultFigure;
    }

    // ── Group: bbox-chrome overlay ─────────────────────────────────
    //
    // Members live as siblings of the Group inside the Diagram's flat
    // Items collection (Visio / PowerPoint convention) — NOT as visual
    // children of the Group. So the Group's template is pure overlay
    // chrome: a Border sized to the Group's Width / Height carrying a
    // selection-driven outline.
    //
    // Resting: transparent (zero-thickness border) so an unselected
    // group is invisible — the leaves underneath read uninterrupted.
    // Selected: a 1-DIP @Primary outline rounds the bbox. Width /
    // Height template-bind so the Border tracks the union-bbox extent
    // Group._recomputeBounds writes onto WidthKey / HeightKey.
    Template x:key="DefaultGroup" [TargetType = Group] {
        // IsHitTestVisible=false on the chrome Border. The bbox is
        // purely visual decoration — its `<rect class="mural-hit">`
        // would otherwise carry pointer-events:all and swallow clicks
        // on member Figures that visually sit inside the union. With
        // the pad disabled, clicks pass through to whichever member is
        // under the cursor (Figure.OnPointerDown then elevates the
        // Selector to the enclosing Group via the Parent chain).
        Border x:name="PART_Border"
            [ Background       = #00000000,
              BorderBrush      = @Primary,
              BorderThickness  = (0),
              Width            = $$Width,
              Height           = $$Height,
              IsHitTestVisible = false ]
        when ( IsSelected ) { PART_Border.BorderThickness = (1); }
    }
    Style [TargetType = Group] {
        Template = @DefaultGroup;
    }

    // ── Connector: default end-cap ─────────────────────────────────
    //
    // Connectors carry a filled arrowhead at the target end out of the
    // box (Visio / draw.io convention); the source end stays bare. Both
    // are overridable per-instance via Source/TargetCapTemplate. The
    // @FilledArrowCap template lives in the sibling Caps dictionary — both
    // are merged into MuralFramework, so the cross-dictionary @ref resolves
    // at runtime the same way @Primary (a theme colour) does here.
    //
    // Default end size is 0.8× the cap template's authored size — a touch
    // sleeker than the full-size glyph. Both ends carry the default so a
    // cap added to either end starts at the same size; it's overridable
    // per-instance via Source/TargetCapScale (the formatting pane's
    // Start/End size sliders, 0.5×–1.5×).
    //
    // No Stroke setter: Connector seeds a per-instance default Pen in its
    // ctor so PenEditor's in-place edits can't leak across connectors —
    // a shared Style-setter Pen would reintroduce that leak.
    Style [TargetType = Connector] {
        TargetCapTemplate = @FilledArrowCap;
        SourceCapScale    = 0.8;
        TargetCapScale    = 0.8;
    }

    // ── Diagram: ItemsControl-derived workspace ────────────────────
    //
    // Mirrors ListBox / TreeView: a ScrollViewer hosting an
    // ItemsPresenter so the items panel (a Canvas in the typical
    // diagrammer wiring) scrolls past the viewport edge when the
    // Canvas's union bbox grows past the visible extent.
    //
    // Folding the ScrollViewer into the template means the Diagram
    // itself is on the bubble path of every drop landing on the
    // canvas — including drops on the scrollbar — so the typical
    // wiring becomes `DropReceiver = $Self` (no enclosing-Border
    // dance the older imperative templates needed).
    //
    // AdornerDecorator wraps the ItemsPresenter so adorners (side
    // bars, connector edit handles, selection-resize handles) ride
    // an AdornerLayer that's sized to the FULL canvas extent rather
    // than the SCP's viewport-clipped overlay layer. The SCP's outer
    // content clip still trims anything past the viewport, but
    // adorner positioning and reactivity happen in canvas-local
    // coords — which keeps side bars on figures past page 1
    // reachable after scrolling.
    Template x:key="DefaultDiagram" [TargetType = Diagram] {
        ScrollViewer x:name="PART_Scroll" [ IsAutoHideScrollBars = false ] {
            AdornerDecorator {
                ItemsPresenter
            }
        }
    }
    Style [TargetType = Diagram] {
        Template = @DefaultDiagram;
    }

    // ── DiagramInspector: the Format Shape pane ────────────────────────
    //
    // The shell's inspector region presents the active document's Inspector;
    // for a DiagramDocument that's a DiagramInspector, rendered here. It retargets
    // its DataContext to `$View` (the live Diagram control the document publishes),
    // so the ShapeFormatControl binds the control's `$SelectionFormat*` DPs as
    // SINGLE path segments — the reactive form. Binding the two-segment
    // `ActiveDocument.ActiveView.SelectionFormatFill` from the shell would react
    // only to its first segment and go stale on selection change; the VM's `View`
    // hop makes the format state track the live selection (and the DPs are
    // BindsTwoWayByDefault, so edits still broadcast back through the control).
    //
    // The pane owns its own chrome + width; when a non-diagram document (or none)
    // is active the shell's inspector presenter is empty and the region collapses.
    DataTemplate [DataType = DiagramInspector] {
        Border
            [ Width           = 320,
              Background      = @SurfaceContainerLow,
              BorderBrush     = @OutlineVariant,
              BorderThickness = (1,0,0,0),
              Padding         = (12) ] {
            DockPanel {
                TextBlock
                    [ DockPanel.Dock = Top,
                      Text           = "Format Shape",
                      Style          = @TitleSmall,
                      Foreground     = @OnSurfaceVariant,
                      Margin         = (0,0,0,8) ]
                ScrollViewer
                    [ IsAutoHideScrollBars    = false,
                      HorizontalScrollEnabled = false,
                      DataContext             = $View ] {
                    ShapeFormatControl
                        [ Fill              = $SelectionFormatFill,
                          Stroke            = $SelectionFormatStroke,
                          SourceCapTemplate = $SelectionFormatSourceCap,
                          TargetCapTemplate = $SelectionFormatTargetCap,
                          SourceCapScale    = $SelectionFormatSourceCapScale,
                          TargetCapScale    = $SelectionFormatTargetCapScale,
                          ShowCaps          = $SelectionIsConnector,
                          CapOptions        = $ConnectorCapOptions ]
                }
            }
        }
    }
}
