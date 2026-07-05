import {
    Element,
    MetaData,
    Model,
    Rect,
    Size,
    Visual,
    type DrawingContext,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { findDataTemplateForType, type DataTemplate } from './data-template.js';
import { TextBlock, TextWrapping } from '../text-block.js';

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
export class ContentPresenter extends Element
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
            // The slotted Visual may be SHARED and still visually parented to a
            // now-discarded prior view (see ContentControl.applyContent). Claim it
            // from that stale parent before attaching, so re-presenting a shared
            // Visual doesn't trip AttachVisual's single-parent guard.
            content._release_from_visual_parent();
            this.AttachVisual(content);
            // Pick up values inherited through the VISUAL tree (e.g. a
            // host ControlTemplate's `TextBlock.Foreground` on a
            // PART_Border) the moment the content is slotted — the
            // content hangs off us visually but off the ContentControl
            // logically, so the logical inheritance refresh alone leaves
            // template-set styling unresolved. Paired with
            // Element.walk_inherited's visual-tree fallback.
            content._refresh_inheritance_subtree();
        }
        this.InvalidateMeasure();
    }

    // The slotted content is our VISUAL child (visualChildren = [_content]),
    // so Element.forEachInheritanceChild reaches it generically — values
    // set inside the host ControlTemplate stay reactive on the content
    // with no per-presenter bridge.

    // Cascade host (`target`) to the slotted content. ContentPresenter's
    // _content is its only visual child, but Visual's default
    // propagate_target_to_visual_children is a no-op (Single / Panel
    // override it). Without this override, a presenter that received its
    // Content BEFORE its own target was set (e.g. SCP inside
    // ScrollViewer's template — Content is assigned by the OUTER template
    // factory at construction time, but `target` doesn't arrive until
    // the containing target's Content setter cascades down later) would
    // never propagate target to its child, leaving the slotted Visual
    // unable to InvalidateVisual / register routed-event listeners.
    protected override propagate_target_to_visual_children(): void
    {
        this._content?.['SetTarget'](this['target']);
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
    //   1. Content is a Visual                       → slot it directly.
    //   2. ContentTemplate + Content                 → Apply explicit template, set DataContext.
    //   3. Content is a Model with a matching        → Apply the implicit-by-DataType template
    //      DataTemplate in the resource chain          via findDataTemplateForType.
    //   4. Primitive Content (or unmatched Model)    → stringify into a TextBlock.
    //   5. undefined                                  → empty slot.
    private resolveAndSlot(): void
    {
        const content = this.Content;
        if (content instanceof Visual)
        {
            this.SetContent(content);
            return;
        }
        // Explicit ContentTemplate beats implicit lookup, matching how
        // ItemsControl prefers ItemTemplate(Selector) over the global
        // DataType-keyed registry.
        let tmpl = this.ContentTemplate;
        if (tmpl === undefined && content !== undefined && content !== null
            && typeof content === 'object')
        {
            // Implicit DataTemplate resolution by Function-identity match.
            // Lets a `DataTemplate [DataType=NodeVM]` in app OR local (ancestor)
            // resources auto-apply to any NodeVM slotted here without an
            // explicit ItemTemplate / ContentTemplate reference. Resolved from
            // this presenter's scope, so nearer dictionaries win. Closes the
            // gap that made an `ItemsControl[ItemsSource=$Edges]` with no
            // explicit template fall through to text-stringify.
            tmpl = findDataTemplateForType((content as object).constructor, this);
        }
        if (tmpl !== undefined && content !== undefined && content !== null)
        {
            // Set DataContext on the presenter itself so bindings
            // attached to the presenter — including those produced by
            // ItemContainerStyle setters in an ItemsControl wrap path
            // (Canvas.Left={$X} etc.) — resolve against the item.
            // Inheritance then carries the same DataContext down to
            // the produced template subtree, so `v.DataContext = content`
            // is redundant but kept for the case where v is a Visual
            // that was constructed with bindings already resolved
            // before reparenting.
            this.DataContext = content;
            const v = tmpl.Apply(content);
            v.DataContext = content;
            this.SetContent(v);
            return;
        }
        if (content !== undefined && content !== null)
        {
            // Auto-stringify fallback. Wrap by default — tooltips,
            // ListBox items, and other ContentControl consumers commonly
            // receive paragraph-shaped strings and a single-line
            // overflow is almost never what callers want. Hosts that
            // want single-line truncation set their own TextBlock as
            // Content with TextWrapping=NoWrap explicit.
            const tb = new TextBlock(String(content));
            tb.TextWrapping = TextWrapping.Wrap;
            this.SetContent(tb);
            return;
        }
        this.SetContent(undefined);
    }
}
