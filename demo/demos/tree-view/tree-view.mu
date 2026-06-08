import TreeViewVM from "./tree-view-vm.mjs"

// tree-view.mu — TreeView demo, two-pane:
//
//   * Left:  composed-markup tree (consumer authors every
//            TreeViewItem by hand)
//   * Right: data-bound tree driven through ItemsSource +
//            HierarchicalDataTemplate (one template applied
//            recursively over a tree of plain data records)
//
// The right pane is wired by TreeViewVM.OnViewMounted because the
// HierarchicalDataTemplate carries a JS itemsSelector closure that
// can't be expressed declaratively in .mu yet.
//
// Packaged as a DataTemplate keyed off TreeViewVM.

ResourceDictionary {
    DataTemplate x:key="TreeViewTemplate" [DataType=TreeViewVM] {
        // x:root owns the NameScope so the bound TreeView's x:name
        // registers and the VM's OnViewMounted FindName resolves it.
        Border x:root [Background=@Surface, BorderBrush=@OutlineVariant,
                       BorderThickness=(1)]{

            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@Primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="TreeView — composed markup vs. HierarchicalDataTemplate",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@OnPrimary]
                }

                // Two-up split — composed-markup on the left, data-bound
                // on the right, separated by a hairline divider.
                StackPanel[Orientation=Horizontal]{

                    // ── Left: composed markup ─────────────────────
                    StackPanel[Orientation=Vertical, Width=300,
                                Margin=(12,12,6,12)]{
                        TextBlock[Text="Composed markup",
                                  FontSize=12, FontWeight=Bold,
                                  Foreground=@OnSurfaceVariant,
                                  Margin=(0,0,0,8)]
                        TreeView[Indent=18]{
                            TreeViewItem[Header="src/", IsExpanded=true]{
                                TreeViewItem[Header="runtime/", IsExpanded=true]{
                                    TreeViewItem[Header="visual.ts"]
                                    TreeViewItem[Header="model.ts"]
                                    TreeViewItem[Header="routed-event.ts"]
                                    TreeViewItem[Header="input-manager.ts"]
                                }
                                TreeViewItem[Header="visual-engine/"]{
                                    TreeViewItem[Header="presentation-target.ts"]
                                    TreeViewItem[Header="svg-renderer.ts"]
                                    TreeViewItem[Header="overlay-layer.ts"]
                                }
                                TreeViewItem[Header="Controls/", IsExpanded=true]{
                                    TreeViewItem[Header="border.ts"]
                                    TreeViewItem[Header="button.ts"]
                                    TreeViewItem[Header="tree-view.ts"]
                                }
                            }
                            TreeViewItem[Header="demo/"]{
                                TreeViewItem[Header="counter.mu"]
                                TreeViewItem[Header="tree-view.mu"]
                            }
                        }
                    }

                    // Divider
                    Border[Width=1, Background=@OutlineVariant, Margin=(0,12,0,12)]

                    // ── Right: data-bound via HierarchicalDataTemplate ─
                    // The TreeView is bare here; the VM wires
                    // ItemsSource + ItemTemplate at activation time.
                    StackPanel[Orientation=Vertical, Width=300,
                                Margin=(6,12,12,12)]{
                        TextBlock[Text="HierarchicalDataTemplate",
                                  FontSize=12, FontWeight=Bold,
                                  Foreground=@OnSurfaceVariant,
                                  Margin=(0,0,0,8)]
                        TreeView x:name="bound" [Indent=18]
                    }
                }
            }
        }
    }
}
