// Consolidated default theme for the µ-mural Controls library.
//
// Every built-in control's default Style + ControlTemplate lives here.
// Each control gets two top-level entries:
//
//   1. A `Template x:key="DefaultXxx" [TargetType=X] { … }` —
//      the visual tree (PART_* parts, default props, `when()` triggers).
//   2. A `Style [TargetType=X] { Template = @DefaultXxx; }` — the
//      default Style that drives the control's Template DP. Registered
//      under the class Function key; the framework's
//      Application.ResolveDefaultResource(X) returns this Style, which
//      Visual.resolve_theme_style applies on AttachLogical (or eagerly
//      from a control ctor via this.applyDefaultStyle()).
//
// Authoring rules used across the file:
//   * Templates are keyed `DefaultXxx`. Styles target the class. Both
//     forms register in the same merged dictionary; the compiler's
//     local-resource lookup makes `@key` resolve to the JS var
//     directly instead of going through Application.current.Resources
//     (which doesn't see the dict until create() returns).
//   * Sizing constants (paddings, heights, row metrics) live inline in
//     the markup — templates own their look.
//   * Colours used at runtime for state swaps (hover / pressed /
//     selected) ALSO appear in Controls/theme.ts under the same hex
//     literals so the TS side reads the matching brush identity rather
//     than rebuilding one per template apply.
//   * PART_* names are the contract between this file and the
//     constructor-side wiring; renaming a PART here requires the
//     matching change in the control's TS code.
//
// Multi-template controls (ComboBox: Selection + Popup;
// Drawer: Pane + Overlay) keep ONLY keyed Templates — two Templates
// can't both ride a single TargetType-keyed default Style, and the
// control's ctor reads each by string key explicitly.

resources BasicTheme {

    // ── Button: variant-driven Material 3 chrome ───────────────────
    // Five M3 button variants, one ControlTemplate per variant. The
    // default Button Style sets the Filled template as a baseline,
    // then a property-trigger chain on the Variant DP swaps in the
    // variant-specific template. The IsMouseOver / IsPressed colour
    // swaps live INSIDE each template (each variant has its own
    // state colours), so the trigger graph stays one level deep.
    //
    // PART_Border is the rounded surface; ContentPresenter is
    // discovered by ControlTemplate.Apply's first-presenter walk.
    // Tokens come from the Material palette merged onto
    // Application.Resources at startup; SetTheme('light'|'dark') swaps
    // every dependent colour through the DynamicResource bindings.

    // Filled — the M3 baseline, also the historical mural default.
    Template x:key="DefaultFilledButton" [TargetType=Button]{
        Border x:name="PART_Border"[Background      = @Primary,
                                    BorderThickness = (0),
                                    CornerRadius    = @ShapeFull,
                                    Padding         = (24,10,24,10)]{
            ContentPresenter
        }
        when ( IsMouseOver )           { PART_Border.Background = @PrimaryHover; }
        when ( IsPressed   )           { PART_Border.Background = @PrimaryPress; }
        // Adaptive layout — Compact tightens, Comfortable loosens,
        // Coarse pointer bumps the touch target.
        when ( Density = Compact )     { PART_Border.Padding = (16,6,16,6); }
        when ( Density = Comfortable ) { PART_Border.Padding = (28,12,28,12); }
        when ( Pointer = Coarse )      { PART_Border.Padding = (24,14,24,14); }
    }

    // Elevated — surface-tinted base, primary text, elevation 1 at
    // rest. Hover bumps elevation; pressed lowers it back to 1 so the
    // press feedback is recession + colour both.
    Template x:key="DefaultElevatedButton" [TargetType=Button]{
        Border x:name="PART_Border"[Background      = @SurfaceContainerLow,
                                    BorderThickness = (0),
                                    CornerRadius    = @ShapeFull,
                                    Effect          = @Elevation1,
                                    Padding         = (24,10,24,10)]{
            ContentPresenter
        }
        when ( IsMouseOver ) { PART_Border.Background = @SurfaceContainer;
                               PART_Border.Effect     = @Elevation2; }
        when ( IsPressed   ) { PART_Border.Background = @SurfaceContainerHigh;
                               PART_Border.Effect     = @Elevation1; }
    }

    // Tonal (Filled Tonal) — secondary-container base. Sits between
    // Filled (high emphasis) and Outlined (low) in the M3 emphasis
    // hierarchy. No elevation at rest.
    Template x:key="DefaultTonalButton" [TargetType=Button]{
        Border x:name="PART_Border"[Background      = @SecondaryContainer,
                                    BorderThickness = (0),
                                    CornerRadius    = @ShapeFull,
                                    Padding         = (24,10,24,10)]{
            ContentPresenter
        }
        when ( IsMouseOver ) { PART_Border.Background = @SurfaceContainerHigh; }
        when ( IsPressed   ) { PART_Border.Background = @SurfaceContainerHighest; }
    }

    // Outlined — transparent surface, 1-DIP outline, primary text.
    // Hover / press tint via the SurfaceContainer ramp so the outline
    // stays the dominant chrome.
    Template x:key="DefaultOutlinedButton" [TargetType=Button]{
        Border x:name="PART_Border"[Background      = #00000000,
                                    BorderBrush     = @Outline,
                                    BorderThickness = (1),
                                    CornerRadius    = @ShapeFull,
                                    Padding         = (23,9,23,9)]{
            ContentPresenter
        }
        when ( IsMouseOver )            { PART_Border.Background     = @SurfaceContainerLow; }
        when ( IsPressed   )            { PART_Border.Background     = @SurfaceContainerHigh; }
        when ( Density = Compact )      { PART_Border.Padding        = (15,5,15,5); }
        when ( Density = Comfortable )  { PART_Border.Padding        = (27,11,27,11); }
        when ( Pointer = Coarse )       { PART_Border.Padding        = (23,13,23,13); }
        // High-contrast a11y — thicker outline so the chrome reads
        // even when the surface tint is muted.
        when ( PrefersContrast = More ) { PART_Border.BorderThickness = (2); }
    }

    // Text — fully transparent base, no chrome at rest. Hover / press
    // reveal a low-emphasis tint. Tighter padding than the other
    // variants matches the M3 spec.
    Template x:key="DefaultTextButton" [TargetType=Button]{
        Border x:name="PART_Border"[Background      = #00000000,
                                    BorderThickness = (0),
                                    CornerRadius    = @ShapeFull,
                                    Padding         = (12,10,12,10)]{
            ContentPresenter
        }
        when ( IsMouseOver ) { PART_Border.Background = @SurfaceContainerLow; }
        when ( IsPressed   ) { PART_Border.Background = @SurfaceContainerHigh; }
    }

    // Default Style — picks the template by Variant via property
    // triggers. Filled is the baseline (the Setter); each non-Filled
    // variant rides its own trigger to swap Template. Setting Variant
    // at construction time or via a later set both flow through the
    // same trigger pipeline.
    Style [TargetType=Button] {
        Template = @DefaultFilledButton;
        when ( Variant = Elevated ) { Template = @DefaultElevatedButton; }
        when ( Variant = Tonal    ) { Template = @DefaultTonalButton; }
        when ( Variant = Outlined ) { Template = @DefaultOutlinedButton; }
        when ( Variant = Text     ) { Template = @DefaultTextButton; }
    }

    // ── ComboBox (in-flow selection box) ────────────────────────────
    // MUI Outlined Select look. PART_SelectionBox receives the open /
    // close toggle click; PART_SelectionText carries the selected item
    // label (or placeholder); PART_Chevron is the right-aligned glyph.
    // ComboBox has TWO templates (selection + popup); they can't both
    // ride one default Style, so each is keyed and ComboBox.ctor reads
    // them by key explicitly.
    Template x:key="DefaultComboBoxSelection"[TargetType=ComboBox]{
        ClickableBorder x:name="PART_SelectionBox"
                      [ Background      = @Surface,
                        BorderBrush     = @Outline,
                        BorderThickness = (1),
                        CornerRadius    = @ShapeExtraSmall,
                        Padding         = (14,8,14,8),
                        Height          = 40 ]{
            SplitRow{
                TextBlock x:name="PART_SelectionText" [ Foreground = @OnSurfaceVariant ]
                TextBlock x:name="PART_Chevron"       [ Foreground = @OnSurface,
                                                        Text       = "▾" ]
            }
        }
    }

    // ── ComboBox (overlay popup host) ───────────────────────────────
    // Mounted on PresentationTarget.OverlayLayer when IsDropDownOpen
    // flips true. PART_PopupHost arranges PART_Popup just below the
    // anchoring selection box; PART_Scrim absorbs outside clicks;
    // PART_PopupList is a ComboBoxItemList (internal ItemsControl
    // subclass) that turns the ComboBox.Items array into one
    // ClickableBorder row per item via its own GetContainerForItem /
    // PrepareContainerForItem hooks.
    Template x:key="DefaultComboBoxPopup"[TargetType=ComboBox]{
        ComboBoxPopupHost x:name="PART_PopupHost"{
            ClickAwayScrim x:name="PART_Scrim" [ BorderThickness = (0) ]
            Border x:name="PART_Popup"
                  [ Background      = @SurfaceContainerHigh,
                    BorderBrush     = @OutlineVariant,
                    BorderThickness = (1),
                    CornerRadius    = @ShapeExtraSmall,
                    Effect          = @Elevation2,
                    Padding         = (0,4,0,4) ]{
                ComboBoxItemList x:name="PART_PopupList"
            }
        }
    }

    // ── Drawer (in-flow pane) ───────────────────────────────────────
    // Shared by Permanent / Persistent / Temporary variants. The
    // Temporary variant re-parents this same pane onto the overlay
    // host (see DefaultDrawerOverlay) — no duplicate pane is built.
    // Drawer has TWO templates (pane + overlay) — both keyed; the
    // ctor reads them explicitly.
    Template x:key="DefaultDrawerPane"[TargetType=Drawer]{
        Border x:name="PART_Pane"
              [ Background      = @SurfaceContainerLow,
                BorderBrush     = @OutlineVariant,
                BorderThickness = (1) ]{
            ContentPresenter
        }
    }

    // ── Drawer (overlay host for the Temporary variant) ─────────────
    // Applied lazily — only when a Temporary Drawer first transitions
    // to IsOpen=true. The pane is NOT a child of this template; Drawer
    // AddVisualChilds it after Apply so the same pane instance can flip
    // between in-flow and overlay hosting without being rebuilt.
    Template x:key="DefaultDrawerOverlay"[TargetType=Drawer]{
        TemporaryOverlayHost x:name="PART_OverlayHost"{
            ScrimSurface x:name="PART_Scrim" [ BorderThickness = (0) ]
        }
    }

    // ── TreeView (chrome) ───────────────────────────────────────────
    // ItemsControl-derived: a ScrollViewer hosting an ItemsPresenter
    // where TreeView.ItemsPanel slots a vertical StackPanel containing
    // the root TreeViewItem rows.
    Template x:key="DefaultTreeView" [TargetType=TreeView]{
        ScrollViewer x:name="PART_Scroll"{
            ItemsPresenter
        }
    }
    Style [TargetType=TreeView] {
        Template = @DefaultTreeView;
    }

    // ── TreeViewItem (one row + sub-rows) ───────────────────────────
    // ItemsControl-derived: row chrome at the top (chevron + label +
    // indent spacer); ItemsPresenter below where the TreeViewItem's
    // ItemsPanel slots a CollapsibleStack containing the sub-rows.
    // The CollapsibleStack is toggled by the IsExpanded DP so closed
    // subtrees clip to zero size (and zero hit-area).
    Template x:key="DefaultTreeViewItem" [TargetType=TreeViewItem]{
        StackPanel x:name="PART_OuterStack" [ Orientation = Vertical ]{
            ClickableRow x:name="PART_Row"
                        [ BorderThickness = (0),
                          Padding         = (8,6,8,6),
                          Height          = 32 ]{
                StackPanel x:name="PART_RowInner" [ Orientation = Horizontal ]{
                    Border x:name="PART_Spacer" [ Width = 0 ]
                    ChevronTarget x:name="PART_Chevron"
                                  [ Width           = 20,
                                    BorderThickness = (0) ]{
                        TextBlock x:name="PART_ChevronText"
                                  [ Foreground         = @OnSurfaceVariant,
                                    FontSize           = 12,
                                    VerticalAlignment  = Center,
                                    Text               = "▸" ]
                    }
                    TextBlock x:name="PART_Label"
                              [ Foreground         = @OnSurface,
                                FontSize           = 14,
                                VerticalAlignment  = Center ]
                }
            }
            ItemsPresenter x:name="PART_ChildHost"
        }
    }
    Style [TargetType=TreeViewItem] {
        Template = @DefaultTreeViewItem;
    }

    // ── ListBox (chrome) ────────────────────────────────────────────
    // ItemsControl-derived: the items panel (a vertical StackPanel,
    // built by ListBox.ItemsPanel) is slotted into the ItemsPresenter
    // by the ItemsControl base. Containers come from
    // GetContainerForItemOverride, which wraps each data item in a
    // ListBoxItem (and passes already-ListBoxItem items through
    // unchanged so declarative markup keeps working).
    Template x:key="DefaultListBox" [TargetType=ListBox]{
        ScrollViewer x:name="PART_Scroll"{
            ItemsPresenter
        }
    }
    Style [TargetType=ListBox] {
        Template = @DefaultListBox;
    }

    // ── ListBoxItem (one row) ───────────────────────────────────────
    // Material dense-list surface. PART_Border is transparent at rest,
    // turns hover grey under the cursor, and selected light-blue when
    // the row participates in the ListBox's selection. Both reactions
    // are declarative: `when()` triggers on the templated parent
    // (ListBoxItem) write to the named PART_Border via TargetedSetter.
    // Selection is ordered LAST so it wins when both IsMouseOver and
    // IsSelected are active — last-trigger-applied wins under the
    // trigger-priority tier, the same precedence the previous
    // imperative refreshBackground() enforced.
    Template x:key="DefaultListBoxItem" [TargetType=ListBoxItem]{
        Border x:name="PART_Border"
              [ BorderThickness = (0),
                Padding         = (8,6,8,6),
                Height          = 32 ]{
            ContentPresenter
        }
        when ( IsMouseOver ) { PART_Border.Background = @SurfaceContainerHigh; }
        when ( IsSelected  ) { PART_Border.Background = @SecondaryContainer; }
    }
    Style [TargetType=ListBoxItem] {
        Template = @DefaultListBoxItem;
    }

    // ── PageView ────────────────────────────────────────────────────
    // Title strip + divider + Content area, all in a DockPanel so the
    // ContentHost fills the residue. Subtitle is NOT in markup — the
    // PageView TS code adds it to PART_HeaderStack on demand when the
    // Subtitle DP is non-empty (keeps an empty Subtitle from reserving
    // a row).
    Template x:key="DefaultPageView" [TargetType=PageView]{
        DockPanel x:name="PART_Dock"{
            Border x:name="PART_Header" [ DockPanel.Dock = Top,
                                          Padding        = (20,16,20,12) ]{
                StackPanel x:name="PART_HeaderStack" [ Orientation = Vertical ]{
                    TextBlock x:name="PART_TitleText"
                              [ Foreground = @OnSurface,
                                Style      = @TitleLarge ]
                }
            }
            Border x:name="PART_Divider" [ DockPanel.Dock  = Top,
                                           Background      = @OutlineVariant,
                                           BorderThickness = (0),
                                           Height          = 1 ]
            Border x:name="PART_ContentHost" [ Padding = (0) ]{
                ContentPresenter
            }
        }
    }
    Style [TargetType=PageView] {
        Template = @DefaultPageView;
    }

    // ── TextBox ─────────────────────────────────────────────────────
    // Material Outlined Text Field look: a 1-DIP outline, 4-DIP radius,
    // inset content area, focus / hover colour swaps driven from code
    // (the TS side keeps Border.BorderBrush in lock-step with IsFocused
    // and IsMouseOver). PART_Editor is the painted surface that draws
    // the textual content, the selection rectangles, and the blinking
    // caret; the TextBox itself owns the model and writes pointer +
    // keyboard handlers, treating the editor as a passive view.
    Template x:key="DefaultTextBox" [TargetType=TextBox]{
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @Outline,
                BorderThickness = (1),
                CornerRadius    = @ShapeExtraSmall,
                Padding         = (12,8,12,8) ]{
            ScrollViewer x:name="PART_Scroll"{
                TextEditorSurface x:name="PART_Editor"
            }
        }
    }
    Style [TargetType=TextBox] {
        Template = @DefaultTextBox;
    }

    // ── SpinEdit ────────────────────────────────────────────────────
    // Numeric up/down: TextBox value display on the left, vertical
    // ▴/▾ button column on the right. The outer PART_Border is the
    // Material Outlined chrome (1-DIP outline, 4-DIP radius); SpinEdit's
    // TS code refreshes its BorderBrush from the INNER TextBox's
    // IsFocused / IsMouseOver so clicking into the value field turns
    // the outline blue. PART_TextBox's own inner border is flipped to
    // zero thickness at construction so only the outer outline shows.
    // PART_ButtonColumn carries a left-edge divider; PART_Up / PART_Down
    // are click targets whose onClick callbacks the TS layer binds to
    // step the value by SmallChange.
    Template x:key="DefaultSpinEdit" [TargetType=SpinEdit]{
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @Outline,
                BorderThickness = (1),
                CornerRadius    = @ShapeExtraSmall ]{
            DockPanel{
                Border x:name="PART_ButtonColumn"
                      [ DockPanel.Dock  = Right,
                        Width           = 18,
                        BorderBrush     = @OutlineVariant,
                        BorderThickness = (1,0,0,0) ]{
                    StackPanel [ Orientation = Vertical ]{
                        ClickableBorder x:name="PART_Up"
                                       [ BorderThickness = (0),
                                         Padding         = (0,2,0,2),
                                         Height          = 14 ]{
                            TextBlock [ Text                = "▴",
                                        FontSize            = 10,
                                        Foreground          = @OnSurfaceVariant,
                                        HorizontalAlignment = Center,
                                        VerticalAlignment   = Center ]
                        }
                        ClickableBorder x:name="PART_Down"
                                       [ BorderThickness = (0),
                                         Padding         = (0,2,0,2),
                                         Height          = 14 ]{
                            TextBlock [ Text                = "▾",
                                        FontSize            = 10,
                                        Foreground          = @OnSurfaceVariant,
                                        HorizontalAlignment = Center,
                                        VerticalAlignment   = Center ]
                        }
                    }
                }
                TextBox x:name="PART_TextBox"
            }
        }
    }
    Style [TargetType=SpinEdit] {
        Template = @DefaultSpinEdit;
    }

    // ── Slider ──────────────────────────────────────────────────────
    // Material-style single-thumb slider: a thin neutral track, a
    // tinted fill from Min to the current value, and a round-cornered
    // thumb. The Slider's TS code positions each part via the
    // SliderLayout panel — this template just paints. PART_Thumb's
    // Background is rewritten at runtime on IsMouseOver / drag to
    // match the Theme palette.
    Template x:key="DefaultSlider" [TargetType=Slider]{
        SliderLayout x:name="PART_Layout"{
            Border x:name="PART_Track"
                  [ Background      = @SurfaceContainerHighest,
                    CornerRadius    = 2,
                    BorderThickness = (0) ]
            Border x:name="PART_Fill"
                  [ Background      = @Primary,
                    CornerRadius    = 2,
                    BorderThickness = (0) ]
            Border x:name="PART_Thumb"
                  [ Background      = @Primary,
                    CornerRadius    = @ShapeFull,
                    BorderThickness = (0) ]
        }
    }
    Style [TargetType=Slider] {
        Template = @DefaultSlider;
    }

    // ── ScrollViewer ────────────────────────────────────────────────
    // ScrollViewerLayout is a custom panel that hands its
    // ArrangeOverride back to the host ScrollViewer (which carries the
    // gutter / placement math). PART_ContentSite is the
    // ScrollContentPresenter (extends ContentPresenter, so consumer
    // Content lands here automatically via the template's first-
    // ContentPresenter slot resolution). PART_VerticalScrollBar /
    // PART_HorizontalScrollBar are the default scrollbars — re-template
    // to swap them or move their position; the host fishes them out by
    // PART name.
    Template x:key="DefaultScrollViewer" [TargetType=ScrollViewer]{
        ScrollViewerLayout x:name="PART_Layout"{
            ScrollContentPresenter x:name="PART_ContentSite"
            ScrollBar x:name="PART_VerticalScrollBar"
            ScrollBar x:name="PART_HorizontalScrollBar"
        }
    }
    Style [TargetType=ScrollViewer] {
        Template = @DefaultScrollViewer;
    }

    // ── ScrollBar ───────────────────────────────────────────────────
    // Material-flavoured flat track with a rounded thumb. The cross-
    // axis size (SCROLLBAR_THICKNESS) is pinned by the ScrollBar's
    // MeasureOverride; this template just paints the parts.
    Template x:key="DefaultScrollBar" [TargetType=ScrollBar]{
        ScrollBarLayout x:name="PART_Layout"{
            Border x:name="PART_Track"
                  [ Background      = @SurfaceContainerLow,
                    CornerRadius    = @ShapeExtraSmall,
                    BorderThickness = (0) ]
            Border x:name="PART_Thumb"
                  [ Background      = @OutlineVariant,
                    CornerRadius    = @ShapeExtraSmall,
                    BorderThickness = (0) ]
        }
    }
    Style [TargetType=ScrollBar] {
        Template = @DefaultScrollBar;
    }

    // ── Thumb ──────────────────────────────────────────────────────
    // Templatable drag affordance — the primitive ScrollBar's PART_Thumb
    // and GridSplitter inherit from. Default chrome is a soft neutral
    // bar; consumers re-template for richer affordances. PART_Border is
    // the named handle for runtime tinting.
    Template x:key="DefaultThumb" [TargetType=Thumb]{
        Border x:name="PART_Border"
              [ Background      = @OutlineVariant,
                CornerRadius    = 2,
                BorderThickness = (0) ]
    }
    Style [TargetType=Thumb] {
        Template = @DefaultThumb;
    }

    // ── GridSplitter ───────────────────────────────────────────────
    // A thin draggable bar that lives in a Grid cell and resizes the
    // adjacent columns/rows on drag. The default chrome is the same
    // soft neutral as Thumb; the GridSplitter sets its own resize
    // Cursor at runtime depending on ResizeDirection so the user gets
    // the right affordance on hover.
    Template x:key="DefaultGridSplitter" [TargetType=GridSplitter]{
        Border x:name="PART_Border"
              [ Background      = @OutlineVariant,
                CornerRadius    = 0,
                BorderThickness = (0) ]
    }
    Style [TargetType=GridSplitter] {
        Template = @DefaultGridSplitter;
    }

    // ── Splitter ───────────────────────────────────────────────────
    // Standalone orientation-aware splitter for non-Grid containers.
    // Same chrome as GridSplitter; the orientation determines the
    // resize axis.
    Template x:key="DefaultSplitter" [TargetType=Splitter]{
        Border x:name="PART_Border"
              [ Background      = @OutlineVariant,
                CornerRadius    = 0,
                BorderThickness = (0) ]
    }
    Style [TargetType=Splitter] {
        Template = @DefaultSplitter;
    }

    // NOTE: command-surface controls (ToggleButton / ToolBar / Menu /
    // MenuButton / ContextMenu) keep their default Styles in the sibling
    // `surface.template.mu`. Loading their bundle through THIS file would
    // run their `extends Button` declarations during Button's own static
    // block — see the Controls barrel comment around `surface.js` for the
    // TDZ explanation.
}
