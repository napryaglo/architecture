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
    // Template = Canvas { PART_Content + PART_LabelHost }. The Figure paints its
    // OWN silhouette via the inherited Visual paint path (buildPaintGeometry =
    // the scaled shape), so there is no inner Shape primitive. PART_Content hosts
    // the (wrapped-VM) content and PART_LabelHost hosts the Figure's ShapeText
    // block (Figure.Text), slotted after applyDefaultStyle. Both are children, so
    // the Figure's ChildClip (ClipToBounds, built from the same silhouette in
    // Figure._rebuildGeometry) masks them to the shape while the own stroke keeps
    // painting. Width / Height template-bind to the measured size so a resize
    // re-lays the content; the silhouette re-scales in _rebuildGeometry.
    Template x:key="DefaultFigure" [TargetType = Figure] {
        Canvas {
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

    // Geometric shape nodes are self-painting Figures (not a VM + Shape
    // primitive), so they need no DataTemplate — a shape Figure IS the node and
    // paints its own silhouette. See Figure.fromKind / the 'shape' serializer.

    // ── TextNode: a shapeless Figure text box ──────────────────────────
    // TextNode is a Figure, so it renders through its OWN control template
    // (not a DataTemplate). A Border draws the box (Fill/Stroke bound to the
    // node's own DPs); PART_LabelHost — a Border — is where Figure's ctor slots
    // the ShapeText (labelHost.SetChild(this.Text)). Shapeless: the Figure
    // paints no silhouette, so the box comes entirely from this Border.
    Template x:key="DefaultTextNode" [ TargetType = TextNode ] {
        Border [ Fill = $$Fill, Stroke = $$Stroke ] {
            Border x:name="PART_LabelHost" [ Width = $$Width, Height = $$Height ]
        }
    }
    Style [ TargetType = TextNode ] {
        Template = @DefaultTextNode;
    }

    // ── Callout: a TextNode with a template-driven leader line ─────────
    // The TextNode box (Border + PART_LabelHost) PLUS a leader Shape bound to
    // the Callout's LeaderGeometry, both inside a Canvas so the leader can draw
    // OUTSIDE the box to reach the target (Canvas does not clip children). The
    // leader geometry is in callout-LOCAL coords; IsHitTestVisible=false so it
    // never swallows pointer events.
    Template x:key="DefaultCallout" [ TargetType = Callout ] {
        Canvas {
            Border [ Fill = $$Fill, Stroke = $$Stroke ] {
                Border x:name="PART_LabelHost" [ Width = $$Width, Height = $$Height ]
            }
            // NOTE: leader stroke colour (#64748b, the NeutralInk token value) is
            // inlined here — the only remaining hardcoded diagram colour. It's
            // .mu-bound (DiagramSettings isn't reachable from markup) and would
            // need a PART_Leader template-part + ctor wiring to tokenize safely;
            // deferred (see docs/diagram-design-tokens.md).
            Shape
                [ Geometry          = $$LeaderGeometry,
                  Stroke            = (#64748bff, 1.5),
                  IsHitTestVisible  = false ]
        }
    }
    Style [ TargetType = Callout ] {
        Template = @DefaultCallout;
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
        Border x:name="PART_Bg" [ Fill = $$Fill, Padding = $$Padding ] {
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
                      // A node's border sizes to this label, so measure it with
                      // the paint engine's own SVG <text> layout — Canvas
                      // measureText disagrees with the painted glyphs by a small
                      // amount that the diagram's LayoutTransform zoom magnifies
                      // (a node at 400% pushed its last glyph past the border).
                      // Same reason Chip / markers use Exact. See
                      // TextBlock.MeasurementFidelity.
                      MeasurementFidelity = Exact,
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
            [ Fill       = #00000000,
              Stroke      = Pen [ Brush = @Primary ],
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
        // Rulers (PART_RulerTop / PART_RulerLeft) sit OUTSIDE PART_Scroll in a
        // Grid so they neither zoom (they're not under PART_Camera's
        // LayoutTransform) nor scroll off-screen — the Diagram feeds them the
        // camera zoom/offset so their ticks track the content. They default to
        // Collapsed (Auto tracks collapse to 0), so the diagram looks identical
        // to before until RulersVisible flips true.
        Grid {
            ColumnDefinitions {
                ColumnDefinition [ Width = GridLength.Auto ]
                ColumnDefinition [ Width = GridLength.Star ]
            }
            RowDefinitions {
                RowDefinition [ Height = GridLength.Auto ]
                RowDefinition [ Height = GridLength.Star ]
            }
            Border x:name="PART_RulerCorner" [ Grid.Row = 0, Grid.Column = 0, Fill = #00000000, Visibility = Collapsed ]
            RulerBar x:name="PART_RulerTop"  [ Grid.Row = 0, Grid.Column = 1, Orientation = Horizontal, Visibility = Collapsed ]
            RulerBar x:name="PART_RulerLeft" [ Grid.Row = 1, Grid.Column = 0, Orientation = Vertical,   Visibility = Collapsed ]
            // Diagram drawing surface — a theme-adaptive paper fill behind the
            // content. Sits in the SAME Grid cell as PART_Scroll but is declared
            // first, so it paints BEHIND the scroll viewport and fills the whole
            // viewport (not the zoomed content extent) — it neither zooms nor
            // scrolls. PART_Camera stays transparent so this shows through under
            // the nodes. @DiagramCanvas re-paints on a light/dark scheme swap.
            Border x:name="PART_CanvasBg"
                [ Grid.Row = 1, Grid.Column = 1, Fill = @DiagramCanvas ]
            // Zoom is a LayoutTransform Scale on PART_Camera (grows its measured
            // footprint), so the ScrollViewer sizes real scrollbars to the zoomed
            // content and pan IS the scroll offset. AdornerDecorator wraps
            // PART_Camera (not the items) so selection adorners stay a constant
            // on-screen size — the adorner layer composes PART_Camera's
            // EffectiveLayoutMatrix when positioning them (see adorner.ts).
            ScrollViewer x:name="PART_Scroll"
                [ Grid.Row = 1, Grid.Column = 1,
                  IsAutoHideScrollBars    = false,
                  HorizontalScrollEnabled = true,
                  VerticalScrollEnabled   = true ] {
                AdornerDecorator {
                    Border x:name="PART_Camera" [ Fill = #00000000 ] {
                        ItemsPresenter
                    }
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
    // ── Paged inspector: a horizontal NavigationRail over the page bodies ──
    // The rail (a Selector) TwoWay-binds SelectedItem to the inspector's
    // SelectedPage; a ContentControl (NOT a bare ContentPresenter — that pins
    // its DataContext to the presented page and freezes the $SelectedPage
    // source) presents the selected page, resolving its per-type DataTemplate.
    // Each page body retargets DataContext = $View so its fields bind the live
    // Diagram's SINGLE-segment reactive selection DPs (the same reason the old
    // single-page template hopped through $View).

    // Horizontal text-tab strip (vs the M3 rail's vertical 80dp stack).
    ItemsPanelTemplate x:key="InspectorRailPanel" {
        StackPanel [ Orientation = Horizontal ]
    }
    Template x:key="InspectorRailItemTemplate" [ TargetType = NavigationItem ] {
        Border x:name="PART_Outer"
            [ Fill            = #00000000,
              Stroke          = Pen [ Brush = #00000000 ],
              BorderThickness = (0,0,0,2),
              Padding         = (12,8,12,8) ] {
            TextBlock x:name="PART_Label"
                [ Style             = @TitleSmall,
                  Text              = $Title,
                  Foreground        = @OnSurfaceVariant,
                  VerticalAlignment = Center ]
        }
        when ( IsSelected ) {
            PART_Outer.Stroke     = Pen [ Brush = @Primary ];
            PART_Label.Foreground = @Primary;
        }
        when ( IsMouseOver ) { PART_Label.Foreground = @OnSurface; }
    }
    Style x:key="InspectorRailItem" [ TargetType = NavigationItem ] {
        Template = @InspectorRailItemTemplate;
    }
    Template x:key="InspectorRailTemplate" [ TargetType = NavigationRail ] {
        Border x:name="PART_Border"
            [ Fill            = @Surface,
              Stroke          = Pen [ Brush = @OutlineVariant ],
              BorderThickness = (0,0,0,1) ] {
            ItemsPresenter x:name="PART_ItemsPresenter"
        }
    }
    Style x:key="InspectorRail" [ TargetType = NavigationRail ] {
        Template   = @InspectorRailTemplate;
        ItemsPanel = @InspectorRailPanel;
    }

    DataTemplate [DataType = DiagramInspector] {
        DockPanel [ LastChildFill = true ] {
            NavigationRail
                [ DockPanel.Dock     = Top,
                  Style              = @InspectorRail,
                  ItemContainerStyle = @InspectorRailItem,
                  ItemsSource        = $Pages,
                  SelectedItem       = $SelectedPage ]
            ContentControl [ Content = $SelectedPage ]
        }
    }

    // Page 1 — the existing shape-style control, bound through $View.
    DataTemplate [DataType = ShapeStylePage] {
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

    // Page 2 — Size & Position, bound through $View to the SelectedShape* DPs.
    DataTemplate [DataType = SizePositionPage] {
        Border [ Padding = (12) ] {
            ScrollViewer
                [ IsAutoHideScrollBars    = false,
                  HorizontalScrollEnabled = false,
                  DataContext             = $View ] {
                SizePositionControl
                    [ Left        = $SelectedShapeLeft,
                      Top         = $SelectedShapeTop,
                      WidthValue  = $SelectedShapeWidth,
                      HeightValue = $SelectedShapeHeight,
                      Rotation    = $SelectedShapeRotation,
                      BaseWidth   = $SelectedShapeBaseWidth,
                      BaseHeight  = $SelectedShapeBaseHeight,
                      HasTarget   = $HasSelectedShape ]
            }
        }
    }

    // SizePositionControl default template — Size + Position sections. Fields
    // template-bind ($$) the control's own DPs; disabled when no single shape is
    // selected ($$HasTarget).
    Template x:key="DefaultSizePositionControl" [ TargetType = SizePositionControl ] {
        StackPanel [ Orientation = Vertical, IsEnabled = $$HasTarget ] {
            TextBlock [ Style = @TitleSmall, Text = "Size", Margin = (0,0,0,8) ]
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Height", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$HeightValue, Minimum = 1, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Width", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$WidthValue, Minimum = 1, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Rotation", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$Rotation, Minimum = -360, Maximum = 360, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Scale Height", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$ScaleHeight, Minimum = 1, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Scale Width", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$ScaleWidth, Minimum = 1, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = false, Margin = (0,2,0,6) ] {
                Switch    [ DockPanel.Dock = Right, IsChecked = $$LockAspectRatio ]
                TextBlock [ Text = "Lock aspect ratio", Style = @BodySmall, VerticalAlignment = Center ]
            }

            TextBlock [ Style = @TitleSmall, Text = "Position", Margin = (0,12,0,8) ]
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Horizontal", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$HorizontalPosition, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "From", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                ComboBox  [ ItemsSource = $$FromLabels, SelectedItem = $$SelectedFromLabel ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "Vertical", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                SpinEdit  [ Value = $$VerticalPosition, DecimalPlaces = 0 ]
            }
            DockPanel [ LastChildFill = true, Margin = (0,0,0,6) ] {
                TextBlock [ DockPanel.Dock = Left, Text = "From", Style = @BodySmall, Width = 110, VerticalAlignment = Center ]
                ComboBox  [ ItemsSource = $$FromLabels, SelectedItem = $$SelectedFromLabel ]
            }
        }
    }
    Style [ TargetType = SizePositionControl ] {
        Template = @DefaultSizePositionControl;
    }
}
