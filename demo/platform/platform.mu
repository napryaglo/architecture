import DemoNavigationService from "./demo-navigation-service.mjs"
import AdornerDecorator from "@visualisation-sub/mural/basic"
import ThemeSelector from "@visualisation-sub/mural/framework/surface.js"
import EditorShell from "@visualisation-sub/mural/framework/shell/editor-shell.js"
import Shell from "@visualisation-sub/mural/framework/shell/shell.js"
import TopAppBar from "@visualisation-sub/mural/framework/top-app-bar/top-app-bar.js"
import NavigationRail from "@visualisation-sub/mural/framework/navigation/navigation-rail.js"
import NavigationItem from "@visualisation-sub/mural/framework/navigation/navigation-item.js"
import Material from "@visualisation-sub/mural/resources/material"
import MaterialLight from "@visualisation-sub/mural/resources/material"

// platform.mu — the µ-mural demo platform, built on the EditorShell
// control and driven by a DI-composed navigation service.
//
//   View    — this .mu file: an EditorShell. Three of its regions
//             (Header / Navigation / Content) are filled by tagging each
//             body child with its `Shell.Region`; ShellBase routes each
//             into the matching template host. The remaining editor
//             regions (Commands / Inspector / Status) are left empty for
//             now — their hosts collapse to zero size, so the platform
//             looks the same while keeping the chrome available for
//             future editing affordances.
//   Model   — DemoNavigationService (demo/platform/demo-navigation-service.mjs),
//             registered into THIS shell's DI scope by the `.services:`
//             block below and consumed via `$service(NavigationService)`
//             bindings. It extends the framework NavigationService (so it
//             registers/resolves under NavigationService.Key) and owns the
//             whole navigation + page model the old PlatformVM held —
//             self-populated from the demo registry. There is no
//             host-script DataContext: every region binding resolves the
//             shell-scoped service through the inherited ServiceScope.
//
// Region map:
//   * Header     — a TopAppBar (brand title + ThemeSelector in its
//                  Actions slot) over a 1-DIP OutlineVariant hairline.
//   * Navigation — the two-level nav strip: an M3 NavigationRail
//                  (group picker, SelectedIndex=$service(…).SelectedGroupIndex)
//                  beside a ListBox of the selected group's demos
//                  (ItemsSource=$service(…).Items, SelectedItem=$service(…).SelectedItem).
//   * Content    — a PageView bound to the service's Title / Subtitle /
//                  Content.
//
// Selection flows service → $service bindings → view, and back on click
// (the selection bindings are TwoWay). The HtmlTarget's ResizeObserver
// re-publishes the host size on resize, and the Measure / Arrange flush
// propagates through the shell automatically.

Application [ Theme = Material, Scheme = MaterialLight ] {
    resources: {
        // The application shell. Its default template lays out
        // Header (top) / Commands (top) / Status (bottom) / Navigation
        // (left) / Inspector (right) / Content (fill); body children
        // below pick their region via Shell.Region. Only Header /
        // Navigation / Content are populated here.
        EditorShell x:root {
            // ── Services ───────────────────────────────────────
            // The navigation model, registered into THIS shell's DI
            // scope. The bare entry lowers to a lazy singleton factory
            // `(p) => new DemoNavigationService(p)`; since the class
            // inherits NavigationService.Key, it registers under that
            // token, so the region bindings below resolve it through
            // `$service(NavigationService)`. Creating the scope also
            // publishes it as the inherited ServiceScope the bindings
            // walk to.
            .services: {
                DemoNavigationService
            }

            // ── Header region ──────────────────────────────────
            // TopAppBar (Small) with the brand title leading and
            // the ThemeSelector in its trailing Actions slot, over
            // a hairline that separates it from the body (mural has
            // no M3 scroll-state container tint yet). Wrapped in a
            // vertical StackPanel because the Header host holds a
            // single child.
            StackPanel [ Shell.Region = Header, Orientation = Vertical ] {
                TopAppBar [ Title = "µ-mural demos" ] {
                    ThemeSelector
                }
                Border [ Height = 1, Background = @OutlineVariant ]
            }

            // ── Navigation region ──────────────────────────────
            // Two-level navigation. The NavigationRail (80dp) picks
            // the GROUP via SelectedIndex; the ListBox to its right
            // shows that group's Demos and picks the DEMO via
            // SelectedItem. The Navigation host stretches this strip
            // to the shell's full height.
            //
            // The five groups are authored declaratively here —
            // group identity is stable enough that hardcoded
            // NavigationItems read more cleanly than a data-driven
            // path. New groups need a matching NavigationItem here
            // AND a GROUP_ICONS entry in demo-navigation-service.mjs.
            DockPanel [ Shell.Region = Navigation, LastChildFill = true ] {
                NavigationRail
                    [ DockPanel.Dock = Left,
                      SelectedIndex  = $service(NavigationService).SelectedGroupIndex ] {
                    // Material Symbols Outlined icons (loaded by the
                    // host page's <link>). Each TextBlock's Text is
                    // the icon NAME — the font's `liga` feature
                    // substitutes the glyph at render time. FontSize
                    // 24 matches M3's nav-rail icon spec.
                    NavigationItem [ Label = "Animation" ] {
                        TextBlock
                            [ Text       = "animation",
                              FontFamily = "Material Symbols Outlined",
                              FontSize   = 24 ]
                    }
                    NavigationItem [ Label = "Controls" ] {
                        TextBlock
                            [ Text       = "tune",
                              FontFamily = "Material Symbols Outlined",
                              FontSize   = 24 ]
                    }
                    NavigationItem [ Label = "Demos" ] {
                        TextBlock
                            [ Text       = "widgets",
                              FontFamily = "Material Symbols Outlined",
                              FontSize   = 24 ]
                    }
                    NavigationItem [ Label = "Patterns" ] {
                        TextBlock
                            [ Text       = "grid_view",
                              FontFamily = "Material Symbols Outlined",
                              FontSize   = 24 ]
                    }
                    NavigationItem [ Label = "Styles & Triggers" ] {
                        TextBlock
                            [ Text       = "palette",
                              FontFamily = "Material Symbols Outlined",
                              FontSize   = 24 ]
                    }
                }
                Border
                    [ Width           = 200,
                      Background      = @SurfaceContainerLow,
                      BorderBrush     = @OutlineVariant,
                      BorderThickness = (0,0,1,0) ] {
                    // ListBox surfaces the selected row's data via
                    // the Selector-base SelectedItem DP. Both ends
                    // resolve the shell-scoped service: Items is the
                    // current group's demos, SelectedItem the active one
                    // (TwoWay — a click writes back through $service).
                    ListBox
                        [ Margin       = (8,8,8,8),
                          ItemsSource  = $service(NavigationService).Items,
                          SelectedItem = $service(NavigationService).SelectedItem ]
                }
            }

            // ── Content region ─────────────────────────────────
            // Title / Subtitle / Content resolved from the navigation
            // service. When SelectedItem changes the service recomputes
            // these three and the bindings push them into the PageView.
            PageView x:name="page"
                [ Shell.Region = Content,
                  Title        = $service(NavigationService).Title,
                  Subtitle     = $service(NavigationService).Subtitle,
                  Content      = $service(NavigationService).Content ]
        }
    }
}
