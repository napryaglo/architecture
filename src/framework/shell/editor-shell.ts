import { Element, Model } from '../../runtime/index.js';
import { ShellBase } from './shell.js';

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
        // hosts → discoverRegions FindName's them so body children route.
        this.applyDefaultStyle();
        this.discoverRegions();
        // Resolve the region services registered on Application.current's
        // scope and bind them as the region hosts' DataContext. A no-op
        // for regions whose service isn't registered; re-run via
        // BindRegionServices() if the app registers after construction.
        this.bindRegionServices();
    }
}
