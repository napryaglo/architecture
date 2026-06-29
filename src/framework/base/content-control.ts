import {
    MetaData,
    Model,
    Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Control } from './control.js';
import { findDataTemplateForType } from '../../basic/templates/data-template.js';

// Base class for controls that present a single piece of consumer-
// supplied content inside a ControlTemplate-defined visual structure.
// Mirrors WPF's ContentControl — the underpinning of Button, Label,
// ToolTip, Window, and friends.
//
// All template machinery — the `Template` DP, the applied instance,
// layout delegation, GetTemplateChild, target / inheritance propagation —
// lives on `Control`. ContentControl adds ONLY the Content slot:
//
//   * Content   — consumer-supplied. Logical child of this control. Its
//                 visual parent ends up being the ContentPresenter inside
//                 the template (when one exists).
//
// The two-tree split shows up here: Content is a logical child, while the
// template's root (owned by Control) is the visual child. Without a
// Template the control has no visual children — it renders nothing even
// if Content is set (WPF behavior: a template-less ContentControl is a
// logical-only container).
export class ContentControl extends Control
{
    public static readonly ContentKey = Model.RegisterProperty<Visual | Model | undefined>(
        ContentControl, 'Content', undefined, MetaData.Measure);

    // The Visual currently slotted into the presenter. Distinct from
    // Content because Content may be a non-Visual Model — in that case a
    // DataTemplate is auto-resolved by data type and applied to produce a
    // Visual which is the one actually slotted. Tracked separately so
    // Content-change / Template-change paths detach it cleanly without
    // touching the data Model.
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
    //   * Model     — looked up via resources for a DataTemplate whose
    //                 DataType matches the Model's constructor. The
    //                 template is applied, the produced Visual's
    //                 DataContext is set to the Model, and that Visual is
    //                 slotted. The Model itself is NOT a logical child
    //                 (Models aren't Visuals); $-bindings inside the
    //                 template see the Model via the generated Visual's
    //                 DataContext.
    public set Content(value: Visual | Model | undefined)
    {
        // Side-effect dispatched from OnPropertyChanged so binding pushes
        // (which bypass JS setters) behave like direct assignment.
        this.set_property_value(ContentControl.ContentKey, value);
    }

    private applyContent(oldValue: Visual | Model | undefined, newValue: Visual | Model | undefined): void
    {
        const presenter = this.templateContentPresenter;

        // Unslot the visual that was actually in the presenter — could be
        // the old Content (when Visual) or a template-generated visual
        // (when Model).
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
    // presenter. Returns the Visual directly when Content is already one;
    // otherwise finds a DataTemplate matching the Model's runtime type,
    // applies it, and sets the result's DataContext so $-bindings inside
    // the template resolve against the data.
    private resolveContentVisual(value: Visual | Model | undefined): Visual | undefined
    {
        if (value === undefined) return undefined;
        if (value instanceof Visual) return value;
        // Non-Visual Model — auto-resolve a DataTemplate by class identity
        // (DataType === value.constructor).
        const template = findDataTemplateForType(value.constructor);
        if (template === undefined) return undefined;
        const visual = template.Apply(value);
        visual.DataContext = value;
        // Optional VM hook: when the data exposes an `OnViewMounted`
        // function, hand the freshly-built visual to it so VM-driven
        // imperative setup can run once per resolution.
        const hook = (value as { OnViewMounted?: (v: Visual) => void }).OnViewMounted;
        if (typeof hook === 'function') hook.call(value, visual);
        return visual;
    }

    // Logical child = the Visual Content (when set). A non-Visual Model
    // Content is NOT a logical child — its visual stand-in lives visually
    // under the presenter via _resolvedContent and sees the Model through
    // DataContext, not via the logical chain.
    public override get logicalChildren(): readonly Visual[]
    {
        const c = this.Content;
        return c instanceof Visual ? [c] : [];
    }

    // Inheritance into both the Content slot (a logical child) and the
    // template root (a visual child, owned by Control) is handled
    // generically by Element.forEachInheritanceChild — no per-control
    // bridge.

    // Carry the resolved content across a Template swap so the logical
    // Content survives intact: unslot it from the old presenter BEFORE the
    // base tears the old root down (otherwise DetachVisual would refuse to
    // detach a root with a descendant that has a foreign visual parent),
    // let Control rebuild, then re-slot into the new presenter.
    protected override rebuildTemplate(): void
    {
        const carried = this._resolvedContent;
        const oldPresenter = this.templateContentPresenter;
        if (oldPresenter !== undefined && carried !== undefined)
        {
            oldPresenter.SetContent(undefined);
        }

        super.rebuildTemplate();

        if (carried !== undefined && this.templateContentPresenter !== undefined)
        {
            this.templateContentPresenter.SetContent(carried);
        }
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        // super handles the Template descriptor (rebuildTemplate).
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Content')
        {
            this.applyContent(
                oldValue as Visual | Model | undefined,
                newValue as Visual | Model | undefined,
            );
        }
    }
}
