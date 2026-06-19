import { Binding, BindingMode, NameScope, type BindingOptions, type EventTrigger, type Visual } from '../../runtime/index.js';
import { ContentPresenter } from './content-presenter.js';
import type { TemplatePropertyTrigger } from './data-template.js';

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
    constructor(
        public readonly factory:       TemplateFactory,
        public readonly triggers:      readonly TemplatePropertyTrigger[] = [],
        // `on Event { … }` triggers inside ControlTemplate.Triggers.
        // Each freshly-built template-internal root gets its own
        // AddEventTrigger registration so storyboards and command
        // dispatch fire on the per-instance routed-event path. Mirrors
        // WPF's `<ControlTemplate.Triggers><EventTrigger…>` shape.
        public readonly eventTriggers: readonly EventTrigger[] = [],
    ) {}

    public Apply(templatedParent: Visual): TemplateInstance
    {
        const root = this.factory(templatedParent);
        markTemplated(root, templatedParent);

        // Style + DynamicResource re-walk through the freshly-stamped
        // templatedParent chain. WHY: the factory builds the subtree by
        // calling SetChild / AddChild, each of which fires AttachLogical
        // → _refresh_styles_subtree on the new child. At that point
        // _templatedParent is undefined (we haven't stamped yet), so
        // the resource walk in subscribe_styles / resolve_implicit_style
        // stops at the template-internal logical root and only sees the
        // app-level fallback. Implicit Styles sitting on the templated
        // control's own Resources (or on its consumer-side ancestor
        // chain reachable through templatedParent) get missed. Re-walking
        // here, AFTER markTemplated, lets the lookups consult the full
        // ancestry — closes § 11.2 (implicit Style crosses template
        // boundaries). Same shape for DynamicResource bindings whose
        // ancestor-chain subscriptions cached the empty-templatedParent
        // chain during construction. Inheritance is left to the caller
        // (ContentControl.rebuildTemplate runs _refresh_inheritance_subtree
        // explicitly after AttachVisual + DataContext propagation).
        root['_refresh_styles_subtree']();
        root['_refresh_dynamic_resources_subtree']();

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

        // Attach template triggers — the WPF parity for
        // `ControlTemplate.Triggers`. Each trigger watches a property
        // on the TEMPLATED PARENT (the control whose template this is
        // — IsSelected, IsMouseOver, IsPressed, …) and applies its
        // TargetedSetter setters to named template parts. The runtime
        // takes templatedParent as the default source so the natural
        // shape `when(IsSelected) { PART_Border.Background = …; }`
        // resolves IsSelected against the ListBoxItem (not the template
        // root) and writes Background on PART_Border via FindName lookup
        // in the freshly-built nameScope.
        for (const trigger of this.triggers)
        {
            trigger.AttachTo(root, templatedParent);
        }

        // Routed-event triggers attach to the template-internal root —
        // same path as DataTemplate.EventTriggers. The freshly-built
        // root carries its own per-instance subscription so two
        // templated controls authored from the same ControlTemplate
        // never share listener state.
        for (const t of this.eventTriggers) root.AddEventTrigger(t);

        const contentPresenter = findFirstContentPresenter(root);
        return { root, contentPresenter };
    }
}

// Walks the visual subtree of a freshly-built template and stamps
// the TemplatedParent back-pointer on every node. Stops at sub-template
// roots so a nested templated control's internal parts keep THEIR own
// templatedParent (set by their inner Apply), not ours. Also walks
// logicalChildren that aren't direct visualChildren — for a templated
// control authored in the outer template (e.g. `ScrollViewer { ... }`)
// the consumer's Content lives logically here but is visually buried
// inside the inner template, past the nameScope barrier we just
// skipped.
function markTemplated(visual: Visual, templatedParent: Visual): void
{
    visual.SetTemplatedParent(templatedParent);
    const visualKids = visual.visualChildren;
    for (const child of visualKids)
    {
        if (child.nameScope !== undefined) continue;
        markTemplated(child, templatedParent);
    }
    const logicalKids = visual.logicalChildren;
    if (logicalKids.length === 0) return;
    for (const child of logicalKids)
    {
        if (visualKids.includes(child)) continue;
        markTemplated(child, templatedParent);
    }
}

// Walks the freshly-built template subtree and registers every Visual
// with a non-empty .Name in the template's NameScope. Runs in the same
// visual-children traversal as markTemplated, but kept separate so
// the responsibility split is obvious: markTemplated wires the
// back-pointer, this populates the lookup table.
// Exported for DataTemplate.Apply, which needs the same subtree walk —
// names declared inside a DataTemplate factory body must land in the
// fresh per-instance NameScope at Apply time, not at factory-emit time.
// Keeping a single implementation here means ControlTemplate and
// DataTemplate cannot drift on how `x:name` resolves.
export function registerNamedVisuals(visual: Visual, scope: NameScope): void
{
    const name = visual.Name;
    if (name !== undefined && name.length > 0)
    {
        scope.Register(name, visual);
    }
    const visualKids = visual.visualChildren;
    for (const child of visualKids)
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
    // Walk logical-only children too. A templated visual's CONSUMER
    // Content (set via `.Content = …` in the surrounding template) is
    // its logical child but NOT its direct visual child — visually it
    // lives inside the template's internal ContentPresenter slot, on
    // the OTHER side of the nameScope barrier we just skipped. Without
    // this second pass, names set on consumer-supplied content of a
    // templated control (e.g. `TextEditorSurface x:name="PART_Editor"`
    // inside `ScrollViewer x:name="PART_Scroll" { … }`) would never
    // reach the outer scope. Skip entries already covered by the visual
    // pass so a non-templated host (Border, StackPanel) doesn't
    // double-register its single Child.
    const logicalKids = visual.logicalChildren;
    if (logicalKids.length === 0) return;
    for (const child of logicalKids)
    {
        if (visualKids.includes(child)) continue;
        registerNamedVisuals(child, scope);
    }
}

// Depth-first search for the first ContentPresenter in the template
// subtree. WPF's convention is "the first one wins" when a template
// contains multiple — covers the common case (one Content slot)
// without forcing the factory to expose it explicitly. Stops at
// sub-template roots: a nested templated control's internal
// ContentPresenter (e.g. the SCP inside a ScrollViewer that the
// OUTER template authored) is THAT control's slot, not ours. Without
// this barrier a Button whose template happens to embed a
// ScrollViewer would route Button.Content into the ScrollViewer's
// SCP instead of the Button's own ContentPresenter.
function findFirstContentPresenter(visual: Visual): ContentPresenter | undefined
{
    if (visual instanceof ContentPresenter) return visual;
    for (const child of visual.visualChildren)
    {
        if (child.nameScope !== undefined) continue;
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
//       border.set_property_value(Border.BackgroundKey,
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
