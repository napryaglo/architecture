import { MetaData, Model, Element, Visual } from '../../runtime/index.js';
import { HeaderedContentControl } from '../base/headered-content-control.js';
import { Selector } from '../list/selector.js';

// M3 Tabs — horizontal header strip with mutually-exclusive selection.
//
// TabControl is the container; TabItem is each header+content pair. The
// chrome lives in framework.resources.mu — TabControl's template hosts
// a header strip (an ItemsPresenter populated with each TabItem's
// header surface) above a content area (a ContentPresenter bound to
// the selected item's Content). TabItem provides the headline string
// (Header) and the slotted Content. Selection rides Selector's
// existing SelectedIndex / SelectedItem surface (BindsTwoWayByDefault
// from Phase 6 — `SelectedItem=$VmField` flows user clicks back to
// the VM without an explicit Mode=TwoWay).
//
// Primary vs Secondary tabs (M3 spec) are not split out as variants
// here — both are 48dp-tall horizontal strips; the M3 spec difference
// (Primary tabs sit at the top of a top-app-bar surface; Secondary sit
// inside content) is positional, not visual. A consumer can re-template
// for either context without subclassing.
export class TabControl extends Selector
{
    static {
        Model.OverrideMetadata(
            TabControl, Element.DefaultStyleKeyKey,
            { default_value: TabControl });
    }

    // The body of the currently-selected tab — what the content area
    // (PART_ContentSlot) presents. Normalises the two authoring paths so the
    // content presenter binds ONE thing:
    //   * data path (ItemsSource) — SelectedItem is the data row (its Tag),
    //     so the body IS that row, dispatched through its DataTemplate.
    //   * composed markup — SelectedItem is the selected TabItem, so the body
    //     is that TabItem's Content.
    // Read-only to consumers; the control maintains it on every selection
    // change (see updateSelectedContent).
    public static readonly SelectedContentKey = Model.RegisterProperty<unknown>(
        TabControl, 'SelectedContent', undefined, MetaData.None);

    constructor()
    {
        super();
        // Land @DefaultTabControl (Template + ItemsPanel) so the header strip
        // and content slot materialise the moment the ctor returns.
        this.applyDefaultStyle();
        // Keep the content area in sync with the selection. Fires for user
        // clicks AND programmatic SelectedItem writes (e.g. a TwoWay
        // `SelectedItem=$ActiveDocument` binding re-activating a tab).
        this.AddSelectionChangedListener(() => this.updateSelectedContent());
    }

    public get SelectedContent(): unknown { return this.get_property_value(TabControl.SelectedContentKey); }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof TabItem;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const ti = new TabItem();
        this.bindTab(ti, item);
        return ti;
    }

    public override RebindContainerForItemOverride(container: Visual, item: unknown): void
    {
        if (container instanceof TabItem) this.bindTab(container, item);
        super.RebindContainerForItemOverride(container, item);
    }

    // Wire a data row onto its TabItem container.
    //   * Tag = item — so Selector.exposedValueOf yields the DATA row, making
    //     SelectedItem the row (not the container) and a TwoWay
    //     `SelectedItem=$Active` binding round-trip against real data.
    //   * A Visual row is slotted directly as the body (header stays empty).
    //   * A data row renders its tab HEADER through ItemTemplate (WPF
    //     semantics: TabControl.ItemTemplate templates the tab header) and
    //     also carries the row as Content so SelectedContent can present the
    //     matching body via DataType dispatch.
    private bindTab(ti: TabItem, item: unknown): void
    {
        ti.Tag = item;
        if (item instanceof Visual)
        {
            ti.Header         = undefined;
            ti.HeaderTemplate = undefined;
            ti.Content        = item;
            return;
        }
        ti.Header         = item;
        ti.HeaderTemplate = this.ItemTemplate;
        // A data row's Content is the payload the content area presents via
        // DataType dispatch (SelectedContent). Typed Model | Visual | undefined
        // on ContentControl; a data row is a Model.
        ti.Content        = item as Model;
    }

    private updateSelectedContent(): void
    {
        const sel = this.SelectedItem;
        const content = sel instanceof TabItem ? sel.Content : sel;
        this.set_property_value(TabControl.SelectedContentKey, content);
    }

    protected override validateDeclarativeChild(child: Visual): void
    {
        if (!(child instanceof TabItem))
        {
            throw new Error('TabControl only accepts TabItem children');
        }
    }
}

// One tab — Header is the label rendered in the strip; Content is the
// pane shown when this tab is selected. Mirrors ListBoxItem's mirror
// pattern for IsSelected so template triggers (`when (IsSelected)`)
// fire on the instance DP under Selector-driven selection updates.
// Header lives on HeaderedContentControl as `unknown`; TabItem's
// default template binds the strip label TextBlock to it and expects
// a string at runtime (consumers may also bind a VM + HeaderTemplate
// for richer chrome — same pattern WPF uses).
export class TabItem extends HeaderedContentControl
{
    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(
        TabItem, 'IsSelected', false, MetaData.Render);

    static {
        Model.OverrideMetadata(
            TabItem, Element.DefaultStyleKeyKey,
            { default_value: TabItem });
    }

    constructor()
    {
        super();
        // Land @DefaultTabItem (header ContentPresenter + selection chrome).
        this.applyDefaultStyle();
    }

    public get IsSelected(): boolean { return Selector.GetIsSelected(this); }
    public set IsSelected(v: boolean) { Selector.SetIsSelected(this, v); }
}

// MetaData re-export silencer for future-additions stability.
void MetaData;
