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
    Template x:key="DefaultFigure" [TargetType=Figure]{
        Canvas {
            Shape x:name="PART_Shape"
                  [ Geometry = $$Geometry,
                    Fill     = $$Fill,
                    Stroke   = $$Stroke,
                    Width    = $$Width,
                    Height   = $$Height ]
            TextBlock x:name="PART_Label"
                      [ Text   = $$LabelText,
                        Width  = $$Width,
                        Height = $$Height ]
        }
    }
    Style [TargetType=Figure] {
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
    Template x:key="DefaultGroup" [TargetType=Group]{
        // IsHitTestVisible=false on the chrome Border. The bbox is
        // purely visual decoration — its `<rect class="mural-hit">`
        // would otherwise carry pointer-events:all and swallow clicks
        // on member Figures that visually sit inside the union. With
        // the pad disabled, clicks pass through to whichever member is
        // under the cursor (Figure.OnPointerDown then elevates the
        // Selector to the enclosing Group via the Parent chain).
        Border x:name="PART_Border"
              [ Background        = #00000000,
                BorderBrush       = @Primary,
                BorderThickness   = (0),
                Width             = $$Width,
                Height            = $$Height,
                IsHitTestVisible  = false ]
        when ( IsSelected ) { PART_Border.BorderThickness = (1); }
    }
    Style [TargetType=Group] {
        Template = @DefaultGroup;
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
    Template x:key="DefaultDiagram" [TargetType=Diagram]{
        ScrollViewer x:name="PART_Scroll" [ IsAutoHideScrollBars = false ]{
            AdornerDecorator {
                ItemsPresenter
            }
        }
    }
    Style [TargetType=Diagram] {
        Template = @DefaultDiagram;
    }
}
