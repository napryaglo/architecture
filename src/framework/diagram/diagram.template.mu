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
    // Template = Canvas { Shape + PART_LabelHost }. The Shape primitive
    // paints the Figure's Geometry / Fill / Stroke; PART_LabelHost hosts the
    // Figure's ShapeText block (Figure.Text), slotted after applyDefaultStyle.
    // Width / Height template-bind to the Figure's measured size so a resize
    // re-paints both at the new dimensions (Figure._rebuildGeometry re-scales
    // the unit-1 source into Geometry whenever Width / Height change, so the
    // Shape's Geometry binding fires in lock-step with the dimensional
    // bindings).
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
            ContentPresenter x:name="PART_Content"
                [ Width = $$Width, Height = $$Height, IsHitTestVisible = false ]
            // Text-block host. Figure slots its own ShapeText instance
            // (Figure.Text) here after applyDefaultStyle — the block renders
            // itself reactively from its DPs, so a label edit repaints without
            // a per-Figure subscription. Sized to the shape footprint; the
            // independent text-block transform (offset / rotation) lands in
            // the diagram-text Slice 3.
            Border x:name="PART_LabelHost" [ Width = $$Width, Height = $$Height ]
        }
    }
    Style [TargetType = Figure] {
        Template = @DefaultFigure;
    }

    // ── ShapeNodeVM: renders a shape as a Shape primitive ─────────────
    //
    // DataTemplate for ShapeNodeVM hosted inside the Figure container's
    // PART_Content ContentPresenter. Binds the Shape's Geometry / Fill /
    // Stroke / Width / Height to the ShapeNodeVM's corresponding DPs,
    // using single-$ bindings (bind to the data item).
    DataTemplate [DataType = ShapeNodeVM] {
        Shape [ Geometry = $Geometry, Fill = $Fill, Stroke = $Stroke, Width = $Width, Height = $Height ]
    }

    // ── TextNodeVM: renders a text-box node (VM form of TextShape) ───
    //
    // DataTemplate for TextNodeVM hosted inside the Figure container's
    // PART_Content ContentPresenter. A Border provides the background
    // rectangle (transparent fill + slate outline, bound to $Fill/$Stroke,
    // $Width/$Height). Inside it, a ContentPresenter hosts the VM's Text
    // (a ShapeText), which self-renders via its own DefaultShapeText style —
    // the same label-host idiom the Figure template uses for PART_LabelHost.
    // Using ContentPresenter (not ContentControl) for the label host because
    // ContentPresenter forwards DataContext through to the ShapeText child
    // without pinning it, so ancestor-scoped bindings remain live — same
    // rationale as the library-preview gotcha memo.
    DataTemplate [DataType = TextNodeVM] {
        Border [ Background = $Fill, BorderPen = $Stroke, Width = $Width, Height = $Height ] {
            ContentPresenter x:name="PART_LabelHost" [ Content = $Text, Width = $Width, Height = $Height ]
        }
    }

    // ── CalloutNodeVM: text-box node with a template-driven leader ──
    //
    // DataTemplate for CalloutNodeVM. Includes the full TextNodeVM visual
    // (Border + PART_LabelHost ContentPresenter) PLUS a leader Shape bound
    // to $LeaderGeometry. The leader Shape is placed as a sibling of the
    // Border inside a Canvas so it can draw OUTSIDE the border bounds to
    // reach the target node — Canvas does not clip children to its own
    // size, so the leader line is never cut at the callout box edge.
    //
    // The Canvas itself has no explicit size (it measures to zero), so the
    // sizing contract comes from the Border child (via $Width/$Height).
    // IsHitTestVisible=false on the leader so it never swallows pointer
    // events that should land on the callout box or the diagram canvas.
    //
    // CLIPPING NOTE: The leader Shape's Geometry is in callout-LOCAL coords
    // (origin = callout's top-left corner). Because the Shape has no
    // Canvas.Left/Canvas.Top offset it is co-located with the callout box
    // at (0,0) in the DataTemplate's coordinate frame. The Canvas container
    // does not clip, so the leader line extends freely to the target.
    // In live GUI smoke: confirm that the leader is visible beyond the
    // border edge and is not clipped by any ancestor ContentPresenter
    // (the Figure PART_Content ContentPresenter should also not clip;
    // verify ActualClip is unset in a layout pass if in doubt).
    DataTemplate [DataType = CalloutNodeVM] {
        Canvas {
            Border [ Background = $Fill, BorderPen = $Stroke, Width = $Width, Height = $Height ] {
                ContentPresenter x:name="PART_LabelHost" [ Content = $Text, Width = $Width, Height = $Height ]
            }
            Shape
                [ Geometry          = $LeaderGeometry,
                  Stroke            = (#64748bff, 1.5),
                  IsHitTestVisible  = false ]
        }
    }

    // ── ShapeText: a shape's text block (the Visio "text block") ────
    // A Border (PART_Bg) carries the optional text-background fill + inner
    // margins (Padding) and is placed / sized / rotated within the shape by
    // ShapeText's own layout (Placement / Offset / Angle / Block* DPs — §
    // Slice 3). Inside it, three co-located parts render the content:
    // PART_Text (plain string), PART_RichText (FlowDocument), PART_Edit (the
    // RichTextBox editor) — §Slice 4. Content / font / alignment ride
    // TemplateBindings so a ShapeText DP write repaints immediately.
    Template x:key="DefaultShapeText" [TargetType = ShapeText] {
        Border x:name="PART_Bg" [ Background = $$Background, Padding = $$Padding ] {
            // Three co-located parts share one cell (§ Slice 4): PART_Text is
            // the plain-string display, PART_RichText the FlowDocument display
            // (shown when Document is set), and PART_Edit the RichTextBox
            // in-place editor. The HasRichContent / IsEditing triggers below
            // reveal exactly one at a time.
            Grid {
                TextBlock x:name="PART_Text"
                    [ Text                = $$Content,
                      TextAlignment       = $$TextAlignment,
                      TextWrapping        = $$TextWrapping,
                      FontFamily          = $$FontFamily,
                      FontSize            = $$FontSize,
                      FontWeight          = $$FontWeight,
                      FontStyle           = $$FontStyle,
                      TextDecorations     = $$TextDecorations,
                      Foreground          = $$Foreground,
                      HorizontalAlignment = Stretch,
                      VerticalAlignment   = $$VerticalTextAlignment ]
                RichTextBlock x:name="PART_RichText"
                    [ Document            = $$Document,
                      FontFamily          = $$FontFamily,
                      FontSize            = $$FontSize,
                      FontWeight          = $$FontWeight,
                      FontStyle           = $$FontStyle,
                      Foreground          = $$Foreground,
                      Visibility          = Collapsed,
                      HorizontalAlignment = Stretch,
                      VerticalAlignment   = $$VerticalTextAlignment ]
                RichTextBox x:name="PART_Edit"
                    [ FontFamily          = $$FontFamily,
                      FontSize            = $$FontSize,
                      FontWeight          = $$FontWeight,
                      FontStyle           = $$FontStyle,
                      Foreground          = $$Foreground,
                      Visibility          = Collapsed,
                      HorizontalAlignment = Stretch,
                      VerticalAlignment   = $$VerticalTextAlignment ]
            }
        }
        // Rich display: swap the plain label for the FlowDocument host.
        when ( HasRichContent ) {
            PART_Text.Visibility     = Collapsed;
            PART_RichText.Visibility = Visible;
        }
        // In-place edit (declared last so it wins over the rich-display swap
        // when both are active): reveal the editor, hide both displays.
        when ( IsEditing ) {
            PART_Text.Visibility     = Collapsed;
            PART_RichText.Visibility = Collapsed;
            PART_Edit.Visibility     = Visible;
        }
    }
    Style [TargetType = ShapeText] {
        Template = @DefaultShapeText;
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
        // Zoom is a LayoutTransform Scale on PART_Camera (grows its measured
        // footprint), so the ScrollViewer sizes real scrollbars to the zoomed
        // content and pan IS the scroll offset. AdornerDecorator wraps
        // PART_Camera (not the items) so selection adorners stay a constant
        // on-screen size — the adorner layer composes PART_Camera's
        // EffectiveLayoutMatrix when positioning them (see adorner.ts).
        ScrollViewer x:name="PART_Scroll"
            [ IsAutoHideScrollBars    = false,
              HorizontalScrollEnabled = true,
              VerticalScrollEnabled   = true ] {
            AdornerDecorator {
                Border x:name="PART_Camera" [ Background = #00000000 ] {
                    ItemsPresenter
                }
            }
        }
    }
    Style [TargetType = Diagram] {
        Template = @DefaultDiagram;
    }

    // ── ToolboxVisualPresenter: the shared toolbox-visual host ─────────
    //
    // A ContentControl subclass. Its Content is a Visual the presenter
    // resolves from its Descriptor (the palette tile, canvas node, and
    // preview all mount this control), so the template is a bare
    // ContentPresenter that slots that resolved Visual. No chrome — the
    // enclosing tile/node supplies any frame.
    Template x:key="DefaultToolboxVisualPresenter" [TargetType = ToolboxVisualPresenter] {
        ContentPresenter
    }
    Style [TargetType = ToolboxVisualPresenter] {
        Template = @DefaultToolboxVisualPresenter;
    }

    // ── DiagramInspector: the Format Shape pane BODY ───────────────────
    //
    // The InspectorService hosts this DiagramInspector; the region wraps it in an
    // InspectorPanel (title "Format Shape" + collapse chrome + border + width), so
    // this template renders only the BODY. It retargets its DataContext to `$View`
    // (the live Diagram control the document publishes), so the ShapeFormatControl
    // binds the control's `$SelectionFormat*` DPs as SINGLE path segments — the
    // reactive form. Binding the two-segment
    // `ActiveDocument.ActiveView.SelectionFormatFill` from the shell would react
    // only to its first segment and go stale on selection change; the VM's `View`
    // hop makes the format state track the live selection (and the DPs are
    // BindsTwoWayByDefault, so edits still broadcast back through the control).
    DataTemplate [DataType = DiagramInspector] {
        Border [ Padding = (12) ] {
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
