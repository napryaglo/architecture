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

// Visual subclass that owns a `Template` DP and a single applied
// ControlTemplate instance. The intent mirrors what `ContentControl`
// (in framework/) does for content-bearing controls, but without the
// Content slot — Slider / ScrollBar / SpinEdit have template parts
// (PART_Thumb, PART_Up, …) but no consumer-supplied content. PageView
// extends this too and adds its own Content plumbing.
//
// Subclass contract:
//
//   constructor() {
//       super();
//       this.applyDefaultStyle();           // resolves Style[TargetType=X]
//                                            // → Template DP write
//                                            // → rebuildTemplate() fires
//                                            // → _templateInstance ready
//       this._part = this.GetTemplateChild('PART_X') as X;
//   }
//
// MeasureOverride / ArrangeOverride / RenderOverride / visualChildren
// all default to "delegate to template root" — subclasses only
// override when they need non-template chrome alongside the root
// (none of the current four do).
export class TemplatedControl extends Element
{
    public static readonly TemplateKey = Model.RegisterProperty<ControlTemplate | undefined>(
        TemplatedControl, 'Template', undefined, MetaData.Measure);

    private _templateInstance: TemplateInstance | undefined;

    public get Template(): ControlTemplate | undefined
    {
        return this.get_property_value(TemplatedControl.TemplateKey);
    }
    public set Template(v: ControlTemplate | undefined)
    {
        this.set_property_value(TemplatedControl.TemplateKey, v);
    }

    // WPF Control.GetTemplateChild — find a Named visual inside the
    // applied template. Returns undefined when no template is applied
    // or the name doesn't resolve.
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
    // walk of the freshly-built template — the slot a subclass that has
    // a Content semantic (PageView) routes its consumer-supplied content
    // through. Undefined when the template carries no ContentPresenter.
    protected get templateContentPresenter(): ContentPresenter | undefined
    {
        return this._templateInstance?.contentPresenter;
    }

    // Tear down old instance, materialise new one, attach root as the
    // single visual child. Idempotency guard on identity match — a
    // theme-default Style re-firing with the same ControlTemplate
    // (BasedOn chains do this) would otherwise re-stamp the template
    // tree and invalidate the part references the subclass cached.
    private rebuildTemplate(tpl: ControlTemplate | undefined): void
    {
        if (this._templateInstance !== undefined)
        {
            this.DetachVisual(this._templateInstance.root);
            this._templateInstance = undefined;
        }
        if (tpl !== undefined)
        {
            this._templateInstance = tpl.Apply(this);
            this.AttachVisual(this._templateInstance.root);
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Template' && newValue !== oldValue)
        {
            this.rebuildTemplate(newValue as ControlTemplate | undefined);
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
}
