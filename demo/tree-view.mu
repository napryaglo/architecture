// tree-view.mu — TreeView demo: composed markup with two-tier nesting,
// chevron expand/collapse, and multi-select via Ctrl / Shift clicks.
//
// Selection state is reported back to the host page via a
// SelectionChangedListener; the host paints the current SelectedItems
// header set into a status strip below the tree.

Application{
    resources: {
        @paper    = #ffffff
        @ink      = #1f2937
        @hint     = #6b7280
        @hairline = #e2e8f0
        @primary  = #1976d2
        @primInk  = #ffffff

        // Border root: stretches to whatever rectangle the host
        // (HtmlTarget directly, or a PageView slot inside the demo
        // platform) hands it. No fixed Width / Height means the demo
        // body scales with the surface.
        Border x:root [Background=@paper, BorderBrush=@hairline,
                       BorderThickness=(1)]{

            // DockPanel — gives the TreeView a finite height slot
            // (the residue after the docked header). Without it,
            // a vertical StackPanel would hand the TreeView Infinity
            // and its built-in ScrollViewer would never have a
            // bounded viewport.
            DockPanel{
                // Header strip
                Border[DockPanel.Dock=Top,
                       Background=@primary, Padding=(16,12,16,12)]{
                    TextBlock[Text="Project explorer",
                              FontSize=15, FontWeight=Bold,
                              Foreground=@primInk]
                }

                // The tree itself — fills the remaining slot via
                // DockPanel's LastChildFill. Built-in ScrollViewer
                // wheel-scrolls when the rows exceed the slot.
                TreeView[Indent=18, Margin=(8,8,8,8)]{
                    TreeViewItem[Header="src/", IsExpanded=true]{
                        TreeViewItem[Header="runtime/", IsExpanded=true]{
                            TreeViewItem[Header="visual.ts"]{}
                            TreeViewItem[Header="model.ts"]{}
                            TreeViewItem[Header="routed-event.ts"]{}
                            TreeViewItem[Header="input-manager.ts"]{}
                        }
                        TreeViewItem[Header="visual-engine/"]{
                            TreeViewItem[Header="presentation-target.ts"]{}
                            TreeViewItem[Header="svg-renderer.ts"]{}
                            TreeViewItem[Header="overlay-layer.ts"]{}
                            TreeViewItem[Header="targets/"]{
                                TreeViewItem[Header="html-target.ts"]{}
                                TreeViewItem[Header="headless-target.ts"]{}
                                TreeViewItem[Header="file-target.ts"]{}
                            }
                        }
                        TreeViewItem[Header="Controls/", IsExpanded=true]{
                            TreeViewItem[Header="border.ts"]{}
                            TreeViewItem[Header="button.ts"]{}
                            TreeViewItem[Header="combo-box.ts"]{}
                            TreeViewItem[Header="dock-panel.ts"]{}
                            TreeViewItem[Header="drawer.ts"]{}
                            TreeViewItem[Header="tree-view.ts"]{}
                        }
                    }
                    TreeViewItem[Header="demo/"]{
                        TreeViewItem[Header="counter.mu"]{}
                        TreeViewItem[Header="drawer.mu"]{}
                        TreeViewItem[Header="tree-view.mu"]{}
                    }
                }
            }
        }
    }
}
