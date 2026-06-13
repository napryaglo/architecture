import { MetaData, Model, Visual } from '../runtime/index.js';
import { ContentControl } from './content-control.js';
import { Selector } from './list/selector.js';

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
            TabControl, Visual.DefaultStyleKeyKey,
            { default_value: TabControl });
    }

    public override IsItemItsOwnContainerOverride(item: unknown): boolean
    {
        return item instanceof TabItem;
    }

    public override GetContainerForItemOverride(item: unknown): Visual
    {
        const ti = new TabItem();
        if (item instanceof Visual)
        {
            ti.Content = item;
        }
        else
        {
            ti.Header = String(item ?? '');
        }
        return ti;
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
export class TabItem extends ContentControl
{
    public static readonly HeaderKey = Model.RegisterProperty<string>(
        TabItem, 'Header', '', MetaData.Render);

    public static readonly IsSelectedKey = Model.RegisterProperty<boolean>(
        TabItem, 'IsSelected', false, MetaData.Render);

    static {
        Model.OverrideMetadata(
            TabItem, Visual.DefaultStyleKeyKey,
            { default_value: TabItem });
    }

    public get Header(): string { return this.get_property_value(TabItem.HeaderKey); }
    public set Header(v: string) { this.set_property_value(TabItem.HeaderKey, v); }

    public get IsSelected(): boolean { return Selector.GetIsSelected(this); }
    public set IsSelected(v: boolean) { Selector.SetIsSelected(this, v); }
}

// MetaData re-export silencer for future-additions stability.
void MetaData;
