import DragDropVM from "./drag-drop-vm.mjs"
import ItemVM     from "./drag-drop-vm.mjs"

// drag-drop.mu — two ListBoxes, items move between them via drag.
//
// Each ListBoxItem is a declarative drag source via an implicit
// ListBoxItem Style (IsDraggable=true + OnDragStart bound to
// ItemVM.BeginDragData). The drop receivers (the two ListBoxes) are
// wired by listbox-drop-behavior from the bootstrap — pure-markup
// drop-target wiring isn't yet available, hence the Behavior.
//
// No `x:key` anywhere — DataTemplates resolve by DataType identity,
// the Style by TargetType. The container Style lives inside the demo
// shell's local resources so it only re-styles ListBoxItems rendered
// by THIS demo, not every demo on the platform.

resources DragDropDemo {

    // Per-item template: ListBox.contentForItem auto-resolves via
    // findDataTemplateForType(ItemVM) when ItemTemplate is unset.
    DataTemplate [DataType=ItemVM] {
        TextBlock [Text=$Label, Margin=(8,4,8,4), FontSize=12]
    }

    // Demo shell.
    DataTemplate [DataType=DragDropVM] {
        Border x:root [Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1)]
        {
            resources: {
                // ListBoxItem container style — declarative drag source.
                // Lives in the shell's local resources so the implicit
                // [TargetType=ListBoxItem] lookup only matches inside
                // this demo's subtree. ListBox sets the container's
                // DataContext to the per-row item, so OnDragStart=
                // $BeginDragData resolves against ItemVM and finds the
                // function-DP.
                Style [TargetType=ListBoxItem] {
                    IsDraggable = true;
                    OnDragStart = $BeginDragData;
                }
            }

            DockPanel
            {
                // Header strip.
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    StackPanel[Orientation=Horizontal]{
                        TextBlock[Text="Drag-drop between lists",
                                  FontSize=15, FontWeight=Bold,
                                  Foreground=@OnPrimary]
                        TextBlock[Text=$Status,
                                  FontSize=12,
                                  Foreground=@OnPrimary,
                                  Margin=(20,4,0,0)]
                    }
                }

                TextBlock[DockPanel.Dock=Bottom, Margin=(20,4,20,16),
                          FontSize=11, Foreground=@OnSurfaceVariant,
                          TextWrapping=Wrap,
                          Text="Drag any item from one list to the other to move it. The framework's IsDraggable + OnDragStart binding starts the drag; a Behavior on each ListBox handles DragOver/Drop and dispatches to VM commands."]

                // Two-up split. Each side is a fixed-size Border
                // hosting a DockPanel — the column header is docked
                // Top, and the ListBox takes LastChildFill so its
                // arranged rect covers the whole drop area. Without
                // the fixed Height, the outer Border shrink-wraps to
                // its content and the ListBox arranges to just the
                // items' height, so drops only land over actual rows.
                StackPanel[Orientation=Horizontal, Margin=(20), VerticalAlignment=Stretch]
                {
                    Border[Width=220, VerticalAlignment=Stretch,
                           Margin=(0,0,16,0),
                           BorderBrush=@OutlineVariant, BorderThickness=(1)]
                    {
                        DockPanel
                        {
                            TextBlock[DockPanel.Dock=Top,
                                      Text="Left", FontWeight=Bold,
                                      FontSize=12, Foreground=@OnSurface,
                                      Margin=(10,8,8,4)]
                            ListBox x:name="leftList"
                                    [ItemsSource=$LeftItems]
                        }
                    }

                    Border[Width=220, VerticalAlignment=Stretch,
                           BorderBrush=@OutlineVariant, BorderThickness=(1)]
                    {
                        DockPanel
                        {
                            TextBlock[DockPanel.Dock=Top,
                                      Text="Right", FontWeight=Bold,
                                      FontSize=12, Foreground=@OnSurface,
                                      Margin=(10,8,8,4)]

                            ListBox x:name="rightList"
                                    [ItemsSource=$RightItems]
                        }
                    }
                }
            }
        }
    }
}
