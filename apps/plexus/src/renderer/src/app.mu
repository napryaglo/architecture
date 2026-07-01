// app.mu — the Plexus application root.
//
// An `Application` block compiles to `export const app` (an initialized
// Application whose `x:root` element is the mounted root visual). The
// renderer bootstrap (main.js) hands `app` an HtmlTarget to paint into.
//
// This is the skeleton frame: a header bar over an (empty) canvas surface.
// The real editor grows from here — a toolbar of tools, a DiagramDocument
// backing the canvas items, an inspector pane on the right. Keeping the
// first cut to basic controls (DockPanel / Border / Canvas / TextBlock)
// proves the build loop end-to-end before any of that lands.

// Theme / Scheme are real class references (the no-string-proxies rule),
// so they need import clauses — same as the mural demos.
import Material from "@visualisation-sub/mural/resources/material"
import MaterialLight from "@visualisation-sub/mural/resources/material"

Application [ Theme = Material, Scheme = MaterialLight ] {
    resources: {
        DockPanel x:root [ LastChildFill = true ] {
            // ── Header bar ──────────────────────────────────────────
            Border [ DockPanel.Dock = Top, Background = @SurfaceVariant, Padding = (16,10) ] {
                TextBlock
                    [ Style      = @TitleMedium,
                      Text       = "Hello, Plexus!",
                      Foreground = @OnSurfaceVariant ]
            }

            // ── Canvas surface (fill) ───────────────────────────────
            // A plain Canvas for now — a fixed drawing area with a
            // distinct surface tint so the frame is visibly "the canvas".
            // This becomes the DiagramDocument-backed editing surface.
            Canvas [ Background = @Surface, Width = 2000, Height = 1500 ]
        }
    }
}
