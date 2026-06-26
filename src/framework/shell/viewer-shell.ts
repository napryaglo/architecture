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
        // hosts → discoverRegions FindName's them so body children route.
        this.applyDefaultStyle();
        this.discoverRegions();
        // Bind the registered region services (Navigation is the relevant
        // one for the viewer) as region-host DataContexts. See
        // BindRegionServices() for the late-registration path.
        this.bindRegionServices();
    }
}
