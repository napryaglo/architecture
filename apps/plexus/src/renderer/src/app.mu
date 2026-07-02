// app.mu — the Plexus application root.
//
// An `Application` block compiles to `export const app` (an initialized
// Application whose `x:root` element is the mounted root visual). The
// renderer bootstrap (main.js) hands `app` an HtmlTarget to paint into.
//
// The root is an EditorShell — the framework's app-frame control. Its
// default template lays out six regions: Header (top), Commands (top),
// Navigation (left), Content (fill), Inspector (right), Status (bottom).
// Each body child picks its region via the `Shell.Region` attached
// property; an unpopulated region collapses. This is the same shell the
// demo platform uses, mapped to a diagram editor's frame:
//
//   Header      brand bar
//   Commands    editing toolbar
//   Navigation  shape toolbox (left)
//   Content     the canvas surface
//   Inspector   format / properties pane (right)
//   Status      status bar (bottom)
//
// Regions are populated with a real-but-minimal skeleton; each grows into
// its full control (a data-driven toolbox, DiagramDocument-backed canvas,
// live ShapeFormatControl, etc.) as the editor fills in.

// Theme / Scheme are real class references (the no-string-proxies rule);
// Shell owns the `Region` attached property. All other controls resolve
// through the compiler's default symbol table.
import Material from "@visualisation-sub/mural/resources/material"
import MaterialDark from "@visualisation-sub/mural/resources/material"
import Shell from "@visualisation-sub/mural/framework/shell/shell.js"

// The app's modules — each a `module NAME { … }` const from its own file.
// Listed in the `.modules:` block below, they compose onto the shell:
// every capability's Name (and, later, Icon) becomes a root-nav entry, and
// the NavigationService surfaces the active capability's Panel.
import DiagramModule from "./modules/diagram.module.mu.js"
import ArchitectureRepositoryModule from "./modules/architecture-repository.module.mu.js"
import TechnologyLibraryModule from "./modules/technology-library.module.mu.js"
import ProjectExplorerModule from "./modules/project-explorer.module.mu.js"
import ArchitectureMetaModelsModule from "./modules/architecture-meta-models.module.mu.js"

// Shared icon dictionary — one Geometry per capability, merged into the app's
// Resources (via `merge` below) so each module's `Icon = @<Key>` resolves.
import PlexusIcons from "./plexus-icons.mu.js"

// The Navigation region's service is provided by EditorShell itself: a base
// NavigationService whose destinations flatten from the modules listed below.
// No app-level `.services:` registration is needed — the shell supplies the
// default (an app wanting custom navigation would register its own against
// NavigationService.Key to override it).
Application [ Theme = Material, Scheme = MaterialDark ] {
    .modules: {
        DiagramModule
        ArchitectureRepositoryModule
        TechnologyLibraryModule
        ProjectExplorerModule
        ArchitectureMetaModelsModule
    }

    resources: {
        merge PlexusIcons
        EditorShell x:root { }
    }
}
