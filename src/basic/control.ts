import {
    Element,
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { ControlTemplate, type TemplateInstance } from './templates/control-template.js';
import type { ContentPresenter } from './templates/content-presenter.js';
import type { CommandBinding } from '../framework/commands/command-binding.js';
import type { InputBinding } from '../framework/commands/input-binding.js';

// Control — the single base class for every templated control. WPF
// parity: the equivalent of `System.Windows.Controls.Control`, sitting
// between `Element` (mural's FrameworkElement tier — DataContext, Style,
// Resources, Triggers all live there) and the concrete control surface.
//
// It owns the two things every templated control shares:
//
//   1. THE TEMPLATE MACHINERY — a `Template` DP, the single applied
//      `TemplateInstance`, the root attached as the control's visual
//      child, layout that delegates to that root, GetTemplateChild, and
//      the target / inheritance propagation across the template boundary.
//      Subclasses that need extra slotting around the template (a Content
//      presenter, an items panel) override `rebuildTemplate` and compose
//      the protected primitives below; they do NOT re-declare the
//      `Template` DP or re-implement the lifecycle.
//
//   2. PER-INSTANCE COMMAND + INPUT BINDINGS — lazily allocated, read by
//      CommandManager and the routed-event walker. Plain Visuals
//      (Border / Canvas / panels) take part in routed dispatch but carry
//      no binding tables; only Controls do.
//
// Lives in the `basic/` tier so both basic controls (Slider, SpinEdit,
// ScrollBar via TemplatedControl) and framework controls (ContentControl,
// ItemsControl, Drawer) descend from the one base. Its only framework
// references are the two type-only command-binding imports above, erased
// at runtime — so there is no basic → framework runtime edge.
//
// Subclass contract:
//
//   constructor() {
//       super();
//       this.applyDefaultStyle();   // resolves Style[TargetType=X]
//                                    // → Template DP write
//                                    // → rebuildTemplate() fires
//                                    // → templateInstance ready
//       this._part = this.GetTemplateChild('PART_X') as X;
//   }
export class Control extends Element
{
    public static readonly TemplateKey = Model.RegisterProperty<ControlTemplate | undefined>(
        Control, 'Template', undefined, MetaData.Measure);

    // The single applied template instance (root + content presenter).
    // Protected so a subclass with extra slotting (ItemsControl re-hosts
    // its items panel inside the template's ItemsPresenter) can read /
    // re-point it from an overridden rebuildTemplate; most subclasses go
    // through the protected primitives and never touch it directly.
    protected _templateInstance: TemplateInstance | undefined;

    public get Template(): ControlTemplate | undefined
    {
        return this.get_property_value(Control.TemplateKey);
    }
    public set Template(v: ControlTemplate | undefined)
    {
        this.set_property_value(Control.TemplateKey, v);
    }

    // WPF Control.GetTemplateChild — find a Named visual inside the
    // applied template. Returns undefined when no template is applied or
    // the name doesn't resolve.
    public GetTemplateChild(name: string): Visual | undefined
    {
        return this._templateInstance?.root.FindName(name);
    }

    // The template's root Visual — typically a layout panel the subclass
    // wires its custom layout against. Undefined when no template is
    // applied (a test instance that never had a Style merged).
    protected get templateRoot(): Visual | undefined
    {
        return this._templateInstance?.root;
    }

    // First ContentPresenter found by ControlTemplate.Apply's depth-first
    // walk — the slot a Content-bearing subclass routes consumer content
    // through. Undefined when the template carries no ContentPresenter.
    protected get templateContentPresenter(): ContentPresenter | undefined
    {
        return this._templateInstance?.contentPresenter;
    }

    // ── Template lifecycle primitives ─────────────────────────────────
    //
    // Tear down the current instance: detach the root if it is still our
    // visual child. A templated control may re-parent its root away from
    // itself between Apply and the next rebuild (MenuItem / MenuButton /
    // ContextMenu detach their popup root so the OverlayLayer can adopt
    // it), so the guard avoids detaching a node that is no longer ours.
    protected teardownTemplateInstance(): void
    {
        if (this._templateInstance === undefined) return;
        const root = this._templateInstance.root;
        if (root['_visualParent'] === this) this.DetachVisual(root);
        this._templateInstance = undefined;
    }

    // Materialise a template, attach its root as our visual child, and
    // resolve inherited values across the freshly-stamped boundary so the
    // parts paint correctly on first measure. Returns the instance so an
    // overriding rebuildTemplate can wire up its slot (content presenter,
    // items presenter).
    protected applyTemplateInstance(tpl: ControlTemplate): TemplateInstance
    {
        const instance = tpl.Apply(this);
        this.AttachVisual(instance.root);
        this._templateInstance = instance;
        instance.root['_refresh_inheritance_subtree']();
        return instance;
    }

    // Default rebuild: tear down the old instance and apply the current
    // Template. Subclasses with extra slotting override this and compose
    // the two primitives above around their own carry/re-host logic.
    protected rebuildTemplate(): void
    {
        this.teardownTemplateInstance();
        const tpl = this.Template;
        if (tpl !== undefined) this.applyTemplateInstance(tpl);
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        // Idempotency guard: a theme-default Style re-firing with the same
        // ControlTemplate (BasedOn chains do this) would otherwise re-stamp
        // the tree and invalidate subclass-cached part references.
        if (descriptor.Name === 'Template' && newValue !== oldValue)
        {
            this.rebuildTemplate();
        }
    }

    public override get visualChildren(): readonly Visual[]
    {
        const r = this._templateInstance?.root;
        return r === undefined ? [] : [r];
    }

    protected override propagate_target_to_visual_children(): void
    {
        const r = this._templateInstance?.root;
        if (r !== undefined) (r as unknown as { SetTarget(t: unknown): void }).SetTarget(this['target']);
    }

    // Inheritance into the template subtree is handled generically by
    // Element.forEachInheritanceChild — the template root is our visual
    // child, so the unified cascade reaches it (and every nested templated
    // part) without a per-control bridge.

    protected override MeasureOverride(availableSize: Size): Size
    {
        const r = this._templateInstance?.root;
        if (r === undefined) return Size.Zero;
        r.Measure(availableSize);
        return r.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        const r = this._templateInstance?.root;
        if (r === undefined) return Size.Zero;
        r.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    // No own paint — the template tree paints itself when the renderer
    // walks visualChildren.
    protected override RenderOverride(_dc: DrawingContext): void { }

    // ── Routed-command + input-binding tables ─────────────────────────
    //
    // Per-instance CommandBindings (RoutedCommand identity → Executed /
    // CanExecute handler pair) and InputBindings (KeyBinding / MouseBinding
    // → Command), both lazily allocated. Read by CommandManager (walks the
    // visual tree for a matching CommandBinding) and by the routed-event
    // walker (consults InputBindings during dispatch). The _tryGet*
    // helpers let those hot paths peek without forcing the lazy alloc;
    // both call sites first check `instanceof Control`.
    private _commandBindings: CommandBinding[] | undefined;
    private _inputBindings:   InputBinding[]   | undefined;

    public get CommandBindings(): CommandBinding[]
    {
        if (this._commandBindings === undefined) this._commandBindings = [];
        return this._commandBindings;
    }

    public get InputBindings(): InputBinding[]
    {
        if (this._inputBindings === undefined) this._inputBindings = [];
        return this._inputBindings;
    }

    public _tryGetCommandBindings(): CommandBinding[] | undefined
    {
        return this._commandBindings;
    }

    public _tryGetInputBindings(): InputBinding[] | undefined
    {
        return this._inputBindings;
    }
}
