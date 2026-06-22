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

    public get IsSelected(): boolean { return Selector.GetIsSelected(this); }
    public set IsSelected(v: boolean) { Selector.SetIsSelected(this, v); }
}

// MetaData re-export silencer for future-additions stability.
void MetaData;
