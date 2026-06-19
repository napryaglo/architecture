import {
    DynamicResource,
    MetaData,
    Model,
    Thickness,
    Visual,
    type PropertyDescriptor,
} from '../runtime/index.js';
import { resolveKey } from '../runtime/model-internals.js';
import type { ContentPresenter } from './templates/content-presenter.js';
import { findDataTemplateForType } from './templates/data-template.js';
import { StackPanel } from './panels/stack-panel.js';
import { TemplatedControl } from './templated-control.js';
import { TextBlock } from './text-block.js';

// A title strip + slottable content area, modelled on Material UI's
// "page" pattern: bold title with optional subtitle, a 1-DIP divider,
// then the consumer-supplied Content filling the rest of the slot.
//
// DPs:
//   Title    — top-row bold heading. Empty string renders an empty
//              row (caller can hide PageView entirely if Title is
//              meaningless).
//   Subtitle — dim second row, omitted from layout when empty.
//   Content  — the swappable body. Setter handles AttachLogical /
//              DetachLogical the same way ContentControl does so
//              DataContext flows from the PageView's parent into the
//              demo body the way the consumer authored it.
//
// Layout — DockPanel internally: header strip docks Top, then a 1-DIP
// divider docks Top, then the content presenter takes the remaining
// area via LastChildFill. This means PageView automatically grows
// Content to fill whatever rectangle its host arranged it into.
export class PageView extends TemplatedControl
{
    public static readonly TitleKey    = Model.RegisterProperty<string>(                 PageView, 'Title',    '',        MetaData.Render);
    public static readonly SubtitleKey = Model.RegisterProperty<string>(                 PageView, 'Subtitle', '',        MetaData.Measure | MetaData.Render);
    public static readonly ContentKey  = Model.RegisterProperty<Visual | Model | undefined>(PageView, 'Content',  undefined, MetaData.Measure);

    static {
        Model.OverrideMetadata(PageView, Visual.DefaultStyleKeyKey, { default_value: PageView });
    }

    // Template parts — resolved from the compiled `page-view.template.mu`
    // after Apply. Only `_subtitleText` is built in code: PageView
    // toggles its membership in PART_HeaderStack based on the Subtitle
    // DP, so it can't live in the static markup tree.
    private readonly _headerStack:      StackPanel;
    private readonly _titleText:        TextBlock;
    private readonly _subtitleText:     TextBlock;
    private readonly _contentPresenter: ContentPresenter;

    constructor()
    {
        super();

        // applyDefaultStyle resolves Style[TargetType=PageView] from the
        // active theme dictionary → writes Template DP → TemplatedControl's
        // rebuildTemplate materialises @DefaultPageView (Dock + Header +
        // Divider + ContentHost) and attaches root.
        this.applyDefaultStyle();
        this._headerStack = this.GetTemplateChild('PART_HeaderStack') as StackPanel;
        this._titleText   = this.GetTemplateChild('PART_TitleText')   as TextBlock;
        // The Content presenter lives in PART_ContentHost — found via
        // ControlTemplate.Apply's first-presenter walk (it's the only
        // ContentPresenter in the template tree).
        this._contentPresenter = this.templateContentPresenter!;

        // Subtitle is created here (not in markup) because it gets
        // added to / removed from the header stack on demand.
        this._subtitleText = new TextBlock('');
        // Subtitle TextBlock is created dynamically (added to
        // PART_HeaderStack only when Subtitle is non-empty) so it
        // can't live in the static markup template. Bind Foreground
        // to @OnSurfaceVariant via DynamicResource so theme switches
        // re-tint the medium-emphasis label live — same effect a
        // template setter would have if Subtitle lived in markup.
        // Resolved-key path so the value-type slot accepts a Binding
        // (the typed `TextBlock.ForegroundKey` rejects non-Brush
        // values at compile time).
        this._subtitleText.set_property_value(
            resolveKey(this._subtitleText, undefined, 'Foreground'),
            DynamicResource(this._subtitleText, 'OnSurfaceVariant'),
        );
        this._subtitleText.FontSize   = 13;
        this._subtitleText.Margin     = new Thickness(0, 2, 0, 0);
    }

    public get Title():    string { return this.get_property_value(PageView.TitleKey); }
    public set Title(v:    string) { this.set_property_value(PageView.TitleKey, v); }

    public get Subtitle(): string { return this.get_property_value(PageView.SubtitleKey); }
    public set Subtitle(v: string) { this.set_property_value(PageView.SubtitleKey, v); }

    // Tracks the Visual actually inside the ContentPresenter. When
    // Content is itself a Visual, _resolvedContent === Content. When
    // Content is a non-Visual Model, _resolvedContent is the visual
    // produced by applying the matching DataTemplate.
    private _resolvedContent: Visual | undefined;

    public get Content(): Visual | Model | undefined { return this.get_property_value(PageView.ContentKey); }
    public set Content(value: Visual | Model | undefined)
    {
        // Side-effect (presenter swap + DataTemplate resolution) is
        // dispatched from OnPropertyChanged so that binding pushes
        // (which bypass JS setters via set_property_value) produce the
        // same behavior as direct assignment.
        this.set_property_value(PageView.ContentKey, value);
    }

    private applyContent(oldValue: Visual | Model | undefined, newValue: Visual | Model | undefined): void
    {
        // Unslot the currently-presented visual (the template-resolved
        // one when prior Content was a Model) before detaching the OLD
        // logical Content.
        if (this._resolvedContent !== undefined)
        {
            this._contentPresenter.SetContent(undefined);
        }
        this._resolvedContent = undefined;

        if (oldValue instanceof Visual)
        {
            this.DetachLogical(oldValue);
        }

        if (newValue instanceof Visual)
        {
            this.AttachLogical(newValue);
            this._resolvedContent = newValue;
        }
        else if (newValue instanceof Model)
        {
            // Auto-resolve a DataTemplate by class identity. The produced
            // Visual hosts the data through its DataContext so
            // $-bindings inside the template resolve naturally.
            const tpl = findDataTemplateForType(newValue.constructor);
            if (tpl !== undefined)
            {
                const v = tpl.Apply(newValue);
                v.DataContext = newValue;
                // Optional VM hook: when the data exposes an
                // `OnViewMounted` function, hand the freshly-built
                // visual to it so VM-driven imperative setup
                // (FindName, click handlers, animation wiring) can run
                // once per resolution.
                const hook = (newValue as unknown as { OnViewMounted?: (v: Visual) => void }).OnViewMounted;
                if (typeof hook === 'function') hook.call(newValue, v);
                this._resolvedContent = v;
            }
        }

        if (this._resolvedContent !== undefined)
        {
            this._contentPresenter.SetContent(this._resolvedContent);
        }
    }

    // visualChildren / propagate_target_to_visual_children /
    // MeasureOverride / ArrangeOverride / RenderOverride all inherited
    // from TemplatedControl — they delegate to templateRoot (the
    // DockPanel the default template produced).
    public override get logicalChildren(): readonly Visual[]
    {
        const c = this.Content;
        return c instanceof Visual ? [c] : [];
    }

    protected override propagate_inheritance_to_logical_children(): void
    {
        const c = this.Content;
        if (c instanceof Visual) c['refresh_inheritance_subtree']();
    }

    protected override propagate_inheritance_for_logical_children(d: PropertyDescriptor): void
    {
        const c = this.Content;
        if (c instanceof Visual) c['refresh_inherited'](d);
    }

    protected override OnPropertyChanged(
        descriptor: PropertyDescriptor,
        oldValue: unknown,
        newValue: unknown,
    ): void
    {
        super.OnPropertyChanged(descriptor, oldValue, newValue);
        switch (descriptor.Name)
        {
            case 'Title':
                this._titleText.Text = String(newValue ?? '');
                break;
            case 'Subtitle':
                this._subtitleText.Text = String(newValue ?? '');
                this.refreshSubtitleSlot();
                break;
            case 'Content':
                this.applyContent(
                    oldValue as Visual | Model | undefined,
                    newValue as Visual | Model | undefined,
                );
                break;
        }
    }

    // Subtitle is in the header stack only when its text is non-empty
    // so a page without a subtitle doesn't pad an extra row. Re-runs
    // on every Subtitle write — cheap idempotent attach/detach.
    private refreshSubtitleSlot(): void
    {
        const has = (this.Subtitle ?? '').length > 0;
        const attached = this._headerStack.visualChildren.includes(this._subtitleText);
        if (has && !attached)
        {
            this._headerStack.AddChild(this._subtitleText);
            this._headerStack.InvalidateMeasure();
        }
        else if (!has && attached)
        {
            this._headerStack.RemoveChild(this._subtitleText);
            this._headerStack.InvalidateMeasure();
        }
    }

}
