import {
    Application,
    MetaData,
    Model,
    ServiceProvider,
    Visual,
    type ServiceToken,
} from '../../runtime/index.js';
import { TemplatedControl } from '../../basic/templated-control.js';
import { NavigationService } from './services/navigation-service.js';
import { InspectorService } from './services/inspector-service.js';
import { StatusService } from './services/status-service.js';

// The regions an application shell exposes. A body child's
// `Shell.Region` attached value picks which template host it lands in;
// untagged children default to Content (the common "fill the body"
// case).
//
// Not every shell variant provides every region — ViewerShell has no
// Commands / Inspector / Status hosts. Tagging a child for a region the
// active template doesn't define is an authoring error that
// ShellBase.AddChild surfaces (with the missing PART name) rather than
// silently dropping the child.
export enum ShellRegion
{
    Header     = 'Header',
    Commands   = 'Commands',
    Navigation = 'Navigation',
    Content    = 'Content',
    Inspector  = 'Inspector',
    Status     = 'Status',
}

// Attached-property holder so markup reads `[Shell.Region=Inspector]`
// — the same two-part form as `[DockPanel.Dock=Left]`. Never
// instantiated; it exists only to own the Region attached DP and its
// static Get/Set accessors (mirrors DockPanel.SetDock / GetDock).
export class Shell
{
    public static readonly RegionKey = Model.RegisterAttachedProperty<ShellRegion>(
        Shell, 'Region', ShellRegion.Content, MetaData.None);

    public static SetRegion(v: Visual, region: ShellRegion): void
    {
        v.set_property_value(Shell.RegionKey, region);
    }

    public static GetRegion(v: Visual): ShellRegion
    {
        return v.get_property_value(Shell.RegionKey);
    }
}

// region → template part name. A shell's default template names the
// hosts it provides; ShellBase discovers whichever exist after the
// Style applies.
const REGION_PARTS: ReadonlyMap<ShellRegion, string> = new Map<ShellRegion, string>([
    [ShellRegion.Header,     'PART_HeaderHost'],
    [ShellRegion.Commands,   'PART_CommandHost'],
    [ShellRegion.Navigation, 'PART_NavHost'],
    [ShellRegion.Content,    'PART_ContentHost'],
    [ShellRegion.Inspector,  'PART_InspectorHost'],
    [ShellRegion.Status,     'PART_StatusHost'],
]);

// Structural host shapes — a region host is either a single-child
// surface (Border: one Visual) or a list panel (StackPanel: many).
// ShellBase routes through whichever the template author chose without
// importing Border / Panel, keeping the base free of layout-type deps.
interface SingleChildHost { SetChild(child: Visual | undefined): void; }
interface ListChildHost   { AddChild(child: Visual): void; }

function isSingleChildHost(v: object): v is SingleChildHost
{
    return typeof (v as Partial<SingleChildHost>).SetChild === 'function';
}

// region → the service whose instance backs it. The shell resolves each
// from its own DI scope and makes it the region host's DataContext, so
// content slotted into the region binds to its service. Header / Content
// / Commands have no entry — those regions fall through to the shell's
// inherited DataContext (the app's main VM). Apps register the concrete
// implementations against these tokens (scoped, so each shell scope gets
// its own instance).
const REGION_SERVICES: ReadonlyMap<ShellRegion, ServiceToken<object>> = new Map<ShellRegion, ServiceToken<object>>([
    [ShellRegion.Navigation, NavigationService.Key],
    [ShellRegion.Inspector,  InspectorService.Key],
    [ShellRegion.Status,     StatusService.Key],
]);

// Shared skeleton for application shells. Owns the region-routing
// contract; the concrete variants (EditorShell / ViewerShell) supply
// the default template that decides which regions exist and how the
// chrome is laid out. Abstract — never registered with a default style
// of its own, so it carries no DefaultStyleKey block.
export abstract class ShellBase extends TemplatedControl
{
    // region → discovered host Visual from the applied template.
    private readonly _hosts = new Map<ShellRegion, Visual>();

    // This shell's own DI scope (lazy). A child of
    // Application.current.Services: per-shell `scoped` region services
    // resolve to instances unique to THIS shell here, and Dispose() tears
    // them down with the shell.
    private _scope: ServiceProvider | undefined;

    // The shell's own DI scope — a child of Application.current.Services.
    // This is the `.services:` target for a `.services:` block authored on
    // the shell element (`editorShell.Services.addInstance(…)`), and it
    // backs the inherited `ServiceScope` the shell publishes so descendant
    // `$service(Token)` bindings resolve the shell's per-instance services
    // (not the app root). Creating the scope also publishes it.
    public get Services(): ServiceProvider
    {
        if (this._scope === undefined)
        {
            const root = Application.current?.Services;
            this._scope = root !== undefined ? root.createScope() : new ServiceProvider();
            // Publish for the subtree's `$service(…)` bindings. Inherits
            // down through the template + slotted region content.
            this.ServiceScope = this._scope;
        }
        return this._scope;
    }

    // Subclasses call this after applyDefaultStyle() so the template
    // parts exist to FindName.
    protected discoverRegions(): void
    {
        this._hosts.clear();
        for (const [region, part] of REGION_PARTS)
        {
            const host = this.GetTemplateChild(part);
            if (host !== undefined) this._hosts.set(region, host);
        }
    }

    // Resolve each region's service from the scope and make it the
    // DataContext of that region's host, so content slotted into the
    // region binds to its service. Regions with no registered service
    // keep the inherited DataContext (Header / Content fall through to
    // the app's main VM). Idempotent — safe to call again after late
    // registration into Services.
    //
    // Note: with markup `.services:` on the shell, registration runs AFTER
    // this ctor pass, so the code-binding finds nothing — region content
    // consumes scoped services via `$service(Token)` (which resolves the
    // published ServiceScope) instead. This path stays for apps that
    // pre-register at the root and prefer the DataContext convenience.
    protected bindRegionServices(): void
    {
        for (const [region, token] of REGION_SERVICES)
        {
            const host = this._hosts.get(region);
            if (host === undefined) continue;
            const service = this.Services.get(token);
            if (service !== undefined) host.DataContext = service;
        }
    }

    // Public re-bind hook for the bootstrap: register services into
    // Services (or the app root) AFTER constructing the shell, then call this.
    public BindRegionServices(): void
    {
        this.bindRegionServices();
    }

    // Tear down the shell's scope — disposes the scoped region services
    // it owns. Call when the shell is removed for good.
    public Dispose(): void
    {
        this._scope?.dispose();
        this._scope = undefined;
    }

    // Default-slot routing — body children (kind 'list' in
    // DEFAULT_SLOT_INFO emit `parent.AddChild(child)`) arrive here. Each
    // is slotted into the host for its Shell.Region attached value.
    //
    // The hosts live inside the template tree, so children dropped into
    // them inherit DataContext / theme through the normal visual-tree
    // cascade — ShellBase needs no logicalChildren override (same as
    // TopAppBar's Actions stack).
    public AddChild(child: Visual): void
    {
        const region = Shell.GetRegion(child);
        const host   = this._hosts.get(region);
        if (host === undefined)
        {
            const part = REGION_PARTS.get(region);
            throw new Error(
                `${this.constructor.name} has no '${region}' region — its ` +
                `template defines no ${part}. Tag the child for a region this ` +
                `shell provides, or use the editor variant.`);
        }
        if (isSingleChildHost(host)) host.SetChild(child);
        else (host as unknown as ListChildHost).AddChild(child);
    }
}
