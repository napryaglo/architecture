import GroupVM from "./platform-vm.mjs"
import AdornerDecorator from "@visualisation-sub/mural/basic"
import ThemeSelector from "@visualisation-sub/mural/framework/surface.js"
import TopAppBar from "@visualisation-sub/mural/framework/top-app-bar/top-app-bar.js"
import NavigationRail from "@visualisation-sub/mural/framework/navigation/navigation-rail.js"
import NavigationItem from "@visualisation-sub/mural/framework/navigation/navigation-item.js"
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

        Border x:root [Background=@Surface]{
            // AdornerDecorator scopes adornment to the whole platform
            // root — any control inside (TreeView nav rows, the page
            // body, the active demo's tree) can locate this layer via
            // AdornerLayer.GetAdornerLayer(this) and drop adorners
            // here. ListReorderBehavior's insertion-line is the first
            // consumer; drag ghosts and validation chrome follow on.
            AdornerDecorator {
            DockPanel [LastChildFill=true] {

                // App-wide top bar — Material 3 TopAppBar (Small variant
                // by default). Title sits leading on @Surface; the
                // ThemeSelector lands in the trailing Actions slot via
                // the markup body (DEFAULT_SLOT_INFO routes TopAppBar
                // body children into Actions via AddChild).
                //
                // OutlineVariant hairline on the bottom edge separates
                // it from the page body underneath since mural doesn't
                // yet have M3's scroll-state container tint.
                TopAppBar [DockPanel.Dock=Top,
                           Title="µ-mural demos"]{
                    ThemeSelector
                }
                Border [DockPanel.Dock=Top, Height=1,
                        Background=@OutlineVariant]

                // Two-level navigation. M3 NavigationRail (80dp wide)
                // on the very left picks the GROUP via SelectedIndex;
                // a ListBox to its right shows the selected group's
                // Demos and picks the DEMO via SelectedDataItem.
                //
                // The five top-level groups (Animation / Controls /
                // Demos / Patterns / Styles & Triggers) are authored
                // declaratively here — group identity is stable enough
                // that hardcoded NavigationItems read more cleanly than
                // a data-driven path (which would also need a custom
                // adapter to map GroupVM.IconGlyph into NavigationItem.
                // Icon). New groups added to demo.* will need a matching
                // NavigationItem here AND a corresponding GROUP_ICONS
                // entry in platform-vm.mjs.
                DockPanel [DockPanel.Dock=Left, LastChildFill=true] {
                    NavigationRail [DockPanel.Dock=Left,
                                    SelectedIndex=$SelectedGroupIndex] {
                        // Material Symbols Outlined icons, loaded by
                        // the host page's <link> tag. Each TextBlock's
                        // Text is the icon NAME — the font's `liga`
                        // feature substitutes the glyph at render time.
                        // FontSize=24 matches M3's nav-rail icon spec
                        // (the :opsz axis was pinned at 24 in the CSS
                        // request). No TextAlignment override needed —
                        // Material Symbols glyphs sit centred in their
                        // em box.
                        NavigationItem [Label="Animation"]         { TextBlock [Text="animation", FontFamily="Material Symbols Outlined", FontSize=24] }
                        NavigationItem [Label="Controls"]          { TextBlock [Text="tune",      FontFamily="Material Symbols Outlined", FontSize=24] }
                        NavigationItem [Label="Demos"]             { TextBlock [Text="widgets",   FontFamily="Material Symbols Outlined", FontSize=24] }
                        NavigationItem [Label="Patterns"]          { TextBlock [Text="grid_view", FontFamily="Material Symbols Outlined", FontSize=24] }
                        NavigationItem [Label="Styles & Triggers"] { TextBlock [Text="palette",   FontFamily="Material Symbols Outlined", FontSize=24] }
                    }
                    Border [Width=200,
                            Background=@SurfaceContainerLow,
                            BorderBrush=@OutlineVariant,
                            BorderThickness=(0,0,1,0)]{
                        // ListBox surfaces the selected row's data via the
                        // Selector-base `SelectedItem` DP (Tag carries the
                        // source value on data-driven rows). TreeView's
                        // `SelectedDataItem` is the analogue there; ListBox
                        // doesn't define it.
                        ListBox [Margin=(8,8,8,8),
                                 ItemsSource=$CurrentDemos,
                                 SelectedItem=$SelectedDemo]
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
