import {
    MetaData,
    Model,
    Thickness,
    Visual,
    type PropertyDescriptor,
} from '../../runtime/index.js';
import { Color, FontWeight, SolidColorBrush, type Brush } from '../../visual-engine/index.js';
import { Control } from './control.js';
import { findDataTemplateForType } from '../../basic/templates/data-template.js';
import { TextBlock, TextWrapping } from '../../basic/text-block.js';

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

    // Border chrome (WPF Control parity): the default template wraps its
    // ContentPresenter in a Border whose Background / BorderBrush /
    // BorderThickness TemplateBind to the control. `Background` already rides on
    // Visual, so only the two border DPs are declared here — same shape as
    // Border's own. A bare ContentControl leaves them unset (transparent brush,
    // zero thickness → no visible chrome); a consumer sets them to give the
    // content host a background/outline without a bespoke template.
    public static readonly BorderBrushKey = Model.RegisterProperty<Brush | undefined>(
        ContentControl, 'BorderBrush', undefined, MetaData.Render);

    public static readonly BorderThicknessKey = Model.RegisterProperty<Thickness>(
        ContentControl, 'BorderThickness', Thickness.Zero,
        MetaData.Measure | MetaData.Arrange | MetaData.Render);

    // Reuse the view built for a content object instead of rebuilding it every
    // time that object is presented. DEFAULT ON — the inverse of
    // ContentPresenter (which defaults OFF because it is the recycled
    // ItemsControl item container, where per-object caching would accumulate a
    // view per row). A ContentControl hosts ONE content at a time from a small,
    // stable set (the shell's capability side pane bound to the nav service's
    // ActiveService; a document tab body), so re-presentation is a navigation
    // "back", not row recycling: handing back the same view preserves its in-view
    // state (tree expansion, scroll, unsaved textbox edits) AND skips the rebuild
    // of a heavy view (Project Explorer et al. rebuilt on every rail switch).
    // Set false for strict WPF rebuild-on-reset semantics.
    public static readonly ReuseContentViewsKey = Model.RegisterProperty<boolean>(
        ContentControl, 'ReuseContentViews', true, MetaData.None);

    public get ReuseContentViews(): boolean { return this.get_property_value(ContentControl.ReuseContentViewsKey); }
    public set ReuseContentViews(v: boolean) { this.set_property_value(ContentControl.ReuseContentViewsKey, v); }

    public get BorderBrush(): Brush | undefined  { return this.get_property_value(ContentControl.BorderBrushKey); }
    public set BorderBrush(v: Brush | undefined) { this.set_property_value(ContentControl.BorderBrushKey, v); }

    public get BorderThickness(): Thickness  { return this.get_property_value(ContentControl.BorderThicknessKey); }
    public set BorderThickness(v: Thickness) { this.set_property_value(ContentControl.BorderThicknessKey, v); }

    // The Visual currently slotted into the presenter. Distinct from
    // Content because Content may be a non-Visual Model — in that case a
    // DataTemplate is auto-resolved by data type and applied to produce a
    // Visual which is the one actually slotted. Tracked separately so
    // Content-change / Template-change paths detach it cleanly without
    // touching the data Model.
    private _resolvedContent: Visual | undefined;

    // Per-content view cache, honoured when ReuseContentViews is on (the
    // default). WeakMap so a dropped content object's view is collected with it;
    // it survives a Content clear because applyContent unslots the view but the
    // map keeps it alive while the content object is still referenced (the nav
    // service / tab list holds it), so the next presentation returns the SAME
    // view — same rationale + shape as ContentPresenter._viewCache.
    private readonly _viewCache = new WeakMap<object, Visual>();

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
            // A Visual bound as Content may be SHARED and still logically
            // parented to a now-discarded prior view (e.g. a
            // shared toolbox preview Visual bound into a palette tile whose view
            // a capability switch tore down, then re-presented on switch-back).
            // Claim it — release from the stale parent — instead of tripping the
            // single-parent guard in AttachLogical.
            newValue._release_from_logical_parent();
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
        if (value === undefined || value === null) return undefined;
        if (value instanceof Visual) return value;
        // Non-Visual Model — auto-resolve a DataTemplate by class identity
        // (DataType === value.constructor).
        const template = findDataTemplateForType(value.constructor, this);
        if (template !== undefined)
        {
            // Reuse this object's existing view when opted in (the default) —
            // re-presenting the same content (a nav-rail switch back, a tab
            // re-activation) returns its one view with its state intact rather
            // than rebuilding. value is a non-Visual, non-null Model here, so it
            // is always an object we can weak-key.
            if (this.ReuseContentViews)
            {
                const cached = this._viewCache.get(value as object);
                if (cached !== undefined) return cached;
            }
            const visual = template.Apply(value);
            visual.DataContext = value;
            if (this.ReuseContentViews) this._viewCache.set(value as object, visual);
            // Optional VM hook: when the data exposes an `OnViewMounted`
            // function, hand the freshly-built visual to it so VM-driven
            // imperative setup can run once per resolution — on the BUILD only,
            // not on a cache-hit re-presentation (the reuse short-circuits above).
            const hook = (value as { OnViewMounted?: (v: Visual) => void }).OnViewMounted;
            if (typeof hook === 'function') hook.call(value, visual);
            return visual;
        }
        // Primitive content (string / number / boolean) — stringify into a
        // wrapping TextBlock, mirroring ContentPresenter's own auto-stringify
        // fallback. Without this a ContentControl handed a bare string (the
        // ToolTipService path, `Tooltip.Content = "long text"`) slotted
        // NOTHING — resolveContentVisual returned undefined for non-Visual,
        // non-templated values, so the text never rendered (and, when it did
        // via a workaround binding, didn't wrap). Wrap by default so
        // paragraph-shaped strings reflow within the control's width (e.g.
        // the tooltip's MaxWidth) instead of running off in one line.
        if (typeof value !== 'object')
        {
            const tb = new TextBlock(String(value));
            tb.TextWrapping = TextWrapping.Wrap;
            return tb;
        }
        // An object Model with no matching DataTemplate: don't render
        // NOTHING — a silently-empty presenter is the most confusing
        // failure mode ("why is my content blank?"). Surface it loudly as a
        // big red diagnostic naming the exact type whose DataTemplate is
        // missing, so the author knows precisely what to register.
        return this.unresolvedTemplateError(value);
    }

    // Big red diagnostic Visual for the "no DataTemplate for this type"
    // case. Names the runtime type identifier so the author can see which
    // DataType to add to a resource dictionary.
    private unresolvedTemplateError(value: object): TextBlock
    {
        const typeName = value.constructor?.name || typeof value;
        const tb = new TextBlock(`can not resolve template for: ${typeName}`);
        tb.Foreground   = new SolidColorBrush(Color.Red);
        tb.FontSize     = 20;
        tb.FontWeight   = FontWeight.Bold;
        tb.TextWrapping = TextWrapping.Wrap;
        return tb;
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
