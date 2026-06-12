import GroupVM from "./platform-vm.mjs"
import AdornerDecorator from "@visualisation-sub/mural/basic"
import ThemeSelector from "@visualisation-sub/mural/framework/surface.js"
import Material from "@visualisation-sub/mural/resources/material"
import MaterialLight from "@visualisation-sub/mural/resources/material"

// platform.mu — MVVM shell for the µ-mural demo platform.
//
//   View    — this .mu file: a DockPanel with a nav strip on the left
//             and a PageView on the right.
//   ViewModel — PlatformVM (demo/platform/platform-vm.mjs), with
//             Groups / SelectedDemo / Title / Subtitle / Content.
//             Constructed and assigned as the root's DataContext by
//             the host script.
//
// All non-static bindings go through DataContext:
//
//   * TreeView.ItemsSource — set in host JS from $Groups (the host
//             also installs the HierarchicalDataTemplate; that's a
//             JS-only construct today). Selection-change updates
//             VM.SelectedDemo, which fans out through the rest.
//   * PageView.Title / Subtitle — bound to $Title / $Subtitle, which
//             the VM recomputes from SelectedDemo on every change.
//   * PageView.Content — bound to $Content. The VM materializes the
//             demo's root Visual on first activation via the registry
//             (cached, so a nav-back-and-forth resurfaces the same
//             instance + state).
//
// The HtmlTarget's ResizeObserver re-publishes the host element's
// size on every browser resize, and the resulting Measure / Arrange
// flushes propagate to the entire shell automatically.

Application[Theme = Material, Scheme = MaterialLight] {
    resources: {
        // Colours come from the Material 3 palette (registered by the
        // host bootstrap via SetTheme). References like @Surface /
        // @Primary fall through to dynamic-resource bindings so a
        // ToggleTheme() call repaints the whole platform shell —
        // brand header bar included — without rebuilding anything.

        // ── Nav-tree templates ──────────────────────────────────────
        //
        // GroupTemplate — applied to every GroupVM row (and, by
        // recursion, to every DemoVM leaf row as well). The
        // itemsselector reads `data.Demos`; for GroupVMs it returns
        // the demo collection (so each group expands to its demos),
        // for DemoVMs the property is absent so optional-chain
        // returns undefined and the row stays a leaf.
        //
        // The body's `TreeViewItem` is a placeholder factory result
        // — TreeView ignores it because wrapTreeItem builds its own
        // TreeViewItem and sets Header through the Label/Name/Text
        // display-string convention. DataTemplate's API requires a
        // body element so we satisfy it with a no-op.
        HierarchicalDataTemplate x:key="GroupTemplate" [DataType=GroupVM, itemsselector=Demos] {
            TreeViewItem
        }

        // Default style applied to every root-level TreeViewItem:
        // expand each Group on first show. Demo leaves inherit it
        // harmlessly — IsExpanded=true on a leaf is a no-op (no
        // children to show).
        Style x:key="NavRowStyle" [TargetType=TreeViewItem]{
            IsExpanded = true;
        }

        Border x:root [Background=@Surface]{
            // AdornerDecorator scopes adornment to the whole platform
            // root — any control inside (TreeView nav rows, the page
            // body, the active demo's tree) can locate this layer via
            // AdornerLayer.GetAdornerLayer(this) and drop adorners
            // here. ListReorderBehavior's insertion-line is the first
            // consumer; drag ghosts and validation chrome follow on.
            AdornerDecorator {
            DockPanel [LastChildFill=true] {

                // App-wide top bar — brand title on the left, the
                // ThemeSelector chrome control on the right. Sits above
                // the nav strip + page body and gives the picker enough
                // horizontal room for both ComboBoxes to expand.
                Border[DockPanel.Dock=Top,
                       Background=@Primary,
                       Padding=(20,8,12,8)]{
                    DockPanel [LastChildFill=true] {
                        ThemeSelector [DockPanel.Dock=Right]
                        TextBlock[Text="µ-mural demos",
                                  FontSize=14, FontWeight=Bold,
                                  Foreground=@OnPrimary,
                                  VerticalAlignment=Center]
                    }
                }

                // Nav strip — fixed cross-axis width (260 DIP), full
                // host height. Hairline on the inner edge separates it
                // from the page body.
                Border[DockPanel.Dock=Left, Width=260,
                       Background=@SurfaceContainerLow,
                       BorderBrush=@OutlineVariant,
                       BorderThickness=(0,0,1,0)]{
                    StackPanel{
                        // Fully declarative tree wiring — bindings
                        // resolve through DataContext (PlatformVM)
                        // and Resources:
                        //   * ItemsSource        → vm.Groups
                        //   * ItemTemplate       → @GroupTemplate
                        //       (recursive HierarchicalDataTemplate
                        //        keyed in this file's resources)
                        //   * ItemContainerStyle → @NavRowStyle
                        //       (IsExpanded=true on root rows)
                        //   * SelectedDataItem   → vm.SelectedDemo
                        //       (TwoWay by default)
                        TreeView [Indent=18, Margin=(8,8,8,8),
                                  ItemsSource=$Groups,
                                  ItemTemplate=@GroupTemplate,
                                  ItemContainerStyle=@NavRowStyle,
                                  SelectedDataItem=$SelectedDemo]
                    }
                }

                // Page body — Title / Subtitle / Content all bound to
                // the platform VM via DataContext. When VM.SelectedDemo
                // changes, the VM recomputes these three properties
                // and the bindings push them into the PageView.
                PageView x:name="page"
                         [Title=$Title,
                          Subtitle=$Subtitle,
                          Content=$Content]
            }
            }
        }
    }
}
