import { Element, Model } from '../../runtime/index.js';
import { ShellBase } from './shell.js';
import { NavigationService } from './services/navigation-service.js';

// Application shell for editing surfaces. Carries the full region set:
// a header (app bar), a command surface (menu + toolbar), a left
// navigation strip, a center editable content area, a right inspector
// panel, and a bottom status bar — see @DefaultEditorShell in
// shell.template.mu for the region → DockPanel-edge map.
//
// The skeleton only lays the regions out; the editing behaviour lives
// in whatever the consumer slots into Content and the VM behind it.
export class EditorShell extends ShellBase
{
    static
    {
        Model.OverrideMetadata(
            EditorShell, Element.DefaultStyleKeyKey,
            { default_value: EditorShell });
    }

    constructor()
    {
        super();
        // applyDefaultStyle → @DefaultEditorShell materialises the region
        // hosts; their content binds via `$service(…)` in the template.
        this.applyDefaultStyle();
        // Provide the Navigation region's service by default: a base
        // NavigationService whose destinations flatten from the Application's
        // modules. Registered `scoped` (one per shell) into this shell's own
        // scope, and ONLY when nothing up-chain already supplies one — so an
        // app that registers its own NavigationService (at the root, or a
        // subclass) still wins. `has` walks to the app root, where any app-level
        // registration lives by the time this ctor runs.
        if (!this.Services.has(NavigationService.Key))
        {
            this.Services.registerScoped(NavigationService.Key, (p) =>
            {
                const nav = new NavigationService(p);
                nav.PopulateFromModules();
                return nav;
            });
        }
        // Region hosts bind their own DataContext in the template via
        // `$service(Token)` (see @DefaultEditorShell) — those bindings resolve
        // against the ServiceScope this shell publishes, so no imperative
        // region→DataContext pass is needed here.
    }
}
