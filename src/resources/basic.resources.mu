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

resources MuralBasic {

    // ── TextBlock: default text contract ───────────────────────────
    // Binds Foreground / FontFamily to the active theme so a scheme
    // switch (light ↔ dark) re-tints every untemplated TextBlock
    // without per-instance Foreground=@OnSurface noise. FontSize /
    // FontWeight / LineHeight pin to the M3 BodyMedium baseline
    // (consumers opt into other type-scale tokens via Style=@TitleLarge
    // etc. from the Typography dictionary).
    //
    // Explicit Foreground/FontSize/etc. setters on individual TextBlocks
    // still win because the .mu's `[Foreground=...]` writes go through
    // set_property_value at the Local tier, which outranks the Style
    // tier.
    Style [TargetType=TextBlock] {
        Foreground = @OnSurface;
        FontFamily = @FontFamily;
        FontSize   = 14;
        FontWeight = Normal;
        LineHeight = 20;
    }

    // ── Button ──────────────────────────────────────────────────────
    // Promoted to src/framework/buttons/buttons.template.mu
    // (folded into MuralFramework, which loads alongside MuralBasic).

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
                        Padding         = (@Spacing4, @Spacing2, @Spacing4, @Spacing2),
                        Height          = @ListRowHeightComfortable ]{
            SplitRow{
                TextBlock x:name="PART_SelectionText"
                          [ Foreground         = @OnSurfaceVariant,
                            FontFamily         = @BodyLargeFont,
                            FontWeight         = @BodyLargeWeight,
                            FontSize           = @BodyLargeSize,
                            LineHeight         = @BodyLargeLineHeight,
                            LetterSpacing      = @BodyLargeTracking ]
                TextBlock x:name="PART_Chevron"
                          [ Foreground         = @OnSurface,
                            FontFamily         = @BodyMediumFont,
                            FontWeight         = @BodyMediumWeight,
                            FontSize           = @BodyMediumSize,
                            LineHeight         = @BodyMediumLineHeight,
                            Text               = "▾" ]
            }
        }
        // HasSelection swaps PART_SelectionText.Foreground from
        // @OnSurfaceVariant (placeholder tint) to @OnSurface (selected
        // item tint). IsDropDownOpen swaps PART_SelectionBox.BorderBrush
        // from @Outline (resting) to @Primary (open).
        when ( HasSelection )   { PART_SelectionText.Foreground = @OnSurface; }
        when ( IsDropDownOpen ) { PART_SelectionBox.BorderBrush = @Primary; }

        // State-layer ladder — translucent OnSurface tints composite
        // over the @Surface resting background. Hover / focus / press
        // overlays mirror the Button family's transparent-at-rest
        // pattern (the selection box is a clickable surface; it earns
        // the same chrome). Disabled dims the entire selection box.
        when ( PART_SelectionBox.IsMouseOver ) { PART_SelectionBox.Background = @StateHoverOverlay; }
        when ( PART_SelectionBox.IsFocused )   { PART_SelectionBox.Background = @StateFocusOverlay; }
        when ( PART_SelectionBox.IsPressed )   { PART_SelectionBox.Background = @StatePressOverlay; }
        when ( IsEnabled = false )             { PART_SelectionBox.Opacity   = @DisabledContentOpacity; }

        // M3 density variants — tighter cell on Compact, looser on
        // Comfortable. Density is an inherited attached DP, so dropping
        // a ComboBox under a `Density = Compact` ancestor (chrome bars,
        // toolbars, the ThemeSelector pick row) shrinks automatically
        // without touching individual call sites.
        when ( ThemeManager.Density = Compact )     { PART_SelectionBox.Padding = (@Spacing3, @Spacing1, @Spacing3, @Spacing1);
                                                      PART_SelectionBox.Height  = @ListRowHeightRegular; }
        when ( ThemeManager.Density = Comfortable ) { PART_SelectionBox.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3);
                                                      PART_SelectionBox.Height  = @ListRowHeightTouch; }

        // Coarse pointer (touch) — widen vertically for touch.
        when ( ThemeManager.Pointer = Coarse ) { PART_SelectionBox.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3);
                                                 PART_SelectionBox.Height  = @ListRowHeightTouch; }
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
                    Padding         = (@Spacing0, @Spacing1, @Spacing0, @Spacing1) ]{
                ComboBoxItemList x:name="PART_PopupList"
            }
        }

        // High-contrast popup chrome — M3 accessibility spec calls for
        // thicker outlines on elevated surfaces when the user has opted
        // into a more-contrast environment. Mirrors the menu popup
        // family's PrefersContrast handling.
        when ( ThemeManager.PrefersContrast = More ) { PART_Popup.BorderThickness = (2); }
    }

    // ── ComboBoxItem: popup row chrome ──────────────────────────────
    // M3 list-row pattern. Resting background is TRANSPARENT (matching
    // ListBoxItem / TreeViewItem / NavigationItem) so the state-layer
    // overlays composite predictably over whatever surface the popup
    // chrome paints (here, @SurfaceContainerHigh from PART_Popup). The
    // previous opaque-resting + translucent-hover mix produced the right
    // visual by accident — the overlay happened to composite onto the
    // matching opaque background — but the mental model violated the
    // M3 state-layer pattern called out in the audit checklist and
    // would have failed on any future popup that didn't paint
    // @SurfaceContainerHigh underneath.
    //
    // Trigger order: hover → focus → press establish the state-layer
    // ladder; selection ordered LAST so a selected row stays tinted
    // even with the pointer hovering. Disabled dims the row.
    // Typography NB: row-level Font* setters would target TextBlock-owned
    // DPs that aren't registered on ComboBoxItem's class chain (Border-
    // derived), so Setters here would throw at applyDefaultStyle time.
    // Font tokens reach the rendered label through inheritance — the
    // ComboBoxItemList host or any TextBlock authored inside an item's
    // Content carries its own typography role.
    Style [TargetType=ComboBoxItem] {
        Background      = #00000000;
        BorderThickness = (0);
        Padding         = (@Spacing4, @Spacing2, @Spacing4, @Spacing2);
        when ( IsMouseOver )       { Background = @StateHoverOverlay; }
        when ( IsFocused )         { Background = @StateFocusOverlay; }
        when ( IsPressed )         { Background = @StatePressOverlay; }
        when ( IsSelected )        { Background = @SecondaryContainer; }
        when ( IsEnabled = false ) { Opacity    = @DisabledContentOpacity; }

        // Density variants — mirror the rest of the list family.
        when ( ThemeManager.Density = Compact )     { Padding = (@Spacing3, @Spacing1, @Spacing3, @Spacing1); }
        when ( ThemeManager.Density = Comfortable ) { Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
        when ( ThemeManager.Pointer = Coarse )      { Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
    }

    // ── Drawer ──────────────────────────────────────────────────────
    // Promoted to src/framework/surfaces/surfaces.template.mu
    // (folded into MuralFramework, which loads alongside MuralBasic).

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
                          Padding         = (@Spacing2, @Spacing1, @Spacing2, @Spacing1),
                          Height          = @ListRowHeightRegular ]{
                // Anatomy layout: PART_Spacer (depth indent) and the
                // chevron anchor on the left; PART_TrailingSlot anchors
                // on the right; PART_LeadingSlot + the center vertical
                // stack fill in between. DockPanel keeps the trailing
                // slot pinned even when SupportingText adds a second line.
                DockPanel x:name="PART_RowInner" [LastChildFill=true] {
                    Border x:name="PART_Spacer"
                          [ DockPanel.Dock     = Left,
                            Width               = 0,
                            BorderThickness     = (0) ]
                    // Chevron column is intrinsic to the tree-row shape
                    // (no M3 spec equivalent — TreeView isn't an M3
                    // component). Width=20 stays inline as a
                    // hierarchy-specific layout constant rather than
                    // being lifted to a spacing token.
                    ChevronTarget x:name="PART_Chevron"
                                  [ DockPanel.Dock     = Left,
                                    Width               = 20,
                                    BorderThickness     = (0) ]{
                        TextBlock x:name="PART_ChevronText"
                                  [ Foreground         = @OnSurfaceVariant,
                                    FontFamily         = @BodySmallFont,
                                    FontWeight         = @BodySmallWeight,
                                    FontSize           = @BodySmallSize,
                                    LineHeight         = @BodySmallLineHeight,
                                    LetterSpacing      = @BodySmallTracking,
                                    VerticalAlignment  = Center,
                                    Text               = "▸" ]
                    }
                    // Leading slot — class-managed Border (not a
                    // ContentPresenter). Empty Border has Size.Zero, so
                    // the slot collapses when Leading is undefined.
                    Border x:name="PART_LeadingSlot"
                          [ DockPanel.Dock     = Left,
                            VerticalAlignment   = Center,
                            BorderThickness     = (0) ]
                    Border x:name="PART_TrailingSlot"
                          [ DockPanel.Dock     = Right,
                            VerticalAlignment   = Center,
                            BorderThickness     = (0) ]
                    StackPanel [ Orientation         = Vertical,
                                 VerticalAlignment   = Center ] {
                        TextBlock x:name="PART_Label"
                                  [ Foreground         = @OnSurface,
                                    FontFamily         = @BodyMediumFont,
                                    FontWeight         = @BodyMediumWeight,
                                    FontSize            = @BodyMediumSize,
                                    LineHeight          = @BodyMediumLineHeight,
                                    LetterSpacing       = @BodyMediumTracking ]
                        TextBlock x:name="PART_SupportingText"
                                  [ Foreground         = @OnSurfaceVariant,
                                    FontFamily         = @BodySmallFont,
                                    FontWeight         = @BodySmallWeight,
                                    FontSize            = @BodySmallSize,
                                    LineHeight          = @BodySmallLineHeight,
                                    LetterSpacing       = @BodySmallTracking ]
                    }
                }
            }
            ItemsPresenter x:name="PART_ChildHost"
        }
        // State-layer ladder. PART_Row sources the trigger conditions
        // so a parent row doesn't light up when the pointer is over a
        // child row (TreeViewItem.IsMouseOver fires for the whole
        // subtree because IsMouseOver bubbles to ancestors; the
        // ClickableRow's own IsMouseOver does not). Hover / focus / press
        // use translucent OnSurface overlays (M3 state-layer pattern for
        // transparent-at-rest rows); selection swaps to the opaque
        // @SecondaryContainer and is ordered LAST so it outranks any
        // state-layer overlay still matching at the same trigger tier.
        when ( PART_Row.IsMouseOver ) { PART_Row.Background = @StateHoverOverlay; }
        when ( PART_Row.IsFocused )   { PART_Row.Background = @StateFocusOverlay; }
        when ( PART_Row.IsPressed )   { PART_Row.Background = @StatePressOverlay; }
        when ( IsSelected )           { PART_Row.Background = @SecondaryContainer; }
        when ( IsEnabled = false )    { PART_Row.Opacity    = @DisabledContentOpacity; }

        // Density variants — mirror ListBoxItem's ladder so a TreeView
        // and a sibling ListBox under the same Density ancestor read at
        // matching row heights.
        when ( ThemeManager.Density = Compact )     { PART_Row.Padding = (@Spacing2, @Spacing0, @Spacing2, @Spacing0);
                                                      PART_Row.Height  = @ListRowHeightCompact; }
        when ( ThemeManager.Density = Comfortable ) { PART_Row.Padding = (@Spacing2, @Spacing2, @Spacing2, @Spacing2);
                                                      PART_Row.Height  = @ListRowHeightComfortable; }

        // Coarse pointer (touch) — widen to a 48dp touch target per the
        // M3 accessibility guidance. Independent of Density.
        when ( ThemeManager.Pointer = Coarse ) { PART_Row.Padding = (@Spacing3, @Spacing3, @Spacing3, @Spacing3);
                                                 PART_Row.Height  = @ListRowHeightTouch; }

        // Two-line / three-line variants — driven by SupportingText
        // through the derived HasSupportingText / IsThreeLine DPs
        // (TreeViewItem.OnPropertyChanged). Ordered AFTER density so
        // a content-driven line count wins over a density-driven
        // baseline; IsThreeLine ordered LAST so its 88dp height
        // outranks the 64dp 2-line variant when both match.
        when ( HasSupportingText ) { PART_Row.Height = @ListRowHeightTwoLine; }
        when ( IsThreeLine )       { PART_Row.Height = @ListRowHeightThreeLine; }
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
    // M3 list row chrome. PART_Border is transparent at rest; state-layer
    // ladder paints over whatever the host surface shows. M3 spec calls
    // for translucent OnSurface overlays here (rather than the opaque
    // SurfaceContainer-ladder used on solid-background surfaces like
    // ToolBarButton) because the row's resting background is transparent
    // — an opaque hover tint would clash with whatever container the
    // ListBox sits on.
    //
    // Trigger order matters: hover → focus → press establishes the
    // state-layer ladder; selection ordered LAST so a selected row stays
    // tinted with @SecondaryContainer even when the pointer is over it
    // (last-applied-wins inside the trigger priority tier).
    //
    // Density + Pointer triggers ride below the state layer because they
    // target Padding / Height, not Background — no ordering interaction
    // with the colour ladder above.
    Template x:key="DefaultListBoxItem" [TargetType=ListBoxItem]{
        Border x:name="PART_Border"
              [ BorderThickness = (0),
                Padding         = (@Spacing2, @Spacing1, @Spacing2, @Spacing1),
                Height          = @ListRowHeightRegular ]{
            // M3 list-row anatomy: leading slot | headline+supporting | trailing slot.
            // DockPanel — Leading docks left, Trailing right, the
            // Headline / SupportingText stack fills the centre. Grid
            // with Auto/Star/Auto columns would claim infinite width
            // under ScrollViewer's "natural width" measure pass (Star
            // grabs the unbounded slot), so the DockPanel shape is
            // structurally safer here: each docked slot reports its
            // own DesiredSize, the last-child centre column fills only
            // what's left, and DesiredSize.Width comes out finite.
            //
            // PART_LeadingSlot / PART_TrailingSlot are plain Borders so
            // findFirstContentPresenter walks past them and lands on
            // PART_HeadlineSlot — ContentControl's Content keeps routing
            // through the headline slot, preserving the existing data-
            // driven path where ListBox wraps each row's data in a
            // TextBlock and assigns it to Content. Class-level wiring in
            // ListBoxItem.OnPropertyChanged plumbs the Leading / Trailing
            // Visuals into the Border slots' Child via SetChild; the
            // SupportingText DP flows into PART_SupportingText.Text.
            // Empty slots collapse to zero — Border with no Child has
            // Size.Zero, and an empty TextBlock measures to Size.Zero
            // too — so the 1-line baseline reads identically to the
            // pre-anatomy row.
            DockPanel [LastChildFill=true] {
                Border x:name="PART_LeadingSlot"
                      [ DockPanel.Dock     = Left,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0) ]
                Border x:name="PART_TrailingSlot"
                      [ DockPanel.Dock     = Right,
                        VerticalAlignment   = Center,
                        BorderThickness     = (0) ]
                StackPanel [ Orientation         = Vertical,
                             VerticalAlignment   = Center ] {
                    ContentPresenter x:name="PART_HeadlineSlot"
                                    [ HorizontalAlignment = Stretch ]
                    TextBlock x:name="PART_SupportingText"
                             [ Foreground         = @OnSurfaceVariant,
                               FontFamily         = @BodySmallFont,
                               FontWeight         = @BodySmallWeight,
                               FontSize            = @BodySmallSize,
                               LineHeight          = @BodySmallLineHeight,
                               LetterSpacing       = @BodySmallTracking ]
                }
            }
        }
        // State-layer ladder. M3 tokens — translucent OnSurface tints at
        // the 8% / 12% opacities the spec calls out.
        when ( IsMouseOver ) { PART_Border.Background = @StateHoverOverlay; }
        when ( IsFocused )   { PART_Border.Background = @StateFocusOverlay; }
        when ( IsPressed )   { PART_Border.Background = @StatePressOverlay; }
        when ( IsSelected )  { PART_Border.Background = @SecondaryContainer; }
        // Disabled — dim the entire row at the M3 content-opacity (38%).
        // dispatchPointer / dispatchKey already gate input on a disabled
        // subtree (see visual-engine/routed-event.ts), so the visual
        // dim is the only template-side responsibility. Ordered LAST
        // so the dim wins regardless of which state-layer also matches
        // (a disabled row's residual hover trigger doesn't fire — input
        // is suppressed — so trigger composition stays trivial).
        when ( IsEnabled = false ) { PART_Border.Opacity = @DisabledContentOpacity; }

        // Density variants. M3 list spec: dense=40dp, standard=48dp,
        // comfortable=56dp. mural's existing base sits below all three
        // (32dp at Regular) — a deliberately tight default that stayed
        // conservative for in-flow lists; the comfortable variant climbs
        // to the M3-standard 48dp so a Comfortable ancestor (e.g. a
        // touch-mode chrome bar) doesn't read as cramped.
        when ( ThemeManager.Density = Compact )     { PART_Border.Padding = (@Spacing2, @Spacing0, @Spacing2, @Spacing0);
                                                      PART_Border.Height  = @ListRowHeightCompact; }
        when ( ThemeManager.Density = Comfortable ) { PART_Border.Padding = (@Spacing2, @Spacing2, @Spacing2, @Spacing2);
                                                      PART_Border.Height  = @ListRowHeightComfortable; }

        // Coarse pointer (touch) — widen to a 48dp touch target per the
        // M3 accessibility guidance. Independent of Density; coarse
        // input always upgrades the row regardless of density preference.
        when ( ThemeManager.Pointer = Coarse ) { PART_Border.Padding = (@Spacing3, @Spacing3, @Spacing3, @Spacing3);
                                                 PART_Border.Height  = @ListRowHeightTouch; }

        // Two-line / three-line row variants — derived from the
        // SupportingText DP by ListBoxItem.OnPropertyChanged.
        // Ordered AFTER density / pointer so an explicit supporting-
        // text variant wins over the 1-line density baseline (a
        // supporting caption is a content signal, not a density
        // preference). IsThreeLine triggers when SupportingText
        // contains a newline.
        when ( HasSupportingText ) { PART_Border.Height = @ListRowHeightTwoLine; }
        when ( IsThreeLine )       { PART_Border.Height = @ListRowHeightThreeLine; }
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
    // M3 Outlined Text Field — 1-DIP outline, ExtraSmall radius, inset
    // content area, focus / hover outline-colour swaps. PART_Editor
    // paints the textual content, selection rectangles, and the
    // blinking caret; the TextBox itself owns the model and writes
    // pointer + keyboard handlers, treating the editor as a passive
    // view. Phase 8.1 added the matching DefaultFilledTextBox below;
    // the default Style picks between the two via a Variant trigger.
    //
    // Press isn't a meaningful state on a focusable input surface — a
    // pointer-down lands focus rather than registering a transient
    // press tint — so the five-state ladder collapses to
    // rest / hover / focused / disabled here.
    Template x:key="DefaultOutlinedTextBox" [TargetType=TextBox]{
        Border x:name="PART_Border"
              [ Background      = @Surface,
                BorderBrush     = @Outline,
                BorderThickness = (1),
                CornerRadius    = @ShapeExtraSmall,
                Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2) ]{
            ScrollViewer x:name="PART_Scroll"{
                TextEditorSurface x:name="PART_Editor"
            }
        }
        // Border focus / hover chrome. Order matters: hover declared
        // before focused so focused wins the trigger tier when both
        // match. Both ride through DynamicResource so theme switches
        // re-tint live.
        when ( IsMouseOver )       { PART_Border.BorderBrush = @OnSurface; }
        when ( IsFocused )         { PART_Border.BorderBrush = @Primary; }
        when ( IsEnabled = false ) { PART_Border.Opacity     = @DisabledContentOpacity; }

        // M3 density variants — tighter Padding on Compact, looser on
        // Comfortable. Width / Height are consumer-set (TextBox is
        // sized by its layout context); Padding is the only knob we
        // tune here, matching the same shape ComboBox / ListBoxItem
        // use under Density triggers.
        when ( ThemeManager.Density = Compact )     { PART_Border.Padding = (@Spacing2, @Spacing1, @Spacing2, @Spacing1); }
        when ( ThemeManager.Density = Comfortable ) { PART_Border.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
        when ( ThemeManager.Pointer = Coarse )      { PART_Border.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
    }

    // ── TextBox: Filled variant (M3 spec default) ──────────────────
    // Filled chrome — @SurfaceContainerHigh fill + a bottom-only
    // underline rule. The underline thickens and re-tints on focus to
    // match the M3 "active" state.
    //
    // CornerRadius rides the (TL, TR, BR, BL) tuple form so the top
    // corners get the @ShapeExtraSmall rounding while the bottom stays
    // square — the M3 Filled spec calls for the field to sit flush
    // against its bottom underline. The compiler routes
    // CornerRadius= tuples to `new CornerRadius(...)`.
    Template x:key="DefaultFilledTextBox" [TargetType=TextBox]{
        Border x:name="PART_Border"
              [ Background      = @SurfaceContainerHigh,
                BorderBrush     = @OnSurfaceVariant,
                BorderThickness = (0,0,0,1),
                CornerRadius    = (@ShapeExtraSmall, @ShapeExtraSmall, 0, 0),
                Padding         = (@Spacing3, @Spacing2, @Spacing3, @Spacing2) ]{
            ScrollViewer x:name="PART_Scroll"{
                TextEditorSurface x:name="PART_Editor"
            }
        }
        // Hover lifts the fill toward @SurfaceContainerHighest (M3's
        // hover-state container token); focus thickens the bottom rule
        // to 2dp and re-tints to @Primary, matching the M3 active-
        // indicator pattern. Disabled dims the whole row.
        when ( IsMouseOver )       { PART_Border.Background      = @SurfaceContainerHighest; }
        when ( IsFocused )         { PART_Border.BorderBrush     = @Primary;
                                     PART_Border.BorderThickness = (0,0,0,2); }
        when ( IsEnabled = false ) { PART_Border.Opacity         = @DisabledContentOpacity; }

        when ( ThemeManager.Density = Compact )     { PART_Border.Padding = (@Spacing2, @Spacing1, @Spacing2, @Spacing1); }
        when ( ThemeManager.Density = Comfortable ) { PART_Border.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
        when ( ThemeManager.Pointer = Coarse )      { PART_Border.Padding = (@Spacing4, @Spacing3, @Spacing4, @Spacing3); }
    }

    Style [TargetType=TextBox] {
        // Outlined is mural's default (see TextBox.VariantKey comment
        // for why we deviate from M3's Filled default). The trigger
        // below swaps to the Filled template when the consumer sets
        // Variant = Filled — same shape Button / Card / IconButton
        // use to wire their variant ladders.
        Template       = @DefaultOutlinedTextBox;
        when ( Variant = Filled ) { Template = @DefaultFilledTextBox; }
        // Foreground / SelectionBrush / CaretBrush defaults flow
        // through DynamicResource so theme switches re-tint live.
        // TextEditorSurface picks them up at render time off the
        // owning TextBox (PART_Editor.textBox); consumer overrides at
        // the Local tier still win.
        Foreground     = @OnSurface;
        SelectionBrush = @SecondaryContainer;
        CaretBrush     = @OnSurface;
        // M3 typography — Body Large is the spec role for text-field
        // input content. The atom set rides through inheritance so
        // PART_Editor and any consumer-injected text picks them up.
        FontFamily     = @BodyLargeFont;
        FontWeight     = @BodyLargeWeight;
        FontSize       = @BodyLargeSize;
        LineHeight     = @BodyLargeLineHeight;
        LetterSpacing  = @BodyLargeTracking;
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
            // SpinEdit isn't focusable itself; IsEditFocused /
            // IsEditHovered mirror the INNER TextBox's state via DPs
            // forwarded in SpinEdit's ctor. Hover tints the outline
            // toward OnSurface; focus paints it Primary (the Material
            // Outlined "active field" look). Default falls through to
            // the @Outline already on the Border.
            DockPanel{
                // Button column geometry: 18dp wide and 14dp tall per
                // arrow are mural-specific tight geometry — no M3
                // spec to anchor to (M3 has no spinner control). The
                // numbers stay inline rather than masquerading as a
                // spacing token; the surrounding state-layer chrome and
                // density triggers below carry the M3-relevant work.
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
                            TextBlock x:name="PART_UpGlyph"
                                       [ Text                = "▴",
                                         FontFamily          = @BodySmallFont,
                                         FontWeight          = @BodySmallWeight,
                                         FontSize            = @BodySmallSize,
                                         LineHeight          = @BodySmallLineHeight,
                                         Foreground          = @OnSurfaceVariant,
                                         HorizontalAlignment = Center,
                                         VerticalAlignment   = Center ]
                        }
                        ClickableBorder x:name="PART_Down"
                                       [ BorderThickness = (0),
                                         Padding         = (0,2,0,2),
                                         Height          = 14 ]{
                            TextBlock x:name="PART_DownGlyph"
                                       [ Text                = "▾",
                                         FontFamily          = @BodySmallFont,
                                         FontWeight          = @BodySmallWeight,
                                         FontSize            = @BodySmallSize,
                                         LineHeight          = @BodySmallLineHeight,
                                         Foreground          = @OnSurfaceVariant,
                                         HorizontalAlignment = Center,
                                         VerticalAlignment   = Center ]
                        }
                    }
                }
                TextBox x:name="PART_TextBox"
            }
        }
        // Outer-border outline ladder — IsEditFocused outranks
        // IsEditHovered (focus is the dominant state when both match).
        when ( IsEditHovered )     { PART_Border.BorderBrush = @OnSurface; }
        when ( IsEditFocused )     { PART_Border.BorderBrush = @Primary; }
        when ( IsEnabled = false ) { PART_Border.Opacity     = @DisabledContentOpacity; }

        // Up / Down state-layer chrome — translucent OnSurface tints
        // over the @Surface backdrop. ClickableBorder writes IsPressed
        // on Down/Up/Leave/Enter (Button parity), so the press overlay
        // fires natively. Each button's IsMouseOver / IsFocused /
        // IsPressed sources its own row so a hover on PART_Up doesn't
        // light PART_Down (and vice versa).
        when ( PART_Up.IsMouseOver ) { PART_Up.Background = @StateHoverOverlay; }
        when ( PART_Up.IsFocused )   { PART_Up.Background = @StateFocusOverlay; }
        when ( PART_Up.IsPressed )   { PART_Up.Background = @StatePressOverlay; }
        when ( PART_Down.IsMouseOver ) { PART_Down.Background = @StateHoverOverlay; }
        when ( PART_Down.IsFocused )   { PART_Down.Background = @StateFocusOverlay; }
        when ( PART_Down.IsPressed )   { PART_Down.Background = @StatePressOverlay; }

        // Coarse pointer (touch) — widen the button column so the
        // arrows are easier to hit. Density is left alone because the
        // inner TextBox carries its own density geometry; SpinEdit's
        // overall height tracks the TextBox.
        when ( ThemeManager.Pointer = Coarse ) { PART_ButtonColumn.Width = 28; }
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
    // CornerRadius=2 on PART_Track / PART_Fill stays inline rather
    // than chasing @ShapeExtraSmall (4dp) — the M3 Slider 2024 spec
    // calls out a tight 2dp track radius even now that the track is
    // 16dp tall, so the value is structurally part of the slider
    // shape, not a general "extra small" surface.
    //
    // M3 Slider 2024 thumb-shape redesign landed in Phase 8.6:
    // SliderLayout now sizes the thumb as a 4dp × 16dp vertical pill
    // along the drag axis (was 16 × 16 square). Track grew 4 → 16dp
    // to match. The geometric constants live in src/basic/slider.ts.
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
        // Thumb state chrome. Hover sources from PART_Thumb's
        // IsMouseOver; focus sources from the templated parent's
        // IsFocused so a keyboard-driven focus stays tinted even when
        // the cursor isn't over the thumb; dragging sources from
        // Slider's read-only IsDragging DP. Dragging trigger declared
        // LAST so its setter outranks hover when both match. Disabled
        // dims both track and thumb at the M3 content opacity.
        when ( PART_Thumb.IsMouseOver ) { PART_Thumb.Background = @PrimaryHover; }
        when ( IsFocused )              { PART_Thumb.Background = @PrimaryHover; }
        when ( IsDragging )             { PART_Thumb.Background = @PrimaryPress; }
        when ( IsEnabled = false )      { PART_Layout.Opacity   = @DisabledContentOpacity; }
    }
    Style [TargetType=Slider] {
        Template = @DefaultSlider;
    }

    // ── ScrollViewer ────────────────────────────────────────────────
    // Promoted to src/framework/surfaces/surfaces.template.mu
    // (folded into MuralFramework, which loads alongside MuralBasic).

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
        // Thumb tint: hover → @Outline (slightly darker), drag →
        // @OnSurfaceVariant (darkest). Drag declared LAST so it wins
        // over hover at the trigger tier when both match.
        when ( PART_Thumb.IsMouseOver ) { PART_Thumb.Background = @Outline; }
        when ( IsDragging )             { PART_Thumb.Background = @OnSurfaceVariant; }
        // Auto-hide resting state: fade the template layout root to
        // Opacity=0 so both track and thumb disappear without disturbing
        // layout / hit-test geometry. pulseActivity restores Opacity by
        // flipping IsFaded back to false (default value of 1 takes over
        // again).
        when ( IsFaded )                { PART_Layout.Opacity = 0; }
    }
    Style [TargetType=ScrollBar] {
        Template = @DefaultScrollBar;
    }

    // ── Thumb ──────────────────────────────────────────────────────
    // Templatable drag affordance — the primitive ScrollBar's PART_Thumb
    // and GridSplitter inherit from. Default chrome is a soft neutral
    // bar; consumers re-template for richer affordances. PART_Border is
    // the named handle for runtime tinting.
    //
    // CornerRadius=2 stays inline rather than chasing @ShapeExtraSmall
    // (=4dp) because the Thumb's 2dp radius is intentionally tighter
    // than the M3 shape scale's smallest step — a 4dp radius on a
    // thin scroll bar reads as overly rounded.
    //
    // State-layer ladder — Thumb is a drag affordance so hover and
    // drag are the dominant states; IsDragging declared LAST so it
    // outranks IsMouseOver when both match (the dragged thumb stays
    // tinted with the press-state @OnSurface even while the pointer
    // is over it).
    Template x:key="DefaultThumb" [TargetType=Thumb]{
        Border x:name="PART_Border"
              [ Background      = @OutlineVariant,
                CornerRadius    = 2,
                BorderThickness = (0) ]
        when ( IsMouseOver ) { PART_Border.Background = @Outline; }
        when ( IsDragging )  { PART_Border.Background = @OnSurfaceVariant; }
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
        Template     = @DefaultGridSplitter;
        // PreviewBrush rides the active theme via DynamicResource so a
        // theme switch re-tints the drag-preview adorner live. Consumer
        // overrides at the Local tier still win.
        PreviewBrush = @Primary;
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
        Template     = @DefaultSplitter;
        // PreviewBrush rides the active theme via DynamicResource so a
        // theme switch re-tints the drag-preview adorner live. Consumer
        // overrides at the Local tier still win (Style setter sits at
        // a lower tier than LocalValue).
        PreviewBrush = @Primary;
    }

    // ── ColorPicker MOVED ──────────────────────────────────────────
    // ColorPicker (and its two popup variants + Style) now live in the
    // sibling `framework.resources.mu` — the control class itself moved
    // to `src/framework/color-picker.ts` since it leans on framework
    // primitives (MenuPopupHost, ClickAwayScrim) for its popup chrome.

    // NOTE: command-surface controls (ToggleButton / ToolBar / Menu /
    // MenuButton / ContextMenu) keep their default Styles in the sibling
    // `framework.resources.mu`. Loading their bundle through THIS file
    // would run their `extends Button` declarations during Button's own
    // static block — see the Controls barrel comment around `surface.js`
    // for the TDZ explanation.
}
