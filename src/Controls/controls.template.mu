// Consolidated default theme for the µ-mural Controls library.
//
// Every built-in control's default ControlTemplate lives here.
// Single-template controls register implicitly by TargetType — the
// control's class function is the key, `Application.ResolveDefaultResource(
// Button)` returns the right ControlTemplate. Compiled to
// build/Controls/controls.template.mu.js by `npm run build:templates`;
// registered exactly once with the Application via
// Controls/default-resources.ts → ensureControlsTheme() (each control's
// static block calls into that helper instead of pushing its own factory).
//
// Multi-template controls (ComboBox: Selection + Popup;
// Drawer: Pane + Overlay) keep string keys because two Templates
// can't both register implicitly under the same TargetType.
//
// Authoring rules used across the file:
//   * Sizing constants (paddings, heights, row metrics) live inline in
//     the markup — templates own their look.
//   * Colours used at runtime for state swaps (hover / pressed /
//     selected) ALSO appear in Controls/theme.ts under the same hex
//     literals so the TS side reads the matching brush identity rather
//     than rebuilding one per template apply.
//   * PART_* names are the contract between this file and the
//     constructor-side wiring; renaming a PART here requires the
//     matching change in the control's TS code.

ResourceDictionary {

    // ── Button ──────────────────────────────────────────────────────
    // MUI Contained variant. PART_Border is the rounded surface whose
    // Background swaps on IsPressed / IsMouseOver. The ContentPresenter
    // is discovered by ControlTemplate.Apply's first-presenter walk.
    Template [TargetType=Button]{
        Border x:name="PART_Border"[Background=#1976d2,
                                    BorderThickness=(0),
                                    CornerRadius=4,
                                    Padding=(16,6,16,6)]{
            ContentPresenter
        }
    }

    // ── ComboBox (in-flow selection box) ────────────────────────────
    // MUI Outlined Select look. PART_SelectionBox receives the open /
    // close toggle click; PART_SelectionText carries the selected item
    // label (or placeholder); PART_Chevron is the right-aligned glyph.
    Template x:key="DefaultComboBoxSelection"[TargetType=ComboBox]{
        ClickableBorder x:name="PART_SelectionBox"
                      [ Background      = #ffffff,
                        BorderBrush     = #c4c4c4,
                        BorderThickness = (1),
                        CornerRadius    = 4,
                        Padding         = (14,8,14,8),
                        Height          = 40 ]{
            SplitRow{
                TextBlock x:name="PART_SelectionText" [ Foreground = #9e9e9e ]
                TextBlock x:name="PART_Chevron"       [ Foreground = #212121,
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
                  [ Background      = #ffffff,
                    BorderBrush     = #e0e0e0,
                    BorderThickness = (1),
                    CornerRadius    = 4,
                    Padding         = (0,4,0,4) ]{
                ComboBoxItemList x:name="PART_PopupList"
            }
        }
    }

    // ── Drawer (in-flow pane) ───────────────────────────────────────
    // Shared by Permanent / Persistent / Temporary variants. The
    // Temporary variant re-parents this same pane onto the overlay
    // host (see DefaultDrawerOverlay) — no duplicate pane is built.
    Template x:key="DefaultDrawerPane"[TargetType=Drawer]{
        Border x:name="PART_Pane"
              [ Background      = #ffffff,
                BorderBrush     = #e0e0e0,
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
    Template [TargetType=TreeView]{
        ScrollViewer x:name="PART_Scroll"{
            ItemsPresenter
        }
    }

    // ── TreeViewItem (one row + sub-rows) ───────────────────────────
    // ItemsControl-derived: row chrome at the top (chevron + label +
    // indent spacer); ItemsPresenter below where the TreeViewItem's
    // ItemsPanel slots a CollapsibleStack containing the sub-rows.
    // The CollapsibleStack is toggled by the IsExpanded DP so closed
    // subtrees clip to zero size (and zero hit-area).
    Template [TargetType=TreeViewItem]{
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
                                  [ Foreground         = #616161,
                                    FontSize           = 12,
                                    VerticalAlignment  = Center,
                                    Text               = "▸" ]
                    }
                    TextBlock x:name="PART_Label"
                              [ Foreground         = #212121,
                                FontSize           = 14,
                                VerticalAlignment  = Center ]
                }
            }
            ItemsPresenter x:name="PART_ChildHost"
        }
    }

    // ── ListBox (chrome) ────────────────────────────────────────────
    // ItemsControl-derived: the items panel (a vertical StackPanel,
    // built by ListBox.ItemsPanel) is slotted into the ItemsPresenter
    // by the ItemsControl base. Containers come from
    // GetContainerForItemOverride, which wraps each data item in a
    // ListBoxItem (and passes already-ListBoxItem items through
    // unchanged so declarative markup keeps working).
    Template [TargetType=ListBox]{
        ScrollViewer x:name="PART_Scroll"{
            ItemsPresenter
        }
    }

    // ── ListBoxItem (one row) ───────────────────────────────────────
    // Material dense-list surface. PART_Border swaps Background
    // between transparent / hover / selected driven from the TS code;
    // the ContentPresenter slots the consumer-supplied Content.
    Template [TargetType=ListBoxItem]{
        Border x:name="PART_Border"
              [ BorderThickness = (0),
                Padding         = (8,6,8,6),
                Height          = 32 ]{
            ContentPresenter
        }
    }

    // ── PageView ────────────────────────────────────────────────────
    // Title strip + divider + Content area, all in a DockPanel so the
    // ContentHost fills the residue. Subtitle is NOT in markup — the
    // PageView TS code adds it to PART_HeaderStack on demand when the
    // Subtitle DP is non-empty (keeps an empty Subtitle from reserving
    // a row).
    Template [TargetType=PageView]{
        DockPanel x:name="PART_Dock"{
            Border x:name="PART_Header" [ DockPanel.Dock = Top,
                                          Padding        = (20,16,20,12) ]{
                StackPanel x:name="PART_HeaderStack" [ Orientation = Vertical ]{
                    TextBlock x:name="PART_TitleText"
                              [ Foreground = #0f172a,
                                FontSize   = 18,
                                FontWeight = Bold ]
                }
            }
            Border x:name="PART_Divider" [ DockPanel.Dock  = Top,
                                           Background      = #e2e8f0,
                                           BorderThickness = (0),
                                           Height          = 1 ]
            Border x:name="PART_ContentHost" [ Padding = (0) ]{
                ContentPresenter
            }
        }
    }

    // ── TextBox ─────────────────────────────────────────────────────
    // Material Outlined Text Field look: a 1-DIP outline, 4-DIP radius,
    // inset content area, focus / hover colour swaps driven from code
    // (the TS side keeps Border.BorderBrush in lock-step with IsFocused
    // and IsMouseOver). PART_Editor is the painted surface that draws
    // the textual content, the selection rectangles, and the blinking
    // caret; the TextBox itself owns the model and writes pointer +
    // keyboard handlers, treating the editor as a passive view.
    Template [TargetType=TextBox]{
        Border x:name="PART_Border"
              [ Background      = #ffffff,
                BorderBrush     = #c4c4c4,
                BorderThickness = (1),
                CornerRadius    = 4,
                Padding         = (12,8,12,8) ]{
            ScrollViewer x:name="PART_Scroll"{
                TextEditorSurface x:name="PART_Editor"
            }
        }
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
    Template [TargetType=SpinEdit]{
        Border x:name="PART_Border"
              [ Background      = #ffffff,
                BorderBrush     = #c4c4c4,
                BorderThickness = (1),
                CornerRadius    = 4 ]{
            DockPanel{
                Border x:name="PART_ButtonColumn"
                      [ DockPanel.Dock  = Right,
                        Width           = 18,
                        BorderBrush     = #e0e0e0,
                        BorderThickness = (1,0,0,0) ]{
                    StackPanel [ Orientation = Vertical ]{
                        ClickableBorder x:name="PART_Up"
                                       [ BorderThickness = (0),
                                         Padding         = (0,2,0,2),
                                         Height          = 14 ]{
                            TextBlock [ Text                = "▴",
                                        FontSize            = 10,
                                        Foreground          = #424242,
                                        HorizontalAlignment = Center,
                                        VerticalAlignment   = Center ]
                        }
                        ClickableBorder x:name="PART_Down"
                                       [ BorderThickness = (0),
                                         Padding         = (0,2,0,2),
                                         Height          = 14 ]{
                            TextBlock [ Text                = "▾",
                                        FontSize            = 10,
                                        Foreground          = #424242,
                                        HorizontalAlignment = Center,
                                        VerticalAlignment   = Center ]
                        }
                    }
                }
                TextBox x:name="PART_TextBox"
            }
        }
    }

    // ── Slider ──────────────────────────────────────────────────────
    // Material-style single-thumb slider: a thin neutral track, a
    // tinted fill from Min to the current value, and a round-cornered
    // thumb. The Slider's TS code positions each part via the
    // SliderLayout panel — this template just paints. PART_Thumb's
    // Background is rewritten at runtime on IsMouseOver / drag to
    // match the Theme palette.
    Template [TargetType=Slider]{
        SliderLayout x:name="PART_Layout"{
            Border x:name="PART_Track"
                  [ Background      = #e0e0e0,
                    CornerRadius    = 2,
                    BorderThickness = (0) ]
            Border x:name="PART_Fill"
                  [ Background      = #1976d2,
                    CornerRadius    = 2,
                    BorderThickness = (0) ]
            Border x:name="PART_Thumb"
                  [ Background      = #1976d2,
                    CornerRadius    = 8,
                    BorderThickness = (0) ]
        }
    }

    // ── ScrollBar ───────────────────────────────────────────────────
    // Material-flavoured flat track with a rounded thumb. The cross-
    // axis size (SCROLLBAR_THICKNESS) is pinned by the ScrollBar's
    // MeasureOverride; this template just paints the parts.
    Template [TargetType=ScrollBar]{
        ScrollBarLayout x:name="PART_Layout"{
            Border x:name="PART_Track"
                  [ Background      = #f1f5f9,
                    CornerRadius    = 4,
                    BorderThickness = (0) ]
            Border x:name="PART_Thumb"
                  [ Background      = #cbd5e1,
                    CornerRadius    = 4,
                    BorderThickness = (0) ]
        }
    }
}
