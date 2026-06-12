import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { Control } from './control.js';
import { ControlTemplate, type TemplateInstance } from '../basic/templates/control-template.js';
import { findDataTemplateForType } from '../basic/templates/data-template.js';

// Base class for controls that present a single piece of consumer-
// supplied content inside a ControlTemplate-defined visual structure.
// Mirrors WPF's ContentControl — the underpinning of Button, Label,
// ToolTip, Window, and friends.
//
// The two-tree split shows up here for the first time:
//
//   * Content     — consumer-supplied. Logical child of this control.
//                   Visual parent ends up being the ContentPresenter
//                   inside the template (when one exists).
//   * Template    — applies a ControlTemplate that constructs the
//                   visual structure (Border, decorations, layout
//                   panels, …). The template's root becomes this
//                   control's visual child; the template's
//                   ContentPresenter receives the slotted Content.
//
// MeasureOverride / ArrangeOverride delegate to the template root —
// the control itself has no intrinsic layout, the template defines it.
// Render is a no-op; the template tree paints itself when the
// renderer walks visualChildren.
//
// Without a Template, the control has no visual children — it renders
// nothing, even if Content is set. This is the WPF behavior (a
// ContentControl with no template is a logical-only container).
export class ContentControl extends Control
{
    public static readonly ContentKey  = Model.RegisterProperty<Visual | Model | undefined>(    ContentControl, 'Content',  undefined, MetaData.Measure);
    public static readonly TemplateKey = Model.RegisterProperty<ControlTemplate | undefined>(   ContentControl, 'Template', undefined, MetaData.Measure);

    // The current applied template instance (root + presenter). When
    // Template changes, the old instance is torn down and a new one
    // built. undefined when Template is undefined.
    private _templateInstance: TemplateInstance | undefined;

    // The Visual currently slotted into the presenter. Distinct from
    // Content because Content may be a non-Visual Model — in that case
    // a DataTemplate is auto-resolved by data type and applied to
    // produce a Visual which is the one actually slotted. Tracked
    // separately so Content-change / Template-change paths can detach
    // it cleanly without touching the data Model.
    private _resolvedContent: Visual | undefined;

    public get Content(): Visual | Model | undefined
    {
        return this.get_property_value(ContentControl.ContentKey);
    }

    // Setter accepts a Visual OR a plain Model:
    //
    //   * Visual    — slotted directly into the presenter as the
    //                 ContentPresenter's visualChild. Logical parent =
    //                 this ContentControl.
    //   * Model     — looked up via Application resources for a
    //                 DataTemplate whose DataType matches the Model's
    //                 constructor name. The template is applied, the
    //                 produced Visual's DataContext is set to the
    //                 Model, and that Visual is slotted. The Model
    //                 itself is NOT a logical child (Models aren't
    //                 Visuals); $-bindings inside the template see
    //                 the Model via the generated Visual's DataContext.
    //
    // Order: visually unslot the old resolved content first, then
    // logically detach the old (Visual) Content, then logically attach
    // the new (Visual) Content, then resolve + slot the new visual.
    public set Content(value: Visual | Model | undefined)
    {
        // Side-effect dispatched from OnPropertyChanged so that binding
        // pushes (which bypass JS setters) produce the same behavior
        // as direct assignment.
        this.set_property_value(ContentControl.ContentKey, value);
    }

    private applyContent(oldValue: Visual | Model | undefined, newValue: Visual | Model | undefined): void
    {
        const presenter = this._templateInstance?.contentPresenter;

        // Unslot the visual that was actually in the presenter — could
        // be the old Content (when Visual) or a template-generated
        // visual (when Model).
        if (this._resolvedContent !== undefined && presenter !== undefined)
        {
            presenter.SetContent(undefined);
        }
        this._resolvedContent = undefined;

        if (oldValue instanceof Visual)
        {
            this.DetachLogical(oldValue);
        }

        if (newValue instanceof Visual)
        {
            this.AttachLogical(newValue);
        }

        this._resolvedContent = this.resolveContentVisual(newValue);
        if (this._resolvedContent !== undefined && presenter !== undefined)
        {
            presenter.SetContent(this._resolvedContent);
        }
    }

    // Bridges a Content value to the Visual that should sit in the
    // presenter. Returns the Visual directly when Content is already
    // one; otherwise finds a DataTemplate matching the Model's runtime
    // type via Application resources, applies it, and sets the result's
    // DataContext so $-bindings inside the template resolve against
    // the data.
    private resolveContentVisual(value: Visual | Model | undefined): Visual | undefined
    {
        if (value === undefined) return undefined;
        if (value instanceof Visual) return value;
        // Non-Visual Model — auto-resolve a DataTemplate by class
        // identity (DataType === value.constructor).
        const template = findDataTemplateForType(value.constructor);
        if (template === undefined) return undefined;
        const visual = template.Apply(value);
        visual.DataContext = value;
        // Optional VM hook: when the data exposes an `OnViewMounted`
        // function, hand the freshly-built visual to it so VM-driven
        // imperative setup (FindName lookups, click handlers, animation
        // wiring) can run once per resolution.
        const hook = (value as { OnViewMounted?: (v: Visual) => void }).OnViewMounted;
        if (typeof hook === 'function') hook.call(value, visual);
        return visual;
    }

    public get Template(): ControlTemplate | undefined
    {
        return this.get_property_value(ContentControl.TemplateKey);
    }

    public set Template(value: ControlTemplate | undefined)
    {
        // No explicit rebuildTemplate call here — set_property_value
        // routes through OnPropertyChanged, which catches the
        // 'Template' descriptor and runs rebuildTemplate. Same
        // pipeline as Style.apply_setter writes, so direct assignment
        // and Style-driven assignment behave identically.
        this.set_property_value(ContentControl.TemplateKey, value);
    }

    // Visual child = the template's root (when applied). Empty when
    // Template is unset — no visual surface to render.
    public override get visualChildren(): readonly Visual[]
    {
        return this._templateInstance !== undefined
            ? [this._templateInstance.root]
            : [];
    }

    // Logical child = the Visual Content (when set). A non-Visual
    // Model Content is NOT a logical child — its visual stand-in lives
    // visually under the presenter via _resolvedContent and sees the
    // Model through DataContext, not via the logical chain.
    public override get logicalChildren(): readonly Visual[]
    {
        const c = this.Content;
        return c instanceof Visual ? [c] : [];
    }

    // Inheritance propagation: refresh the Content slot AND the
    // template-internal subtree. The template root isn't a logical
    // child of this control (its logicalParent stays undefined), but
    // its walk_inherited falls through templatedParent → us, so it
    // needs to know about value changes too. Pushing the refresh into
    // its subtree triggers per-node refresh_inherited, which re-reads
    // through the templatedParent fallback.
    protected override propagate_inheritance_to_logical_children(): void
    {
        const c = this.Content;
        if (c instanceof Visual) c['refresh_inheritance_subtree']();
        this._templateInstance?.root['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(descriptor: PropertyDescriptor): void
    {
        const c = this.Content;
        if (c instanceof Visual) c['refresh_inherited'](descriptor);
        this._templateInstance?.root['refresh_inherited'](descriptor);
    }

    // Target propagation rides the VISUAL tree, so it cascades through
    // the template root (which is the control's visual child after
    // Apply). Without this override, mounting a ContentControl whose
    // Template was set BEFORE attach would leave the template subtree
    // host-less. (The reverse order — mount first, then set Template —
    // works through AttachVisual's per-call target seeding.)
    protected override propagate_target_to_visual_children(): void
    {
        this._templateInstance?.root['SetTarget'](this['target']);
    }

    // Tear down the previous template (if any) and apply the new one.
    // Re-slots the resolved Content (Visual directly, or template-
    // generated Visual for a Model Content) into the new template's
    // presenter so the logical Content survives a Template swap intact.
    private rebuildTemplate(newTemplate: ControlTemplate | undefined): void
    {
        const carriedResolved = this._resolvedContent;

        if (this._templateInstance !== undefined)
        {
            const oldPresenter = this._templateInstance.contentPresenter;
            if (oldPresenter !== undefined && carriedResolved !== undefined)
            {
                // Unslot the carried resolved visual before tearing
                // down the old template tree — otherwise DetachVisual
                // on the template root would refuse to detach a node
                // that has descendants with foreign visual parents.
                oldPresenter.SetContent(undefined);
            }
            this.DetachVisual(this._templateInstance.root);
            this._templateInstance = undefined;
        }

        if (newTemplate === undefined) return;

        const instance = newTemplate.Apply(this);
        this.AttachVisual(instance.root);
        this._templateInstance = instance;
        instance.root['refresh_inheritance_subtree']();

        if (carriedResolved !== undefined && instance.contentPresenter !== undefined)
        {
            instance.contentPresenter.SetContent(carriedResolved);
        }
    }

    // Looks up a Visual by Name within the applied template's
    // NameScope — the WPF Control.GetTemplateChild equivalent.
    // Returns undefined when no template is applied, or when the
    // template doesn't contain a Visual with that Name. Consumers
    // typically use this to grab a template part (e.g.,
    // "PART_Background") and wire behavior to it after the template
    // has been applied.
    public GetTemplateChild(name: string): Visual | undefined
    {
        return this._templateInstance?.root.FindName(name);
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        if (this._templateInstance === undefined) return Size.Zero;
        this._templateInstance.root.Measure(availableSize);
        return this._templateInstance.root.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._templateInstance === undefined) return Size.Zero;
        this._templateInstance.root.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        return finalSize;
    }

    // No own paint — the template tree paints itself when the renderer
    // walks visualChildren.
    protected override RenderOverride(_dc: DrawingContext): void { }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Content')
        {
            this.applyContent(
                oldValue as Visual | Model | undefined,
                newValue as Visual | Model | undefined,
            );
        }
        else if (descriptor.Name === 'Template')
        {
            // Template writes routed through `set_property_value`
            // (Style.apply_setter, binding push, OverrideMetadata-default
            // settle) bypass the JS Template setter at line ~145, so
            // rebuildTemplate has to fire here to keep both paths in
            // lock-step. Without this hook, applyDefaultStyle would set
            // the Template DP value but never tear down the old template
            // or attach the new one, leaving visualChildren empty.
            //
            // Idempotency guard: when an ItemContainerStyle (or any
            // user Style) chains BasedOn → theme default, the theme's
            // Template setter re-fires on every Style apply with the
            // same ControlTemplate instance. Without the identity
            // check, rebuildTemplate tears down the live template tree
            // and re-materialises it — invalidating subclass-cached
            // template-part references (TreeViewItem._label etc.) and
            // breaking any wiring done in the constructor.
            if (newValue === oldValue) return;
            this.rebuildTemplate(newValue as ControlTemplate | undefined);
        }
    }
}

