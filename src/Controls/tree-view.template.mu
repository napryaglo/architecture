// Default template for TreeView — ScrollViewer wrapping a vertical
// StackPanel. Rows are added to the StackPanel as the consumer's
// TreeView markup binds child TreeViewItems via TreeView.AddChild.
//
// Template parts:
//   * PART_Scroll — the ScrollViewer that gives the (potentially long)
//                   row list a bounded viewport with wheel scrolling.
//                   Exposed read-only as `TreeView.ScrollViewer` so
//                   consumers can drive scroll position from code.
//   * PART_Stack  — the row container; TreeView.AddChild appends each
//                   root TreeViewItem here as a visual child.

ResourceDictionary {
    template x:key="DefaultTreeView"[targettype=TreeView]{
        ScrollViewer x:name="PART_Scroll"{
            StackPanel x:name="PART_Stack" [ Orientation = Vertical ]
        }
    }
}
