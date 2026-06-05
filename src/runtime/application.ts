import { ResourceDictionary, type ResourceKey } from './resource-dictionary.js';
import type { Visual } from './visual.js';

// Root container for a µ-mural application. Owns app-wide resources
// (themes, implicit styles, keyed templates, named brushes) and
// designates which Visual gets attached to a PresentationTarget at
// mount time.
//
// What Application is NOT: it isn't a Visual, doesn't participate in
// layout or render, doesn't dispatch events. Its only roles are
//   (1) holding the root ResourceDictionary,
//   (2) being the terminal stop of Visual.TryFindResource's ancestor
//       walk so app-level resources resolve from anywhere in the tree,
//   (3) carrying the x:root marker (via Resources.Root) so the host
//       knows what to mount.
//
// `current` is the WPF-style ambient singleton. Set in the constructor
// (last-construction-wins). For multi-app contexts (SSR with concurrent
// requests, embedded surfaces in a host app) callers can ignore
// `current` and pass an Application instance explicitly — the resource
// walk's fallback consults `current` only when the tree's logical
// parent chain exhausts without resolving.
//
// `Mount` is the generic ergonomic entry point: takes any object with
// a writable `Content` slot (typically a PresentationTarget subclass —
// HtmlTarget, HeadlessTarget) and writes Root into it. Duck-typed on
// purpose to keep the runtime layer from importing visual-engine; the
// consumer's import of HtmlTarget (or HeadlessTarget) supplies the
// concrete target type.

export interface MountableTarget
{
    Content: Visual | undefined;
}

export class Application
{
    // Ambient singleton — last constructed instance wins. Cleared
    // explicitly by tests that need isolation.
    public static current: Application | null = null;

    // Each control's compiled `.template.mu` ships its defaults as a
    // ResourceDictionary; the control's static initialiser appends a
    // zero-arg factory to this list. Pushed lazily so static-init time
    // (when controls finish loading) never executes the factory body —
    // that defers the `ControlTemplate` / `Border` references inside the
    // factory until module loading has fully resolved them. Application
    // calls each factory exactly once via `getDefaultResources()`, then
    // every subsequent Application reuses the same dictionary instances.
    //
    // runtime never imports the Controls layer; this list is the
    // dependency-inverted seam (Controls push in, Application reads
    // out) that keeps the Application class layer-pure while still
    // picking up the built-in default ControlTemplates automatically.
    public static DefaultResourceFactories: Array<() => ResourceDictionary> = [];

    private static _defaultResources: ResourceDictionary[] | undefined;

    public readonly Resources: ResourceDictionary = new ResourceDictionary();

    constructor()
    {
        Application.current = this;
        for (const dict of Application.getDefaultResources())
        {
            // Idempotent — the same dictionary instance MAY appear in
            // multiple parents' merge chains (ResourceDictionary merges
            // by reference), but adding the same dict twice to one
            // parent would double-fire change notifications.
            if (!this.Resources.MergedDictionaries.includes(dict))
            {
                this.Resources.AddMergedDictionary(dict);
            }
        }
    }

    // Lazily materialise each control's default ResourceDictionary by
    // invoking its registered factory exactly once. The cache is a
    // process-wide singleton — every Application instance shares the
    // SAME default dictionaries so the underlying ControlTemplate
    // instances are identical across applications.
    private static getDefaultResources(): ResourceDictionary[]
    {
        if (this._defaultResources === undefined)
        {
            this._defaultResources = this.DefaultResourceFactories.map(f => f());
        }
        return this._defaultResources;
    }

    // Resolve a resource (typically a default ControlTemplate) by key.
    // Walks `Application.current.Resources` first so a consumer who
    // sets `app.Resources.Set(Button, myTemplate)` BEFORE constructing
    // any Button overrides the bundled default — exactly the WPF
    // implicit-Style replacement pattern. Falls back to the bundled
    // default dictionaries directly so tests / unmounted controls
    // without an Application still resolve.
    //
    // Accepts `string | Function` keys: built-in control templates are
    // keyed by the control's class function (Button, ListBox, …) under
    // the no-string-type-proxies rule; ad-hoc resources stay string-keyed.
    public static ResolveDefaultResource<T = unknown>(key: ResourceKey): T | undefined
    {
        const app = Application.current;
        if (app !== null)
        {
            const v = app.Resources.Resolve(key);
            if (v !== undefined) return v as T;
        }
        for (const dict of this.getDefaultResources())
        {
            const v = dict.Resolve(key);
            if (v !== undefined) return v as T;
        }
        return undefined;
    }

    // The visual marked with `x:root` in the application's resources.
    // Delegates to Resources.Root so there's a single source of truth
    // and a single setter (the dictionary's). Reads as undefined until
    // the compiler-emitted bind pass registers a root.
    public get Root(): Visual | undefined
    {
        return this.Resources.Root;
    }

    // Attach Root to a mountable target and return the target. Throws
    // when no x:root marker has been registered — mounting an
    // Application with nothing to show is a programming error worth
    // catching loudly. The target keeps responsibility for layout +
    // render + lifecycle; Application's job ends after the assignment.
    public Mount<T extends MountableTarget>(target: T): T
    {
        if (this.Root === undefined)
        {
            throw new Error(
                'Application.Mount: no x:root marker in Resources — nothing to mount.',
            );
        }
        target.Content = this.Root;
        return target;
    }
}
