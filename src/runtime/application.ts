import { ResourceDictionary } from './resource-dictionary.js';
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

    public readonly Resources: ResourceDictionary = new ResourceDictionary();

    constructor()
    {
        Application.current = this;
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
