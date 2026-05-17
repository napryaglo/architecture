import { Rect, Size, Visual, type DrawingContext } from '../runtime/index.js';

// The visual slot a ControlTemplate uses to host the templated
// control's Content. ContentPresenter is itself a Visual — it lives
// in the visual tree as a descendant of the template root — but the
// content it presents has its LOGICAL parent set to the templated
// control, not to the presenter. That divergence is the whole point
// of the two-tree split: the renderer walks visualChildren and sees
// the presenter's content sitting inside the template, while
// property inheritance walks logicalParent and sees it under the
// control where the consumer authored it.
//
// Lifecycle: ContentControl calls SetContent on the presenter found
// in its applied template, both when Template changes (to install
// existing Content into the new slot) and when Content changes (to
// swap the slotted visual). SetContent uses AttachVisual /
// DetachVisual directly — the logical-tree wiring stays on the
// ContentControl.
export class ContentPresenter extends Visual
{
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
}
