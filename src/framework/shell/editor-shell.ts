import { Element, Model } from '../../runtime/index.js';
import { ShellBase } from './shell.js';
import { NavigationService } from './services/navigation-service.js';
import { ContentHostService } from './services/content-host-service.js';
import { ApplicationSettings } from './services/application-settings-service.js';
import { DocumentTypeRegistry } from './documents/document-type-registry.js';
import { CommandRegistry } from './commands/command-registry.js';
import { ToolbarService } from './commands/toolbar-service.js';
import { RailAction } from './rail-action.js';
import { SettingsContributionKey, SettingsLauncherService } from './settings/settings-launcher.js';

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
        // Provide the Content region's service by default: a base
        // ContentHostService the content host binds via
        // `$service(ContentHostService).Content`. Same opt-out guard as the
        // navigation service — an app that registers its own (e.g.
        // DocumentsContentHostService under ContentHostService.Key, up-chain)
        // wins, and this base is skipped.
        if (!this.Services.has(ContentHostService.Key))
        {
            this.Services.registerScoped(ContentHostService.Key, (p) => new ContentHostService(p));
        }
        // Provide the ApplicationSettings service by default: aggregates every
        // composed module's declared SettingDefinitions into live, modifiable
        // Settings. Same opt-out guard — an app that registers its own (e.g. to
        // inject an ISettingsStore for persistence) wins, and this base is
        // skipped. The service resolves its optional ISettingsStore from the
        // container itself, so an app enables persistence just by registering a
        // store under SettingsStoreKey — no need to replace this registration.
        if (!this.Services.has(ApplicationSettings.Key))
        {
            this.Services.registerScoped(ApplicationSettings.Key, (p) => new ApplicationSettings(p));
        }
        // Provide the DocumentTypeRegistry by default: aggregates every composed
        // module's declared DocumentDefinitions (the `.documents:` blocks) into
        // one queryable set — lookup by type (→ command contexts) and by file
        // extension (→ factory). Same opt-out guard, so an app that registers its
        // own wins. Cheap to build eagerly here; a future file-open / commands
        // service resolves it by key.
        if (!this.Services.has(DocumentTypeRegistry.Key))
        {
            this.Services.registerScoped(DocumentTypeRegistry.Key, (p) => new DocumentTypeRegistry(p));
        }
        // Provide the command registry + toolbar service by default: the registry
        // aggregates every module's `.commands:` declarations; the toolbar service
        // filters them by the active document's contexts and dispatches to it.
        // Same opt-out guard. Registered registry-first so the toolbar's ctor can
        // resolve it. Both cheap; a data-driven toolbar binds
        // `$service(ToolbarService).VisibleCommands`.
        if (!this.Services.has(CommandRegistry.Key))
        {
            this.Services.registerScoped(CommandRegistry.Key, (p) => new CommandRegistry(p));
        }
        if (!this.Services.has(ToolbarService.Key))
        {
            this.Services.registerScoped(ToolbarService.Key, (p) => new ToolbarService(p));
        }
        // Settings gear (opt-in): when the app registers an ISettingsContribution
        // (the rail icon + the settings view — the framework ships neither), pin
        // a footer RailAction wired to the SettingsLauncherService, which opens
        // the contribution's view in the content host. No contribution ⇒ no gear,
        // so shells without settings (e.g. the demo platform) stay chrome-clean.
        // Resolving NavigationService here lands the action on the same instance
        // the rail binds (this shell's scoped one, or an app override up-chain).
        if (this.Services.has(SettingsContributionKey))
        {
            if (!this.Services.has(SettingsLauncherService.Key))
            {
                this.Services.registerScoped(SettingsLauncherService.Key, (p) => new SettingsLauncherService(p));
            }
            const nav          = this.Services.get(NavigationService.Key);
            const launcher     = this.Services.get(SettingsLauncherService.Key);
            const contribution = this.Services.get(SettingsContributionKey);
            if (nav !== undefined && launcher !== undefined && contribution !== undefined)
            {
                nav.FooterActions.Add(new RailAction(contribution.Icon, launcher.OpenCommand, contribution.Tooltip ?? ''));
            }
        }
        // Region hosts bind their own DataContext in the template via
        // `$service(Token)` (see @DefaultEditorShell) — those bindings resolve
        // against the ServiceScope this shell publishes, so no imperative
        // region→DataContext pass is needed here.
    }
}
