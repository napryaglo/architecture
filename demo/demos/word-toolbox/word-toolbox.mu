import WordToolboxVM from "./word-toolbox-vm.mjs"
import WordVM from "./word-toolbox-vm.mjs"
import ListReorderBehavior from "@visualisation-sub/mural/Basic"
import VirtualizingWrapPanel from "@visualisation-sub/mural/Basic"
import VirtualizingStackPanel from "@visualisation-sub/mural/Basic"

// word-toolbox.mu — toolbox of 100 dictionary words on the left, a
// 2000-tile virtualized wrap-panel listbox on the right. Tiles are
// 100×100 squares with 15px visual gaps (cell 115×115, tile centered
// with Margin=(7.5)). Drag-from-toolbox copies a word into the
// listbox; drag-within-listbox reorders.
//
// Right-pane reorder uses ListReorderBehavior in wrap-detect mode —
// it inspects the host's ItemsPanel at gesture time and switches to
// 2D nearest-cell math + vertical insertion bar. Same class, no
// configuration knob — the panel type drives the algorithm.
//
// Tiles are draggable via a container-level Style on ContentPresenter
// — the standard pattern shared with drag-drop-extended. Each
// container's DataContext is a WordVM, so $BeginDragData (a per-row
// closure populated in the VM constructor) resolves there.

resources WordToolboxDemo {

    // Right-pane items panel: virtualizing wrap. Each cell is the tile's
    // own ItemWidth × ItemHeight (the defaults — 100 × 100). Horizontal /
    // Vertical Spacing add 15px gaps BETWEEN cells without bloating the
    // tile's own slot, so the tile template can author its Border at the
    // full cell size and skip the old `Margin=(7.5)` workaround.
    ItemsPanelTemplate x:key="ListBoxItemsPanel" {
        VirtualizingWrapPanel [HorizontalSpacing=15, VerticalSpacing=15]
    }

    // Left-pane items panel: VirtualizingStackPanel. Toolbox tiles
    // stack vertically inside a single-column virtualized list; even
    // at 100 items it's cheap, and using VSP here means both panes
    // exercise the IScrollInfo-delegate path.
    ItemsPanelTemplate x:key="ToolboxItemsPanel" {
        VirtualizingStackPanel
    }

    // Tile data template — same shape for both panes. WordVM is the
    // DataContext; the wrapping ContentPresenter inherits whatever
    // container-level Style the host sets (IsDraggable + OnDragStart
    // from the resources block). The 15px inter-tile gap is now owned
    // by the VirtualizingWrapPanel's HorizontalSpacing / VerticalSpacing
    // — the tile itself fills its 100×100 cell, so the ListBoxItem's
    // selection chrome (PART_Border) aligns with the painted border.
    DataTemplate [DataType=WordVM] {
        Border [BorderBrush=@Outline, BorderThickness=(1)]{
            TextBlock [Text=$Word, FontSize=14,
                       HorizontalAlignment=Center,
                       VerticalAlignment=Center,
                       Foreground=@OnSurface]
        }
    }

    // ── Right-pane ListBoxItem chrome ───────────────────────────────
    //
    // Custom ControlTemplate for ListBoxItem. Two reasons we need our
    // own:
    //
    //   1. The bundled default template pins PART_Border to Height=32
    //      with Padding=(8,6,8,6) — sized for a typical text row, but
    //      our 115×115 tile cell needs the chrome stretched.
    //   2. We want a declarative selection highlight. ListBoxItem
    //      caches its `_border` reference at ctor time from the
    //      original default template, so an ItemContainerStyle
    //      Template override leaves that cache stale and the
    //      framework's built-in refreshBackground() writes to a
    //      detached visual. Doing the swap via a `when(IsSelected)`
    //      trigger on this template bypasses the stale cache entirely
    //      — the trigger drives PART_Border.Background through a
    //      TargetedSetter resolved against the NEW template's
    //      NameScope at Apply time.
    //
    // The trigger watches ListBoxItem.IsSelected (the templated
    // parent) and writes to PART_Border (the named template part).
    // Matches the WPF ControlTemplate.Triggers + Trigger.TargetName
    // pattern.
    Template x:key="WordTileItemTemplate" [TargetType=ListBoxItem] {
        Border x:name="PART_Border" [BorderThickness=(0), Padding=(3)] {
            ContentPresenter
        }
        when ( IsSelected ) {
            // @SecondaryContainer is the M3 spec for list-item selection
            // surface — pale lavender in light, dark muted purple in
            // dark — matches the default ListBoxItem trigger and the
            // ContextMenu / Menu selection states.
            PART_Border.Background = @SecondaryContainer;
        }
    }

    // Style wraps the template so it can flow into ListBox via
    // ItemContainerStyle. The drag-source setters (IsDraggable +
    // OnDragStart=$BeginDragData) ride along on the same Style — each
    // generated ListBoxItem container gets the chrome AND the drag
    // wiring in one pass, replacing the previous bootstrap-side
    // AddContainerPreparedListener hookup.
    Style x:key="WordTileItemStyle" [TargetType=ListBoxItem] {
        Template    = @WordTileItemTemplate;
        IsDraggable = true;
        OnDragStart = $BeginDragData;
    }

    DataTemplate [DataType=WordToolboxVM] {
        Border x:root [Background=@SurfaceContainerLow, BorderBrush=@OutlineVariant, BorderThickness=(1)] {
            resources: {
                // Left-pane drag source. The toolbox is an ItemsControl
                // whose generated containers are ContentPresenters. An
                // implicit Style targets them and wires IsDraggable +
                // OnDragStart from each container's DataContext (a
                // WordVM, which exposes $BeginDragData). The right
                // pane's ListBox container drag wiring is on the keyed
                // WordTileItemStyle (above, applied via ItemContainerStyle).
                Style [TargetType=ContentPresenter] {
                    IsDraggable = true;
                    OnDragStart = $BeginDragData;
                }
            }

            DockPanel {
                // Header strip — InverseSurface gives a high-contrast
                // bar whose colour flips with the theme (dark bar in
                // light mode, light bar in dark mode) and stays
                // distinct from the surrounding page. Foreground uses
                // the matching InverseOnSurface token so text contrast
                // holds in both schemes.
                Border [DockPanel.Dock=Top, Background=@InverseSurface, Padding=(16,12,16,12)] {
                    StackPanel [Orientation=Vertical] {
                        TextBlock [Text="Word toolbox — drag tiles between panes",
                                   FontSize=15, FontWeight=Bold,
                                   Foreground=@InverseOnSurface]
                        TextBlock [Text=$Status, FontSize=11,
                                   Foreground=@OnSurfaceVariant, Margin=(0,4,0,0)]
                    }
                }

                TextBlock [DockPanel.Dock=Bottom, Margin=(20,4,20,16),
                           FontSize=11, Foreground=@OnSurfaceVariant,
                           TextWrapping=Wrap,
                           Text="LEFT pane is a 100-tile palette; drag any tile RIGHT to copy it into the listbox. RIGHT pane is a 2000-tile virtualizing WrapPanel; drag any tile to reorder. Both panes share the same square-tile template (100×100 with 15px gaps)."]

                // Two columns: toolbox on the left sized to its
                // content, the listbox fills the rest.
                DockPanel [LastChildFill=true] {

                    // LEFT — toolbox. 100 tiles in a virtualizing
                    // StackPanel inside a ScrollViewer.
                    Border [DockPanel.Dock=Left,
                            BorderBrush=@OutlineVariant, BorderThickness=(0,0,1,0)] {
                        DockPanel {
                            Border [DockPanel.Dock=Top,
                                    Background=#e0f2fe, Padding=(12,8,12,8)] {
                                TextBlock [Text="Toolbox — drag a word to the listbox",
                                           FontSize=12, FontWeight=Bold,
                                           Foreground=#075985]
                            }
                            ScrollViewer [IsAutoHideScrollBars=false] {
                                ItemsControl x:name="toolbox"
                                             [ItemsSource=$ToolboxWords,
                                              ItemsPanel=@ToolboxItemsPanel]
                            }
                        }
                    }

                    // RIGHT — listbox. Virtualizing WrapPanel hosting
                    // 2000 tiles. ListReorderBehavior auto-detects
                    // wrap mode from the panel instance.
                    Border [BorderBrush=@OutlineVariant, BorderThickness=(0)] {
                        DockPanel {
                            Border [DockPanel.Dock=Top,
                                    Background=#dbeafe, Padding=(12,8,12,8)] {
                                TextBlock [Text="ListBox — drag tiles to reorder; toolbox words land here",
                                           FontSize=12, FontWeight=Bold,
                                           Foreground=@PrimaryContainer]
                            }
                            ListBox x:name="listBox"
                                    [ItemsSource=$ListBoxWords,
                                     ItemsPanel=@ListBoxItemsPanel,
                                     ItemContainerStyle=@WordTileItemStyle,
                                     SelectionMode=Extended,
                                     MarqueeBoundsPolicy=Contained,
                                     AllowMarqueeSelection=true] {
                                Behaviors {
                                    ListReorderBehavior x:name="reorder"
                                        [FromIndexFormat="mural/reorder/from-index"]
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
