import {
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../runtime/index.js';
import type { DataTemplate } from './data-template.js';
import { TextBlock } from './text-block.js';

// The visual slot a ControlTemplate uses to host the templated
// control's Content, AND the per-item container the base ItemsControl
// builds for each row. Two modes of use:
//
//   1. ControlTemplate-internal slot (the original role).
//      ContentControl calls SetContent on the presenter found in its
//      applied template, both when Template changes (to install
//      existing Content into the new slot) and when Content changes
//      (to swap the slotted visual). SetContent uses AttachVisual /
//      DetachVisual directly — the logical-tree wiring stays on the
//      ContentControl.
//
//   2. Per-item container in ItemsControl (the new WPF-parity role).
//      ItemsControl.GetContainerForItemOverride builds a
//      ContentPresenter, sets its Content DP to the data item and its
//      ContentTemplate DP to the ItemTemplate. The presenter resolves
//      the template internally (Apply + DataContext = item) and slots
//      the produced Visual. This way each row has a stable outer
//      container even when ItemTemplate changes, matching WPF's
//      "ContentPresenter wraps every item" semantics.
//
// The two-tree split is the headline of either mode: the renderer
// walks visualChildren and sees the presenter's content sitting inside
// the template, while property inheritance walks logicalParent and
// sees it under the control where the consumer authored it.
export class ContentPresenter extends Visual
{
    // Optional consumer-facing DPs that drive the "I host one logical
    // content, possibly via a DataTemplate" path. When either changes
    // the presenter re-resolves and re-slots. Untouched in the
    // SetContent-only path used by ContentControl.
    public static readonly ContentKey         = Model.RegisterProperty<unknown>(              ContentPresenter, 'Content',         undefined, MetaData.Measure);
    public static readonly ContentTemplateKey = Model.RegisterProperty<DataTemplate | undefined>(ContentPresenter, 'ContentTemplate', undefined, MetaData.Measure);

    private _content: Visual | undefined;

    // Visual child = the slotted content, if any. logicalChildren
    // intentionally returns [] — the presenter is just a slot; the
    // logical ownership of the content belongs to the ContentControl
    // above it.
    public override get visualChildren(): readonly Visual[]
    {
        return this._content !== undefined ? [this._content] : [];
    }

    public override get logicalChildren(): readonly Visual[]
    {
        return [];
    }

    // Slot a visual into the presenter as its visual child. Called by
    // ContentControl; not part of the public API (consumers set
    // ContentControl.Content, not ContentPresenter.Content). Passing
    // undefined clears the slot.
    public SetContent(content: Visual | undefined): void
    {
        if (content === this._content) return;
        if (this._content !== undefined)
        {
            this.DetachVisual(this._content);
        }
        this._content = content;
        if (content !== undefined)
        {
            this.AttachVisual(content);
        }
        this.InvalidateMeasure();
    }

    protected override MeasureOverride(availableSize: Size): Size
    {
        if (this._content === undefined) return Size.Zero;
        this._content.Measure(availableSize);
        return this._content.DesiredSize;
    }

    protected override ArrangeOverride(finalSize: Size): Size
    {
        if (this._content !== undefined)
        {
            this._content.Arrange(new Rect(0, 0, finalSize.Width, finalSize.Height));
        }
        return finalSize;
    }

    // RenderOverride deliberately empty — the presenter contributes
    // no paint of its own; the slotted content is rendered by the
    // tree walk reaching it through visualChildren.
    protected override RenderOverride(_dc: DrawingContext): void { }

    // ── Consumer-facing DP surface (per-item / data-bound mode) ─────

    public get Content(): unknown { return this.get_property_value(ContentPresenter.ContentKey); }
    public set Content(v: unknown) { this.set_property_value(ContentPresenter.ContentKey, v); }

    public get ContentTemplate(): DataTemplate | undefined
    {
        return this.get_property_value(ContentPresenter.ContentTemplateKey);
    }

    public set ContentTemplate(v: DataTemplate | undefined)
    {
        this.set_property_value(ContentPresenter.ContentTemplateKey, v);
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        if (descriptor.Name === 'Content' || descriptor.Name === 'ContentTemplate')
        {
            this.resolveAndSlot();
        }
    }

    // Re-pick the visual that should fill the presenter's slot based on
    // current Content + ContentTemplate. Routes through SetContent
    // (the existing imperative attach path) so DOM wiring is unified.
    //
    // Precedence:
    //   1. Content is a Visual         → slot it directly.
    //   2. ContentTemplate + Content   → Apply template, set DataContext.
    //   3. Primitive Content            → stringify into a TextBlock.
    //   4. undefined                    → empty slot.
    private resolveAndSlot(): void
    {
        const content = this.Content;
        if (content instanceof Visual)
        {
            this.SetContent(content);
            return;
        }
        const tmpl = this.ContentTemplate;
        if (tmpl !== undefined && content !== undefined && content !== null)
        {
            const v = tmpl.Apply(content);
            v.DataContext = content;
            this.SetContent(v);
            return;
        }
        if (content !== undefined && content !== null)
        {
            this.SetContent(new TextBlock(String(content)));
            return;
        }
        this.SetContent(undefined);
    }
}
