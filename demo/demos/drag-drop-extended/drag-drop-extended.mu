import DragDropExtendedVM from "./drag-drop-extended-vm.mjs"
import RowVM              from "./drag-drop-extended-vm.mjs"
import DroppedFileVM      from "./drag-drop-extended-vm.mjs"
import ListReorderBehavior from "@visualisation-sub/mural/basic"

// drag-drop-extended.mu — single-screen demo that exercises every §8
// follow-up shipped in this branch:
//
//   * 8.1 OS file drops          → right-hand drop zone
//   * 8.3 Source-side feedback   → status line "Last effect" + Shift hint
//   * 8.4 ScrollViewer auto-scroll → tall scrolling list on the left
//   * 8.5 Insertion-line adorner → blue 2-px Border template wired to
//                                  the ListReorderBehavior via the
//                                  InsertionAdornerTemplate DP.
//
// The reorderable list is a plain ItemsControl with a StackPanel
// ItemsPanel so the reorder behavior's container-midpoint math has a
// vertical layout to walk. The ListReorderBehavior installs from the
// row-level Behaviors{} block — declarative attach inside the same
// element that hosts the list.

resources DragDropExtendedDemo {

    // Vertical StackPanel ItemsPanel — plain ItemsControl has no
    // default, so explicit panels are required for containers to
    // materialize.
    ItemsPanelTemplate x:key="ReorderListPanel" {
        StackPanel
    }

    DataTemplate [DataType=RowVM] {
        Border [Background=@Surface, Padding=(12,6,12,6)] {
            TextBlock [Text=$Label, FontSize=13, Foreground=@OnSurface]
        }
    }

    DataTemplate [DataType=DroppedFileVM] {
        Border [Padding=(8,3,8,3)] {
            StackPanel [Orientation=Horizontal] {
                TextBlock [Text=$Name, FontSize=12, Foreground=@OnSurface]
                TextBlock [Text=$Size, FontSize=11, Foreground=@OnSurfaceVariant,
                           Margin=(8,1,0,0)]
            }
        }
    }

    // 8.5 — the insertion-line adorner template is built imperatively
    // by the demo bootstrap (so it doesn't need a synthetic DataType
    // key) and assigned to ListReorderBehavior.InsertionAdornerTemplate
    // after view materialization.

    DataTemplate [DataType=DragDropExtendedVM] {
        Border x:root [Background=@Surface, BorderBrush=@OutlineVariant, BorderThickness=(1)] {
            resources: {
                // Per-row drag source — every ItemsControl-generated
                // container becomes draggable, with the OnDragStart
                // callback returning the per-row BeginDragData closure.
                // The row's container DataContext IS the RowVM, so
                // $BeginDragData resolves there.
                Style [TargetType=ContentPresenter] {
                    IsDraggable = true;
                    OnDragStart = $BeginDragData;
                }
            }

            DockPanel {
                // Header strip — InverseSurface flips with the theme
                // so the bar stays high-contrast against the page.
                Border [DockPanel.Dock=Top, Background=@InverseSurface, Padding=(16,12,16,12)] {
                    StackPanel [Orientation=Vertical] {
                        TextBlock [Text="Drag & drop extended",
                                   FontSize=15, FontWeight=Bold,
                                   Foreground=@InverseOnSurface]
                        StackPanel [Orientation=Horizontal, Margin=(0,4,0,0)] {
                            TextBlock [Text="Last receiver effect:",
                                       FontSize=11, Foreground=@Outline]
                            TextBlock [Text=$LastEffect, FontSize=11,
                                       FontWeight=Bold,
                                       Foreground=#60a5fa,
                                       Margin=(6,0,16,0)]
                            TextBlock [Text=$ShiftHint, FontSize=11,
                                       Foreground=#fbbf24]
                        }
                    }
                }

                TextBlock [DockPanel.Dock=Bottom, Margin=(20,4,20,16),
                           FontSize=11, Foreground=@OnSurfaceVariant,
                           TextWrapping=Wrap,
                           Text="LEFT: drag any row to reorder — the blue insertion line previews the drop position (backlog 8.5). Drag toward the top / bottom edges to auto-scroll the ScrollViewer (8.4). Hold Shift mid-drag to cancel via OnContinueQuery (8.3). RIGHT: drop files, text, or URLs from your OS / other browser windows (8.1)."]

                StackPanel [Orientation=Horizontal, Margin=(20), VerticalAlignment=Stretch] {

                    // LEFT — reorderable list inside a ScrollViewer.
                    // ScrollViewer auto-scrolls when the cursor enters
                    // the AutoScrollGutter (24px default).
                    Border [Width=320, Height=280,
                            BorderBrush=@OutlineVariant, BorderThickness=(1),
                            Margin=(0,0,16,0)] {
                        ScrollViewer x:name="scroll"
                                     [AutoScrollGutter=32,
                                      AutoScrollStep=6,
                                      IsAutoHideScrollBars=false]
                        {
                            ItemsControl x:name="reorderList"
                                         [ItemsSource=$Rows,
                                          ItemsPanel=@ReorderListPanel]
                            {
                                Behaviors {
                                    ListReorderBehavior x:name="reorder"
                                        [FromIndexFormat="mural/reorder/from-index"]
                                }
                            }
                        }
                    }

                    // RIGHT — OS drop zone + dropped-files log.
                    Border [Width=320, Height=280,
                            BorderBrush=@Outline, BorderThickness=(2),
                            Background=@SurfaceContainerLow] {
                        DockPanel {
                            Border [DockPanel.Dock=Top,
                                    Background=#dbeafe,
                                    Padding=(12,10,12,10)] {
                                StackPanel [Orientation=Vertical] {
                                    TextBlock [Text="OS file drop zone",
                                               FontSize=13, FontWeight=Bold,
                                               Foreground=@OnSurface]
                                    TextBlock [Text=$FileStatus,
                                               FontSize=11,
                                               Foreground=@PrimaryContainer,
                                               Margin=(0,4,0,0),
                                               TextWrapping=Wrap]
                                }
                            }
                            ScrollViewer [IsAutoHideScrollBars=true] {
                                ItemsControl x:name="filesList"
                                             [ItemsSource=$DroppedFiles,
                                              ItemsPanel=@ReorderListPanel]
                            }
                        }
                    }
                }
            }
        }
    }
}
