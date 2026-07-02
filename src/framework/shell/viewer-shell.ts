import { Element, Model } from '../../runtime/index.js';
import { ShellBase } from './shell.js';

// Readonly application shell for displaying purposed applications — a
// navigable set of read-only views. Carries only a header and a left
// navigation strip switching between content views; no command surface,
// inspector, or status bar (see @DefaultViewerShell in
// shell.template.mu).
//
// Tagging a body child for an editor-only region (Commands / Inspector
// / Status) throws from ShellBase.AddChild — the viewer deliberately
// has no host for those.
export class ViewerShell extends ShellBase
{
    static
    {
        Model.OverrideMetadata(
            ViewerShell, Element.DefaultStyleKeyKey,
            { default_value: ViewerShell });
    }

    constructor()
    {
        super();
        // applyDefaultStyle → @DefaultViewerShell materialises the region
        // hosts; their content binds via `$service(…)` in the template.
        this.applyDefaultStyle();
        // The Navigation region host binds its own DataContext in the template
        // via `$service(NavigationService)` (see @DefaultViewerShell), resolved
        // against the ServiceScope this shell publishes — no imperative pass.
    }
}
