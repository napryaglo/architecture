import { Binding, BindingMode, NameScope, type BindingOptions, type Visual } from '../runtime/index.js';
import { ContentPresenter } from './content-presenter.js';

// Factory signature for a ControlTemplate. Constructs a fresh visual
// subtree on each call (NOT a singleton — multiple ContentControl
// instances using the same template each need their own tree of
// generated visuals).
//
// The `templatedParent` argument is the control whose Template the
// factory is producing for — used directly if the factory needs to
// reach back to the control's properties at construction time, and
// stamped automatically on every generated visual by the apply
// pipeline for TemplateBinding to read later.
export type TemplateFactory = (templatedParent: Visual) => Visual;

// The result of applying a ControlTemplate. `root` is the visual
// the control will mount as its visualChild; `contentPresenter` is
// the first ContentPresenter found in the subtree (the slot the
// control's Content gets routed to), or undefined if the template
// doesn't have one (intentional — some controls render purely from
// their properties without exposing a Content slot).
export interface TemplateInstance
{
    readonly root: Visual;
    readonly contentPresenter: ContentPresenter | undefined;
}

// A ControlTemplate is the imperative blueprint a control uses to
// build its visual structure. Apply produces a fresh TemplateInstance:
// the same template applied to two control instances yields two
// independent visual subtrees.
//
// The factory runs synchronously and is expected to return a fully-
// constructed visual subtree. After it returns, the apply pipeline
// walks the subtree and stamps `templatedParent` on every node so
// TemplateBinding (future) can dereference back to the owning
// control. It also scans for the first ContentPresenter so the
// control can slot its Content in.
//
// Scaffold for Phase 2a — the factory API is the minimum that lets
// us prove the templating model. A declarative markup layer
// (XAML-equivalent) is a separate effort that lowers to this same
// imperative shape.
export class ControlTemplate
{
    constructor(public readonly factory: TemplateFactory) {}

    public Apply(templatedParent: Visual): TemplateInstance
    {
        const root = this.factory(templatedParent);
        markTemplated(root, templatedParent);

        // Each template instance gets its own NameScope, attached to
        // the root. Walks the template subtree and registers every
        // Visual whose .Name was set inside the factory. The scope
        // boundary at root means FindName from any template-internal
        // node resolves here — distinct from the consumer's surrounding
        // scope (if any), so the same name in two templates doesn't
        // collide.
        const nameScope = new NameScope();
        root.SetNameScope(nameScope);
        registerNamedVisuals(root, nameScope);

        const contentPresenter = findFirstContentPresenter(root);
        return { root, contentPresenter };
    }
}

// Walks the visual subtree of a freshly-built template and stamps
// the TemplatedParent back-pointer on every node. Recurses into
// visualChildren — logicalChildren aren't followed because at this
// point the template tree contains only template-internal visuals
// (the consumer's Content hasn't been slotted yet) and they coincide.
function markTemplated(visual: Visual, templatedParent: Visual): void
{
    visual.SetTemplatedParent(templatedParent);
    for (const child of visual.visualChildren)
    {
        markTemplated(child, templatedParent);
    }
}

// Walks the freshly-built template subtree and registers every Visual
// with a non-empty .Name in the template's NameScope. Runs in the same
// visual-children traversal as markTemplated, but kept separate so
// the responsibility split is obvious: markTemplated wires the
// back-pointer, this populates the lookup table.
function registerNamedVisuals(visual: Visual, scope: NameScope): void
{
    const name = visual.Name;
    if (name !== undefined && name.length > 0)
    {
        scope.Register(name, visual);
    }
    for (const child of visual.visualChildren)
    {
        // Stop at a sub-template root — its own NameScope owns the
        // descendants below it, and re-registering them in the outer
        // scope would collide whenever two sister sub-templates use
        // the same PART_ names. Without this gate, e.g. a TreeView
        // default template containing a ScrollViewer (whose two inner
        // ScrollBars each have their own PART_Track / PART_Thumb)
        // would throw `name already registered` at Apply time.
        if (child.nameScope !== undefined) continue;
        registerNamedVisuals(child, scope);
    }
}

// Depth-first search for the first ContentPresenter in the template
// subtree. WPF's convention is "the first one wins" when a template
// contains multiple — covers the common case (one Content slot)
// without forcing the factory to expose it explicitly.
function findFirstContentPresenter(visual: Visual): ContentPresenter | undefined
{
    if (visual instanceof ContentPresenter) return visual;
    for (const child of visual.visualChildren)
    {
        const found = findFirstContentPresenter(child);
        if (found !== undefined) return found;
    }
    return undefined;
}

// Sugar for the WPF `{TemplateBinding Property}` markup extension.
// Inside a template factory the `templatedParent` argument is the
// control whose template is being instantiated, so a binding to it
// is literally `new Binding(templatedParent, path)`. TemplateBinding
// is just that, with an ergonomic name and a default of OneWay (the
// only useful mode — TwoWay would push template-internal state back
// into the templated control's surface, which is rarely what you
// want).
//
// Usage from inside a factory:
//
//   new ControlTemplate(tp => {
//       const border = new Border();
//       border.set_property_value('Background',
//           TemplateBinding(tp, 'Background'));
//       return border;
//   });
//
// Same change-notification machinery as any other Binding: when the
// templated control's Background changes, the new value is pushed
// through to the border.
export function TemplateBinding(templatedParent: Visual, path: string, opts?: BindingOptions): Binding
{
    return new Binding(templatedParent, path, BindingMode.OneWay, opts);
}
