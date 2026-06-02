// platform.mu — Shell for the µ-mural demo platform. A two-pane
// DockPanel:
//
//   * Left  — fixed-width nav strip with a brand header and an
//             empty TreeView the host populates from the registry
//             at startup.
//   * Right — a PageView that hosts whatever demo is currently
//             selected. Title + Subtitle are written from code
//             when the host swaps in a demo's root visual.
//
// No fixed Width / Height on the root: the Border stretches to fill
// whatever rectangle the HtmlTarget reports for its host element. The
// host page sizes #app to the browser viewport via CSS; the
// HtmlTarget's ResizeObserver re-publishes that size on every browser
// resize, and the resulting Measure / Arrange flushes propagate to
// the entire shell automatically.
//
// Both TreeView and PageView resolve from the host via FindName.

Application{
    resources: {
        @paper      = #ffffff
        @hairline   = #e2e8f0
        @primary    = #1976d2
        @primInk    = #ffffff
        @navBg      = #f8fafc

        Border x:root [Background=@paper]{
            DockPanel [lastChildFill=true] {

                // Nav strip — fixed cross-axis width (260 DIP), full
                // host height. Hairline on the inner edge separates it
                // from the page body.
                Border[DockPanel.Dock=Left, Width=260,
                       Background=@navBg,
                       BorderBrush=@hairline,
                       BorderThickness=(0,0,1,0)]{
                    StackPanel{
                        // Brand header.
                        Border[Background=@primary, Padding=(20,16,20,16)]{
                            TextBlock[Text="µ-mural demos",
                                      FontSize=14, FontWeight=Bold,
                                      Foreground=@primInk]
                        }
                        // The TreeView is left empty in markup; the
                        // host code reads the registry on startup
                        // and builds one TreeViewItem per demo,
                        // grouped under a folder-style top-level
                        // item per group. x:name="nav" lets the
                        // host find it via app.Root.FindName.
                        TreeView x:name="nav"[Indent=18, Margin=(8,8,8,8)]
                    }
                }

                // Demo body — filled by the host as soon as the
                // first demo is selected. Empty Title/Subtitle here
                // are placeholders; the host always overwrites them
                // before the visual surfaces.
                PageView x:name="page"[Title="", Subtitle=""]
            }
        }
    }
}
