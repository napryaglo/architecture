// platform.mu — the µ-mural demo platform, composed as a services-driven shell.
//
//   View    — this .mu file: an EditorShell with NO body children, driven by
//             modules + services. Its activity-bar rail binds to the
//             NavigationService (destinations flattened from the module's group
//             capabilities); the left pane presents the SELECTED group's service
//             (NavigationService.ActiveService) via the DemoGroupService template
//             the module contributes (a demo ListBox).
//   Model   — NavigationService (auto-registered + populated by EditorShell when
//             the app registers none) + one DemoGroupService per group (see
//             demo-group-services.mts). The module's `.services:` block registers
//             them; each capability's `ServiceKey` names the one that backs it.
//   Modules — DemoPlatformModule contributes one capability per demo group, the
//             per-group services, the group-content DataTemplate, and (via
//             DemoPlatformIcons) each capability's rail glyph.
//
// Selection flows: rail → NavigationService.SelectedItem → ActiveService (the
// selected capability's DemoGroupService), which the left pane renders as a demo
// ListBox. Each DemoGroupService snapshots its group's demos from the registry
// and routes late registrations itself, so no bespoke navigation service is
// needed — the base NavigationService is enough.

import DemoVM from "./demo-group-services.mjs"
import DemoPlatformModule from "./demo-platform.module.mu.js"
import DemoPlatformIcons from "./demo-platform-icons.mu.js"
import EditorShell from "@visualisation-sub/mural/framework/shell/editor-shell.js"
import Material from "@visualisation-sub/mural/resources/material"
import MaterialLight from "@visualisation-sub/mural/resources/material"

Application [ Theme = Material, Scheme = MaterialLight ] {
    .modules: {
        DemoPlatformModule
    }

    resources: {
        // Group rail icons, merged app-global so each capability's
        // `Icon = @<Key>` (a DynamicResource) resolves.
        merge DemoPlatformIcons

        // A demo list row — the group's ListBox renders each DemoVM through this
        // implicit-by-type template. DemoVM is the one DemoGroupService.Demos
        // holds (demo-group-services.mjs), so the DataType matches the items.
        DataTemplate [DataType = DemoVM] {
            TextBlock [ Text = $Label, Margin = (4,3,4,3) ]
        }

        // The application shell. No body children and no nav-service registration:
        // EditorShell auto-registers a base NavigationService and populates it
        // from the composed modules; the rail + left pane bind through `$service`.
        EditorShell x:root { }
    }
}
